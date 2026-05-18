// Общая утилита BFS-достижимости сцен.
// Используется и в analyzer.ts (для предупреждений), и в builder.ts
// (для поля Scene.unreachable). Вынесена, чтобы устранить дублирование.

import type { Statement, SceneDecl } from './ast.types.js';

/**
 * Рекурсивно собирает все целевые сцены (из Choice и GoTo) из тела сцены.
 */
export function collectTargets(stmts: Statement[], result: Set<string>): void {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Choice':
        result.add(stmt.target);
        break;
      case 'GoTo':
        result.add(stmt.target);
        break;
      case 'If':
        collectTargets(stmt.thenBranch, result);
        if (stmt.elseBranch !== undefined) {
          collectTargets(stmt.elseBranch, result);
        }
        break;
    }
  }
}

/**
 * Определяет множество сцен, достижимых из стартовой через BFS.
 *
 * @param sceneDecls — все объявления сцен из AST
 * @param startSceneId — имя стартовой сцены (первая объявленная)
 * @returns Set имён достижимых сцен
 */
export function computeReachable(
  sceneDecls: SceneDecl[],
  startSceneId: string,
): Set<string> {
  // Строим граф переходов: sceneName → Set<targetSceneName>
  const graph = new Map<string, Set<string>>();
  for (const scene of sceneDecls) {
    const targets = new Set<string>();
    collectTargets(scene.body, targets);
    graph.set(scene.name, targets);
  }

  // BFS от стартовой сцены
  const reachable = new Set<string>();
  const queue: string[] = [startSceneId];
  reachable.add(startSceneId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = graph.get(current);
    if (targets !== undefined) {
      for (const target of targets) {
        if (!reachable.has(target) && graph.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
  }

  return reachable;
}
