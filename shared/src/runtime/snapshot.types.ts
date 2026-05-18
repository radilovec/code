// Типы runtime-снапшота — T2.8.
//
// Runtime-снапшот — это компактный иммутабельный JSON, который отдаётся
// плееру после публикации. Содержит только данные, необходимые для
// воспроизведения: сцены, переходы, условия (как AST), начальное состояние.
//
// Разделение authoring и runtime взято из подхода Netflix — Shakti
// отдаёт path-based выдачу runtime-данных, не редакторскую модель
// (source.md, раздел Netflix Bandersnatch / Shakti / Falcor).

import type { Expression } from '../dsl/ast.types.js';

// ─────────────────────────────────────────────
// RUNTIME CHOICE — выбор в снапшоте
// ─────────────────────────────────────────────

/**
 * Вариант выбора в runtime-снапшоте.
 * `conditionAst` — оригинальный AST-узел, который интерпретатор
 * вычисляет при каждом показе выбора. Если null — выбор безусловный.
 */
export interface RuntimeChoice {
  /** Текст кнопки выбора. */
  label: string;
  /** ID целевой сцены. */
  target: string;
  /** AST условия отображения (из when-clause). null = безусловный. */
  conditionAst: Expression | null;
}

// ─────────────────────────────────────────────
// RUNTIME SCENE — сцена в снапшоте
// ─────────────────────────────────────────────

/**
 * Сцена в runtime-снапшоте.
 * Убраны метаданные редактора (name, type, unreachable, mentionedCharacters).
 * Оставлено только то, что нужно плееру для воспроизведения.
 */
export interface RuntimeScene {
  /** Уникальный ID сцены. */
  id: string;
  /** Нарративный текст (первый из texts[], остальные — для редактора). null если нет. */
  text: string | null;
  /** Видео-сегмент. null если сцена без видео. */
  video: { url: string; startSec: number; endSec: number } | null;
  /** Варианты выбора. Пустой массив = концовка (ending). */
  choices: RuntimeChoice[];
  /** Безусловный автопереход (из goto). undefined = нет. */
  autoTransition?: string;
}

// ─────────────────────────────────────────────
// RUNTIME SNAPSHOT — корневой объект
// ─────────────────────────────────────────────

/**
 * Runtime-снапшот — иммутабельный JSON для плеера.
 *
 * Формируется при публикации (T3.5) из доменной модели (Scenario).
 * Сохраняется в БД как PublishedSnapshot.runtimeJson.
 * Отдаётся плееру через GET /runtime/:publicId (T3.6).
 *
 * Отличия от authoring-модели (Scenario):
 * - `Record<string, T>` вместо `Map<string, T>` (JSON-сериализуемо).
 * - Только достижимые сцены (unreachable отфильтрованы).
 * - Нет метаданных: characters, displayText условий, SceneType, graph nodes.
 * - Условия хранятся как AST (conditionAst), а не как Condition-обёртка.
 * - initialState — плоский словарь начальных значений переменных.
 */
export interface RuntimeSnapshot {
  /** Номер версии снапшота (инкрементируется при каждой публикации). */
  version: number;
  /** ISO-дата публикации. */
  publishedAt: string;
  /** Начальное состояние переменных (для инициализации RuntimeState в плеере). */
  initialState: Record<string, number | string | boolean>;
  /** ID первой сцены, с которой начинается воспроизведение. */
  startSceneId: string;
  /** Все достижимые сцены, ключ — id сцены. */
  scenes: Record<string, RuntimeScene>;
}
