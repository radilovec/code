import { Injectable, signal, computed } from '@angular/core';
import {
  tokenize,
  parse,
  analyze,
  buildScenario,
} from '@interactive-video/shared';
import type { Scenario, Diagnostic, Declaration } from '@interactive-video/shared';

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
