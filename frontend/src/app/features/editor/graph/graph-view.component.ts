import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  FFlowComponent,
  FCanvasComponent,
  FZoomDirective,
  FBackgroundComponent,
  FCirclePatternComponent,
  FFlowModule,
} from '@foblex/flow';
import type { Scenario, GraphEdge } from '@interactive-video/shared';
import { layoutGraph, type LayoutData } from './dagre-layout';

/** Extended graph node with display metadata for the template. */
interface DisplayNode {
  id: string;
  type: 'scene' | 'choice' | 'condition' | 'ending';
  label: string;
  sub: string;
  meta: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unreachable: boolean;
}

/** Scene node dimensions (must match dagre-layout.ts and graph-view.component.scss). */
const SCENE_W = 188;
const SCENE_H = 88;
/** Choice (diamond) node dimensions. */
const CHOICE_W = 120;
const CHOICE_H = 120;
/** Condition (hex) node dimensions. */
const COND_W = 170;
const COND_H = 64;
/** Ending (pill) node dimensions. */
const END_W = 170;
const END_H = 60;

@Component({
  selector: 'app-graph-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowComponent,
    FCanvasComponent,
    FZoomDirective,
    FBackgroundComponent,
    FCirclePatternComponent,
    FFlowModule,
  ],
  templateUrl: './graph-view.component.html',
  styleUrl: './graph-view.component.scss',
})
export class GraphViewComponent {
  readonly model = input<Scenario | null>(null);
  readonly selectedSceneId = input<string | null>(null);
  /** Previously saved layout positions from the backend. */
  readonly savedLayout = input<LayoutData | null>(null);

  readonly sceneSelected = output<string>();
  /** Emitted when a fresh dagre layout is computed (no usable saved layout). */
  readonly layoutReady = output<LayoutData>();

  private readonly fFlow = viewChild(FFlowComponent);

  constructor() {
    // Redraw Foblex after every (re-)mount. afterNextRender fires at the end of
    // the SAME CD cycle that creates the component (via @if), when fNode elements
    // are already in the DOM. This fixes the "graph empty after tab switch" bug.
    afterNextRender(() => {
      this.fFlow()?.redraw();
    });

    // When nodes/edges change while the graph tab is visible, redraw connections.
    // setTimeout(0) defers until after Angular's synchronous CD cycle completes.
    effect(() => {
      const nodes = this.nodes();
      const edges = this.edges();
      if (nodes.length > 0 || edges.length > 0) {
        setTimeout(() => this.fFlow()?.redraw(), 0);
      }
    });

    // Emit fresh dagre layout so the parent can persist it.
    effect(() => {
      const layout = this.computedLayout();
      if (layout.isNew && Object.keys(layout.data).length > 0) {
        this.layoutReady.emit(layout.data);
      }
    });
  }

  /**
   * Layout data for this render.
   * Uses savedLayout if all current scenes are covered; otherwise runs dagre.
   */
  private readonly computedLayout = computed<{ data: LayoutData; isNew: boolean }>(() => {
    const scenario = this.model();
    if (!scenario) return { data: {}, isNew: false };

    const saved = this.savedLayout();
    if (saved) {
      const allCovered = Array.from(scenario.scenes.keys()).every(id => id in saved);
      if (allCovered) {
        return { data: saved, isNew: false };
      }
    }

    return { data: layoutGraph(scenario), isNew: true };
  });

  /** Nodes derived from the Scenario model, positioned by dagre or savedLayout. */
  readonly nodes = computed<DisplayNode[]>(() => {
    const scenario = this.model();
    if (!scenario) return [];

    const positions = this.computedLayout().data;

    return Array.from(scenario.scenes.values()).map(scene => {
      const pos = positions[scene.id] ?? { x: 60, y: 80 };

      let type: 'scene' | 'choice' | 'condition' | 'ending';
      let width: number;
      let height: number;
      let sub = '';
      let meta = '';

      if (scene.type === 'ending') {
        type = 'ending'; width = END_W; height = END_H;
        sub = 'ending';
      } else if (scene.choices.length > 0) {
        const allConditional = scene.choices.every(c => c.condition !== undefined);
        if (allConditional) {
          type = 'condition'; width = COND_W; height = COND_H;
          sub = 'if · else';
        } else {
          type = 'choice'; width = CHOICE_W; height = CHOICE_H;
          const first = scene.choices[0];
          sub = first ? `→ ${first.targetSceneId}` : '';
        }
      } else {
        // scene with video/text/goto but no player choices — regular rect
        type = 'scene'; width = SCENE_W; height = SCENE_H;
        sub = scene.texts[0] ?? '';
      }

      // Video metadata shown for any type that has video
      if (scene.video) {
        meta = this.formatTimecodes(scene.video.from, scene.video.to);
      }

      return {
        id: scene.id,
        type,
        label: scene.name,
        sub,
        meta,
        x: pos.x,
        y: pos.y,
        width,
        height,
        unreachable: scene.unreachable,
      };
    });
  });

  /** Edges derived from the Scenario model. */
  readonly edges = computed<GraphEdge[]>(() => {
    const scenario = this.model();
    if (!scenario) return [];

    const result: GraphEdge[] = [];
    for (const scene of scenario.scenes.values()) {
      for (const choice of scene.choices) {
        if (scenario.scenes.has(choice.targetSceneId)) {
          result.push({
            id: `${scene.id}__${choice.targetSceneId}__${choice.label}`,
            sourceId: scene.id,
            targetId: choice.targetSceneId,
            label: choice.label,
            hasCondition: !!choice.condition,
          });
        }
      }
      if (scene.autoTransitionTo && scenario.scenes.has(scene.autoTransitionTo)) {
        result.push({
          id: `${scene.id}__${scene.autoTransitionTo}__auto`,
          sourceId: scene.id,
          targetId: scene.autoTransitionTo,
          label: undefined,
          hasCondition: false,
        });
      }
    }
    return result;
  });

  onNodeClick(nodeId: string): void {
    this.sceneSelected.emit(nodeId);
  }

  private formatTimecodes(from: number, to: number): string {
    const fmt = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };
    const dur = to - from;
    return `${fmt(from)} → ${fmt(to)} · ${dur}s`;
  }

  onNodePositionChange(nodeId: string, position: { x: number; y: number }): void {
    const current = { ...this.computedLayout().data };
    current[nodeId] = { x: position.x, y: position.y };
    this.layoutReady.emit(current);
  }
}
