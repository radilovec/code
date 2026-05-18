// AST-типы для DSL интерактивных видео-сценариев.
// Discriminated union по полю `kind` — стандартный TypeScript-паттерн,
// позволяющий exhaustive switch без приведения типов (type narrowing).

// ─────────────────────────────────────────────
// ПОЗИЦИЯ И ДИАПАЗОН (для диагностики ошибок)
// ─────────────────────────────────────────────

/** Позиция символа в исходном тексте. */
export interface Position {
  /** Номер строки, 1-based. */
  line: number;
  /** Номер столбца, 1-based. */
  column: number;
  /** Смещение в символах от начала файла, 0-based. */
  offset: number;
}

/** Диапазон в исходном тексте от start (включительно) до end (исключительно). */
export interface Span {
  start: Position;
  end: Position;
}

// ─────────────────────────────────────────────
// ВЫРАЖЕНИЯ (Expression nodes)
// ─────────────────────────────────────────────

/** Строковый литерал: "текст". */
export interface LiteralStringExpr {
  kind: 'LiteralString';
  value: string;
  span: Span;
}

/** Числовой литерал: 42, 3.14. */
export interface LiteralNumberExpr {
  kind: 'LiteralNumber';
  value: number;
  span: Span;
}

/** Булев литерал: true / false. */
export interface LiteralBoolExpr {
  kind: 'LiteralBool';
  value: boolean;
  span: Span;
}

/** Ссылка на переменную: varName. */
export interface VariableExpr {
  kind: 'Variable';
  name: string;
  span: Span;
}

/**
 * Бинарные арифметические и сравнительные операторы.
 * Выделены в отдельный тип от LogicalOperator — разный приоритет и семантика.
 */
export type BinaryOperator =
  | '+' | '-' | '*' | '/'     // арифметика
  | '==' | '!=' | '<' | '<=' | '>' | '>='; // сравнение

/**
 * Бинарное выражение: left op right.
 * Покрывает арифметику и сравнения.
 */
export interface BinaryOpExpr {
  kind: 'BinaryOp';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
  span: Span;
}

/**
 * Логические операторы.
 * Выделены отдельно от BinaryOp — интерпретатор реализует short-circuit evaluation:
 * `and`: не вычислять правый операнд, если левый false;
 * `or`:  не вычислять правый операнд, если левый true.
 */
export type LogicalOperator = 'and' | 'or';

/** Логическое выражение: left and/or right. */
export interface LogicalOpExpr {
  kind: 'LogicalOp';
  operator: LogicalOperator;
  left: Expression;
  right: Expression;
  span: Span;
}

/**
 * Унарное выражение.
 * `not`: логическое отрицание (not expr).
 * `-`:   арифметическое отрицание (-expr).
 */
export interface UnaryOpExpr {
  kind: 'UnaryOp';
  operator: 'not' | '-';
  operand: Expression;
  span: Span;
}

/** Объединение всех возможных узлов-выражений. */
export type Expression =
  | LiteralStringExpr
  | LiteralNumberExpr
  | LiteralBoolExpr
  | VariableExpr
  | BinaryOpExpr
  | LogicalOpExpr
  | UnaryOpExpr;

// ─────────────────────────────────────────────
// ИНСТРУКЦИИ внутри сцены (Statement nodes)
// ─────────────────────────────────────────────

/**
 * Присваивание переменной: set varName = expression.
 * Используется как внутри сцены, так и в глобальной области (VarDecl обёртывает AssignStmt).
 */
export interface AssignStmt {
  kind: 'Assign';
  variable: string;
  value: Expression;
  span: Span;
}

/**
 * Текстовый нарратив или реплика: text "...".
 * Опциональное поле `characterName` — для P1-фичи справочника персонажей.
 * Добавление поля не ломает существующий код: поле опциональное.
 */
export interface TextStmt {
  kind: 'Text';
  content: string;
  /** Имя персонажа, произносящего реплику. Опционально. */
  characterName?: string;
  span: Span;
}

/**
 * Привязка видео-сегмента к сцене: video "url" from N to M.
 * `from` и `to` — таймкоды в секундах (числа, не строки),
 * чтобы интерпретатор мог выполнять арифметику с ними напрямую.
 */
export interface VideoStmt {
  kind: 'Video';
  url: string;
  /** Таймкод начала сегмента в секундах. */
  from: number;
  /** Таймкод конца сегмента в секундах. */
  to: number;
  span: Span;
}

/**
 * Переход по выбору: choice "текст" -> targetScene [when condition].
 * Без `condition` — безусловный выбор, всегда отображается.
 * С `condition` — отображается только если условие true (фильтрация в плеере через интерпретатор).
 */
export interface ChoiceStmt {
  kind: 'Choice';
  /** Текст кнопки выбора. */
  label: string;
  /** Имя целевой сцены. */
  target: string;
  /** Условие отображения: when <condition>. Опционально. */
  condition?: Expression;
  span: Span;
}

/**
 * Условный блок: if condition { ... } [else { ... }].
 * `thenBranch` и `elseBranch` — полноценные списки инструкций,
 * что позволяет вкладывать if-ы произвольно.
 */
export interface IfStmt {
  kind: 'If';
  condition: Expression;
  thenBranch: Statement[];
  /** Ветка else. Опционально. */
  elseBranch?: Statement[];
  span: Span;
}

/**
 * Безусловный переход без выбора игрока: goto targetScene.
 * Используется для линейных переходов между сценами без вмешательства пользователя.
 */
export interface GoToStmt {
  kind: 'GoTo';
  /** Имя целевой сцены. */
  target: string;
  span: Span;
}

/** Объединение всех возможных узлов-инструкций внутри сцены. */
export type Statement =
  | AssignStmt
  | TextStmt
  | VideoStmt
  | ChoiceStmt
  | IfStmt
  | GoToStmt;

// ─────────────────────────────────────────────
// ВЕРХНЕУРОВНЕВЫЕ ОБЪЯВЛЕНИЯ (Declaration nodes)
// ─────────────────────────────────────────────

/**
 * Объявление сцены: scene sceneName { ... }.
 * `body` — список инструкций, определяющих поведение сцены:
 * видео-сегмент, нарратив, выборы, условные блоки.
 */
export interface SceneDecl {
  kind: 'Scene';
  /** Уникальное имя сцены (используется как ID в доменной модели). */
  name: string;
  body: Statement[];
  span: Span;
}

/**
 * Объявление персонажа: character name { description "..." }.
 * Используется для построения справочника персонажей (P1).
 * Описание — свободный текст, не парсится дальше.
 */
export interface CharacterDecl {
  kind: 'Character';
  /** Уникальное имя персонажа. */
  name: string;
  /** Текстовое описание персонажа. */
  description: string;
  span: Span;
}

/**
 * Объявление глобальной переменной: set varName = initialValue.
 * Глобальные переменные объявляются вне сцен — в начале сценария.
 * Хранит начальное значение как Expression (а не как bare value),
 * чтобы парсер мог принять любое валидное выражение-литерал.
 */
export interface VarDecl {
  kind: 'VarDecl';
  /** Имя переменной. */
  variable: string;
  /** Начальное значение: должно быть литералом (проверяет анализатор). */
  initialValue: Expression;
  span: Span;
}

/** Объединение всех верхнеуровневых объявлений программы. */
export type Declaration = SceneDecl | CharacterDecl | VarDecl;

// ─────────────────────────────────────────────
// КОРЕНЬ AST
// ─────────────────────────────────────────────

/**
 * Корневой узел AST — программа целиком.
 * Список объявлений (сцены, персонажи, глобальные переменные)
 * в том порядке, в котором они встречаются в исходном тексте.
 */
export interface ProgramNode {
  kind: 'Program';
  declarations: Declaration[];
  span: Span;
}
