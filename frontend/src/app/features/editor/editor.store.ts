import { Injectable, signal, computed } from '@angular/core';
import {
  tokenize,
  parse,
  analyze,
  buildScenario,
} from '@interactive-video/shared';
import type { Scenario, Diagnostic, Declaration, Scene } from '@interactive-video/shared';

/** Metrics computed from the parsed scenario. */
export interface ScenarioMetrics {
  totalScenes: number;
  endings: number;
  choices: number;
  variables: number;
  characters: number;
  unreachable: number;
  maxDepth: number;
}

/** BFS max depth over domain scenes. */
function computeMaxDepthFromScenario(scenario: Scenario): number {
  const startId = scenario.startSceneId;
  if (!scenario.scenes.has(startId)) return 0;

  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);
  let depth = 0;

  while (queue.length > 0) {
    const levelSize = queue.length;
    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!;
      const scene = scenario.scenes.get(current);
      if (!scene) continue;
      // Collect targets from choices and autoTransition
      const targets: string[] = scene.choices.map(c => c.targetSceneId);
      if (scene.autoTransitionTo) targets.push(scene.autoTransitionTo);
      for (const t of targets) {
        if (!visited.has(t) && scenario.scenes.has(t)) {
          visited.add(t);
          queue.push(t);
        }
      }
    }
    if (queue.length > 0) depth++;
  }

  return depth;
}

/**
 * Editor store — signal-based reactive state for the DSL editor.
 *
 * Pipeline: dslText → tokenize → parse → analyze → buildScenario
 *
 * Provided at the EditorPageComponent level (not root) so each editor
 * instance gets its own store.
 */
@Injectable()
export class EditorStore {
  /** Raw DSL text from Monaco. */
  readonly dslText = signal('');

  /** Parsed domain model (Scenario). Null until first successful parse. */
  readonly parsedModel = signal<Scenario | null>(null);

  /** All diagnostics: parse errors + semantic warnings/errors. */
  readonly diagnostics = signal<Diagnostic[]>([]);

  /** Currently selected scene ID (from side-panel or graph click). */
  readonly selectedSceneId = signal<string | null>(null);

  // ── Derived signals ──

  readonly scenes = computed(() => {
    const model = this.parsedModel();
    if (!model) return [];
    return Array.from(model.scenes.values());
  });

  readonly variables = computed(() => {
    const model = this.parsedModel();
    if (!model) return [];
    return Array.from(model.variables.values());
  });

  readonly characters = computed(() => {
    const model = this.parsedModel();
    if (!model) return [];
    return Array.from(model.characters.values());
  });

  readonly errors = computed(() =>
    this.diagnostics().filter(d => d.severity === 'error'),
  );

  readonly warnings = computed(() =>
    this.diagnostics().filter(d => d.severity === 'warning'),
  );

  readonly selectedScene = computed(() => {
    const id = this.selectedSceneId();
    const model = this.parsedModel();
    if (!id || !model) return null;
    return model.scenes.get(id) ?? null;
  });

  /** Aggregated metrics for the analytics panel. */
  readonly metrics = computed<ScenarioMetrics | null>(() => {
    const model = this.parsedModel();
    if (!model) return null;
    const scenes = Array.from(model.scenes.values());
    const totalChoices = scenes.reduce((sum, s) => sum + s.choices.length, 0);
    const unreachable = scenes.filter(s => s.unreachable).length;
    const endings = scenes.filter(s => s.type === 'ending').length;
    return {
      totalScenes: scenes.length,
      endings,
      choices: totalChoices,
      variables: model.variables.size,
      characters: model.characters.size,
      unreachable,
      maxDepth: computeMaxDepthFromScenario(model),
    };
  });

  /** List of unreachable scenes (for analytics warning). */
  readonly unreachableScenes = computed<Scene[]>(() => {
    const model = this.parsedModel();
    if (!model) return [];
    return Array.from(model.scenes.values()).filter(s => s.unreachable);
  });

  /**
   * Update DSL text and re-run the full pipeline.
   * Called on every content change from Monaco.
   */
  updateDsl(text: string): void {
    this.dslText.set(text);

    if (!text.trim()) {
      this.parsedModel.set(null);
      this.diagnostics.set([]);
      return;
    }

    const tokens = tokenize(text);
    const { program, errors: parseErrors } = parse(tokens);
    const semanticErrors = analyze(program);
    const allDiagnostics = [...parseErrors, ...semanticErrors];

    this.diagnostics.set(allDiagnostics);

    // Build domain model even if there are warnings —
    // only skip on fatal parse errors that produce an empty AST.
    const hasScenes = program.declarations.some(
      (d: Declaration) => d.kind === 'Scene',
    );
    if (hasScenes) {
      const scenario = buildScenario(program);
      this.parsedModel.set(scenario);
    } else {
      this.parsedModel.set(null);
    }
  }

  selectScene(sceneId: string | null): void {
    this.selectedSceneId.set(sceneId);
  }
}
