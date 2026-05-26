import { graphlib, layout } from '@dagrejs/dagre';
import type { Scenario, Scene } from '@interactive-video/shared';

/** Saved layout: maps scene ID → top-left corner position. */
export type LayoutData = Record<string, { x: number; y: number }>;

/** Node dimensions per visual type (must match graph-view.component.scss). */
const SCENE_W = 188;
const SCENE_H = 88;
const CHOICE_W = 120;
const CHOICE_H = 120;
const COND_W = 170;
const COND_H = 64;
const END_W = 170;
const END_H = 60;

/**
 * Determine dagre node dimensions for a scene based on its content.
 * Mirrors the type-detection logic in GraphViewComponent.nodes().
 */
function getNodeSize(scene: Scene): { width: number; height: number } {
  if (scene.type === 'ending') {
    return { width: END_W, height: END_H };
  }
  if (scene.video) {
    return { width: SCENE_W, height: SCENE_H };
  }
  if (scene.choices.some(c => c.condition !== undefined)) {
    return { width: COND_W, height: COND_H };
  }
  return { width: CHOICE_W, height: CHOICE_H };
}

/**
 * Compute a left-to-right dagre layout for the given scenario.
 * Returns a map of scene ID → { x, y } top-left corner (Foblex coordinate system).
 */
export function layoutGraph(scenario: Scenario): LayoutData {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120, marginx: 60, marginy: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const scene of scenario.scenes.values()) {
    const { width, height } = getNodeSize(scene);
    g.setNode(scene.id, { width, height });
  }

  for (const scene of scenario.scenes.values()) {
    for (const choice of scene.choices) {
      if (scenario.scenes.has(choice.targetSceneId)) {
        g.setEdge(scene.id, choice.targetSceneId);
      }
    }
    if (scene.autoTransitionTo && scenario.scenes.has(scene.autoTransitionTo)) {
      g.setEdge(scene.id, scene.autoTransitionTo);
    }
  }

  layout(g);

  const result: LayoutData = {};
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    // dagre positions nodes by center; Foblex Flow uses top-left corner
    result[nodeId] = { x: node.x - node.width / 2, y: node.y - node.height / 2 };
  }
  return result;
}
