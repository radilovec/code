// Builder доменной модели — T2.6.
//
// Преобразует AST (ProgramNode из парсера) в доменную модель (Scenario).
// Builder строит структуру, НЕ проверяет семантику — это ответственность
// анализатора (T2.5). Поле `unreachable` заполняется builder'ом
// самостоятельно через BFS от первой сцены.
//
// Принцип из source.md: twine-parser демонстрирует pipeline «текст →
// объект → граф». Builder — шаг между AST (объектом) и доменной моделью,
// из которой строится граф (Foblex Flow + dagre).

import type {
  ProgramNode,
  SceneDecl,
  CharacterDecl,
  VarDecl,
  Statement,
  Expression,
  ChoiceStmt,
  GoToStmt,
  IfStmt,
  TextStmt,
  VideoStmt,
  AssignStmt,
} from '../dsl/ast.types.js';

import type {
  Scenario,
  Scene,
  SceneType,
  Choice,
  Condition,
  Variable,
  VariableType,
  Character,
  VideoSegment,
} from './model.types.js';

// ─────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────────

/**
 * Генерирует человекочитаемое строковое представление выражения AST.
 * Используется для `Condition.displayText` — показывается в UI рядом с
 * кнопкой выбора, чтобы автор видел условие без обращения к DSL.
 */
function expressionToDisplayText(expr: Expression): string {
  switch (expr.kind) {
    case 'LiteralString':
      return `"${expr.value}"`;
    case 'LiteralNumber':
      return String(expr.value);
    case 'LiteralBool':
      return String(expr.value);
    case 'Variable':
      return expr.name;
    case 'BinaryOp':
      return `${expressionToDisplayText(expr.left)} ${expr.operator} ${expressionToDisplayText(expr.right)}`;
    case 'LogicalOp':
      return `${expressionToDisplayText(expr.left)} ${expr.operator} ${expressionToDisplayText(expr.right)}`;
    case 'UnaryOp':
      if (expr.operator === 'not') {
        return `not ${expressionToDisplayText(expr.operand)}`;
      }
      return `-${expressionToDisplayText(expr.operand)}`;
  }
}

/**
 * Выводит тип переменной из литерального выражения начального значения.
 * Если выражение не является литералом — fallback на 'number'.
 */
function inferVariableType(expr: Expression): VariableType {
  switch (expr.kind) {
    case 'LiteralString':  return 'string';
    case 'LiteralNumber':  return 'number';
    case 'LiteralBool':    return 'boolean';
    default:               return 'number';
  }
}

/**
 * Извлекает начальное значение из литерального выражения.
 * Если выражение не литерал — fallback на 0.
 */
function extractInitialValue(expr: Expression): string | number | boolean {
  switch (expr.kind) {
    case 'LiteralString':  return expr.value;
    case 'LiteralNumber':  return expr.value;
    case 'LiteralBool':    return expr.value;
    default:               return 0;
  }
}

// ─────────────────────────────────────────────
// СБОРКА CHOICES ИЗ ТЕЛА СЦЕНЫ
// ─────────────────────────────────────────────

/**
 * Рекурсивно собирает все Choice из списка Statement'ов.
 * Обходит вложенные if/else — choices внутри условных блоков
 * тоже попадают в массив (условие if становится частью контекста,
 * но в доменной модели choice хранит только свой собственный when-condition).
 */
function collectChoices(stmts: Statement[]): Choice[] {
  const choices: Choice[] = [];

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Choice':
        choices.push(buildChoice(stmt));
        break;
      case 'If':
        choices.push(...collectChoices(stmt.thenBranch));
        if (stmt.elseBranch !== undefined) {
          choices.push(...collectChoices(stmt.elseBranch));
        }
        break;
      // Остальные statement'ы не содержат choices
    }
  }

  return choices;
}

/** Преобразует ChoiceStmt (AST) в Choice (доменная модель). */
function buildChoice(stmt: ChoiceStmt): Choice {
  const choice: Choice = {
    label: stmt.label,
    targetSceneId: stmt.target,
  };

  if (stmt.condition !== undefined) {
    choice.condition = {
      expression: stmt.condition,
      displayText: expressionToDisplayText(stmt.condition),
    };
  }

  return choice;
}

// ─────────────────────────────────────────────
// СБОРКА ТЕКСТОВ И ВИДЕО ИЗ ТЕЛА СЦЕНЫ
// ─────────────────────────────────────────────

/** Рекурсивно собирает все текстовые фрагменты (TextStmt.content) из тела сцены. */
function collectTexts(stmts: Statement[]): string[] {
  const texts: string[] = [];

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Text':
        texts.push(stmt.content);
        break;
      case 'If':
        texts.push(...collectTexts(stmt.thenBranch));
        if (stmt.elseBranch !== undefined) {
          texts.push(...collectTexts(stmt.elseBranch));
        }
        break;
    }
  }

  return texts;
}

/** Находит первый VideoStmt в теле сцены (рекурсивно). */
function findVideo(stmts: Statement[]): VideoSegment | undefined {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Video':
        return { url: stmt.url, from: stmt.from, to: stmt.to };
      case 'If': {
        const inThen = findVideo(stmt.thenBranch);
        if (inThen !== undefined) return inThen;
        if (stmt.elseBranch !== undefined) {
          const inElse = findVideo(stmt.elseBranch);
          if (inElse !== undefined) return inElse;
        }
        break;
      }
    }
  }
  return undefined;
}

/** Находит первый GoToStmt в теле сцены (рекурсивно). */
function findGoTo(stmts: Statement[]): string | undefined {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'GoTo':
        return stmt.target;
      case 'If': {
        const inThen = findGoTo(stmt.thenBranch);
        if (inThen !== undefined) return inThen;
        if (stmt.elseBranch !== undefined) {
          const inElse = findGoTo(stmt.elseBranch);
          if (inElse !== undefined) return inElse;
        }
        break;
      }
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────
// СБОР УПОМИНАНИЙ ПЕРСОНАЖЕЙ
// ─────────────────────────────────────────────

/**
 * Рекурсивно собирает имена персонажей, упомянутых в TextStmt.characterName
 * внутри тела сцены.
 */
function collectCharacterMentions(stmts: Statement[]): Set<string> {
  const mentions = new Set<string>();

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Text':
        if (stmt.characterName !== undefined) {
          mentions.add(stmt.characterName);
        }
        break;
      case 'If':
        for (const name of collectCharacterMentions(stmt.thenBranch)) {
          mentions.add(name);
        }
        if (stmt.elseBranch !== undefined) {
          for (const name of collectCharacterMentions(stmt.elseBranch)) {
            mentions.add(name);
          }
        }
        break;
    }
  }

  return mentions;
}

// ─────────────────────────────────────────────
// АНАЛИЗ ДОСТИЖИМОСТИ (BFS)
// ─────────────────────────────────────────────

/**
 * Рекурсивно собирает все целевые сцены (из Choice и GoTo) из тела сцены.
 */
function collectTargets(stmts: Statement[]): Set<string> {
  const targets = new Set<string>();

  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'Choice':
        targets.add(stmt.target);
        break;
      case 'GoTo':
        targets.add(stmt.target);
        break;
      case 'If':
        for (const t of collectTargets(stmt.thenBranch)) {
          targets.add(t);
        }
        if (stmt.elseBranch !== undefined) {
          for (const t of collectTargets(stmt.elseBranch)) {
            targets.add(t);
          }
        }
        break;
    }
  }

  return targets;
}

/**
 * Определяет множество сцен, достижимых из стартовой через BFS.
 */
function computeReachable(
  sceneDecls: SceneDecl[],
  startSceneId: string,
): Set<string> {
  // Строим граф переходов: sceneName → Set<targetSceneName>
  const graph = new Map<string, Set<string>>();
  for (const scene of sceneDecls) {
    graph.set(scene.name, collectTargets(scene.body));
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

// ─────────────────────────────────────────────
// ОПРЕДЕЛЕНИЕ ТИПА СЦЕНЫ
// ─────────────────────────────────────────────

/**
 * Определяет тип сцены по наличию choices и autoTransitionTo.
 * - 'ending' — нет исходящих переходов (ни choices, ни goto).
 * - 'choice' — есть явные choices.
 * - 'normal' — есть автопереход (goto) без choices.
 */
function determineSceneType(
  choices: Choice[],
  autoTransitionTo: string | undefined,
): SceneType {
  if (choices.length === 0 && autoTransitionTo === undefined) {
    return 'ending';
  }
  if (choices.length > 0) {
    return 'choice';
  }
  return 'normal';
}

// ─────────────────────────────────────────────
// ГЛАВНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────

/**
 * Преобразует AST программы (ProgramNode) в доменную модель (Scenario).
 *
 * Pipeline: DSL-текст → лексер → токены → парсер → **AST** → **builder** → Scenario.
 *
 * Builder выполняет следующие шаги:
 * 1. Собирает глобальные переменные (VarDecl → Variable).
 * 2. Собирает персонажей (CharacterDecl → Character).
 * 3. Строит сцены (SceneDecl → Scene) с choices, texts, video, goto.
 * 4. Вычисляет `mentionedInScenes` для каждого персонажа.
 * 5. Определяет `startSceneId` (первая объявленная сцена).
 * 6. Вычисляет достижимость сцен через BFS и проставляет `unreachable`.
 *
 * @param program — AST программы из парсера (parse())
 * @returns доменная модель Scenario
 *
 * Использование:
 * ```typescript
 * import { tokenize } from '../dsl/lexer.js';
 * import { parse } from '../dsl/parser.js';
 * import { buildScenario } from './builder.js';
 *
 * const tokens = tokenize(source);
 * const { program } = parse(tokens);
 * const scenario = buildScenario(program);
 * ```
 */
export function buildScenario(program: ProgramNode): Scenario {
  // ── 1. Собрать глобальные переменные ──
  const variables = new Map<string, Variable>();
  const varDecls = program.declarations.filter(
    (d): d is VarDecl => d.kind === 'VarDecl',
  );
  for (const decl of varDecls) {
    variables.set(decl.variable, {
      name: decl.variable,
      type: inferVariableType(decl.initialValue),
      initialValue: extractInitialValue(decl.initialValue),
    });
  }

  // ── 2. Собрать персонажей ──
  const characters = new Map<string, Character>();
  const charDecls = program.declarations.filter(
    (d): d is CharacterDecl => d.kind === 'Character',
  );
  for (const decl of charDecls) {
    characters.set(decl.name, {
      name: decl.name,
      description: decl.description,
      mentionedInScenes: [], // заполним на шаге 4
    });
  }

  // ── 3. Собрать сцены ──
  const sceneDecls = program.declarations.filter(
    (d): d is SceneDecl => d.kind === 'Scene',
  );

  const startSceneId = sceneDecls.length > 0 ? sceneDecls[0]!.name : '';

  // Вычислить достижимость заранее (нужно для шага 3)
  const reachable = startSceneId !== ''
    ? computeReachable(sceneDecls, startSceneId)
    : new Set<string>();

  const scenes = new Map<string, Scene>();
  // Для шага 4: sceneId → Set<characterName>
  const sceneMentions = new Map<string, Set<string>>();

  for (const decl of sceneDecls) {
    const choices = collectChoices(decl.body);
    const autoTransitionTo = findGoTo(decl.body);
    const sceneType = determineSceneType(choices, autoTransitionTo);
    const video = findVideo(decl.body);
    const texts = collectTexts(decl.body);
    const mentions = collectCharacterMentions(decl.body);

    sceneMentions.set(decl.name, mentions);

    const scene: Scene = {
      id: decl.name,
      name: decl.name,
      type: sceneType,
      texts,
      choices,
      unreachable: !reachable.has(decl.name),
    };

    if (video !== undefined) {
      scene.video = video;
    }

    if (autoTransitionTo !== undefined) {
      scene.autoTransitionTo = autoTransitionTo;
    }

    scenes.set(decl.name, scene);
  }

  // ── 4. Заполнить mentionedInScenes для персонажей ──
  for (const [sceneId, mentions] of sceneMentions) {
    for (const charName of mentions) {
      const character = characters.get(charName);
      if (character !== undefined) {
        character.mentionedInScenes.push(sceneId);
      }
    }
  }

  // ── 5. Вернуть Scenario ──
  return {
    startSceneId,
    scenes,
    variables,
    characters,
  };
}
