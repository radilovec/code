// Сборщик runtime-снапшота — T2.8.
//
// Преобразует доменную модель (Scenario) в компактный иммутабельный JSON
// (RuntimeSnapshot), который сохраняется в БД при публикации и отдаётся
// плееру для воспроизведения.
//
// Принцип разделения authoring и runtime взят из подхода Netflix:
// Shakti отдаёт path-based выдачу runtime-данных, не редакторскую модель.
// Authoring-модель (DSL + кэш доменной модели) хранится в Project.dslText.
// При публикации формируется компактный иммутабельный runtime-снапшот
// (PublishedSnapshot.runtimeJson), который и используется плеером.

import type { Scenario, Scene, Choice } from '../domain/model.types.js';
import type {
  RuntimeSnapshot,
  RuntimeScene,
  RuntimeChoice,
} from './snapshot.types.js';

// ─────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────────

/**
 * Конвертирует Choice (доменная модель) в RuntimeChoice (снапшот).
 * Убирает displayText из Condition, оставляя только AST-выражение
 * для интерпретатора плеера.
 */
function convertChoice(choice: Choice): RuntimeChoice {
  return {
    label: choice.label,
    target: choice.targetSceneId,
    conditionAst: choice.condition !== undefined ? choice.condition.expression : null,
  };
}

/**
 * Конвертирует Scene (доменная модель) в RuntimeScene (снапшот).
 * Убирает метаданные редактора: name, type, unreachable.
 * Видео-сегмент переименовывает поля from/to → startSec/endSec
 * для единообразия с RuntimeSnapshot API.
 */
function convertScene(scene: Scene): RuntimeScene {
  const runtimeScene: RuntimeScene = {
    id: scene.id,
    text: scene.texts.length > 0 ? scene.texts.join('\n') : null,
    video: scene.video !== undefined
      ? { url: scene.video.url, startSec: scene.video.from, endSec: scene.video.to }
      : null,
    choices: scene.choices.map(convertChoice),
  };

  if (scene.autoTransitionTo !== undefined) {
    runtimeScene.autoTransition = scene.autoTransitionTo;
  }

  return runtimeScene;
}

// ─────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────

/**
 * Собирает runtime-снапшот из доменной модели.
 *
 * Шаги:
 * 1. Формирует `initialState` из переменных Scenario (Map → Record).
 * 2. Фильтрует только достижимые сцены (unreachable === false).
 * 3. Конвертирует каждую сцену в RuntimeScene (убирает метаданные).
 * 4. Записывает текущую дату и версию.
 *
 * @param scenario — доменная модель из builder'а (T2.6)
 * @param version — номер версии (инкрементируется бэкендом при публикации)
 * @returns RuntimeSnapshot — готовый к JSON.stringify и сохранению в БД
 *
 * Использование на бэкенде (T3.5):
 * ```typescript
 * const tokens = tokenize(project.dslText);
 * const { program } = parse(tokens);
 * const scenario = buildScenario(program);
 * const snapshot = buildSnapshot(scenario, nextVersion);
 * await prisma.publishedSnapshot.create({
 *   data: { projectId, version: nextVersion, runtimeJson: snapshot }
 * });
 * ```
 */
export function buildSnapshot(
  scenario: Scenario,
  version: number,
): RuntimeSnapshot {
  // ── 1. Начальное состояние переменных: Map → Record ──
  const initialState: Record<string, number | string | boolean> = {};
  for (const [name, variable] of scenario.variables) {
    initialState[name] = variable.initialValue;
  }

  // ── 2-3. Фильтрация достижимых сцен и конвертация ──
  const scenes: Record<string, RuntimeScene> = {};
  for (const [id, scene] of scenario.scenes) {
    // Включаем только достижимые сцены
    if (!scene.unreachable) {
      scenes[id] = convertScene(scene);
    }
  }

  // ── 4. Сборка снапшота ──
  return {
    version,
    publishedAt: new Date().toISOString(),
    initialState,
    startSceneId: scenario.startSceneId,
    scenes,
  };
}
