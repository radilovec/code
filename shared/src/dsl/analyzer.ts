// Семантический анализатор DSL интерактивных видео-сценариев.
//
// Анализатор принимает AST (ProgramNode из парсера) и возвращает массив
// диагностических сообщений (ошибок и предупреждений) с позициями для
// Monaco markers. Это третий шаг DSL-pipeline: текст → лексер → парсер → анализатор.
//
// Принцип из source.md: twine-parser демонстрирует pipeline «текст → объект →
// граф». Анализатор проверяет семантическую корректность объекта (AST) до
// построения доменной модели и графа.

import type {
  ProgramNode,
  Declaration,
  SceneDecl,
  CharacterDecl,
  VarDecl,
  Statement,
  Expression,
  ChoiceStmt,
  GoToStmt,
  IfStmt,
  AssignStmt,
  Span,
} from './ast.types.js';
import type { Diagnostic, DiagnosticSeverity } from '../domain/model.types.js';

// ─────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ТИПЫ
// ─────────────────────────────────────────────

/** Информация о переменной, накопленная при анализе. */
interface VarInfo {
  /** Тип, выведенный из начального значения. */
  type: 'number' | 'string' | 'boolean' | 'unknown';
  /** Span объявления — для ссылок в сообщениях. */
  span: Span;
}

// ─────────────────────────────────────────────
// КЛАСС АНАЛИЗАТОРА
// ─────────────────────────────────────────────

/**
 * Семантический анализатор DSL.
 *
 * Проверки (в порядке выполнения):
 * 1. Дублирование имён сцен.
 * 2. Дублирование глобальных переменных.
 * 3. Дублирование имён персонажей.
 * 4. Внутри каждой сцены:
 *    a. Существование целевых сцен в choice → target и goto → target.
 *    b. Объявленность переменных (set перед использованием).
 *    c. Пустые сцены (предупреждение).
 * 5. Недостижимые сцены (нет входящих переходов, кроме первой).
 */
class Analyzer {
  private readonly program: ProgramNode;
  private readonly diagnostics: Diagnostic[] = [];

  /** Множество имён объявленных сцен (для проверки target). */
  private readonly sceneNames = new Set<string>();
  /** Информация о глобальных переменных. */
  private readonly variables = new Map<string, VarInfo>();
  /** Множество имён объявленных персонажей. */
  private readonly characterNames = new Set<string>();

  constructor(program: ProgramNode) {
    this.program = program;
  }

  // ─────────────────────────────────────────────
  // ПУБЛИЧНЫЙ МЕТОД
  // ─────────────────────────────────────────────

  /** Выполнить все семантические проверки и вернуть массив диагностик. */
  run(): Diagnostic[] {
    // Первый проход: собрать все имена сцен, переменных, персонажей
    this.collectDeclarations();

    // Второй проход: проверить тела сцен
    for (const decl of this.program.declarations) {
      if (decl.kind === 'Scene') {
        this.checkScene(decl);
      }
    }

    // Третий проход: проверить достижимость сцен
    this.checkReachability();

    return this.diagnostics;
  }

  // ─────────────────────────────────────────────
  // ПЕРВЫЙ ПРОХОД: СБОР ОБЪЯВЛЕНИЙ
  // ─────────────────────────────────────────────

  /** Собрать все имена сцен, переменных, персонажей; проверить дубликаты. */
  private collectDeclarations(): void {
    for (const decl of this.program.declarations) {
      switch (decl.kind) {
        case 'Scene':
          this.collectScene(decl);
          break;
        case 'VarDecl':
          this.collectVar(decl);
          break;
        case 'Character':
          this.collectCharacter(decl);
          break;
      }
    }
  }

  private collectScene(scene: SceneDecl): void {
    if (this.sceneNames.has(scene.name)) {
      this.addError(
        `Сцена "${scene.name}" уже объявлена ранее`,
        scene.span,
      );
    } else {
      this.sceneNames.add(scene.name);
    }
  }

  private collectVar(decl: VarDecl): void {
    if (this.variables.has(decl.variable)) {
      this.addError(
        `Переменная "${decl.variable}" уже объявлена ранее`,
        decl.span,
      );
    } else {
      const varType = this.inferLiteralType(decl.initialValue);
      this.variables.set(decl.variable, { type: varType, span: decl.span });
    }
  }

  private collectCharacter(decl: CharacterDecl): void {
    if (this.characterNames.has(decl.name)) {
      this.addError(
        `Персонаж "${decl.name}" уже объявлен ранее`,
        decl.span,
      );
    } else {
      this.characterNames.add(decl.name);
    }
  }

  // ─────────────────────────────────────────────
  // ВТОРОЙ ПРОХОД: ПРОВЕРКА СЦЕН
  // ─────────────────────────────────────────────

  /** Проверить тело одной сцены. */
  private checkScene(scene: SceneDecl): void {
    // Предупреждение: пустая сцена
    if (scene.body.length === 0) {
      this.addWarning(
        `Сцена "${scene.name}" пуста — нет инструкций`,
        scene.span,
      );
    }

    // Множество переменных, которые были присвоены внутри этой сцены
    // (в дополнение к глобальным)
    const localAssigned = new Set<string>();

    this.checkStatements(scene.body, localAssigned);
  }

  /** Проверить список инструкций (рекурсивно, для if/else). */
  private checkStatements(stmts: Statement[], localAssigned: Set<string>): void {
    for (const stmt of stmts) {
      this.checkStatement(stmt, localAssigned);
    }
  }

  /** Проверить одну инструкцию. */
  private checkStatement(stmt: Statement, localAssigned: Set<string>): void {
    switch (stmt.kind) {
      case 'Choice':
        this.checkChoice(stmt, localAssigned);
        break;
      case 'GoTo':
        this.checkGoTo(stmt);
        break;
      case 'If':
        this.checkIf(stmt, localAssigned);
        break;
      case 'Assign':
        this.checkAssign(stmt, localAssigned);
        break;
      case 'Text':
        // Text не требует семантических проверок на данном этапе
        break;
      case 'Video':
        // Video: проверка from < to — полезное предупреждение
        if (stmt.from >= stmt.to) {
          this.addWarning(
            `Таймкод начала (${stmt.from}) должен быть меньше таймкода конца (${stmt.to})`,
            stmt.span,
          );
        }
        break;
    }
  }

  /** Проверить инструкцию choice: существование target, переменные в condition. */
  private checkChoice(stmt: ChoiceStmt, localAssigned: Set<string>): void {
    if (!this.sceneNames.has(stmt.target)) {
      this.addError(
        `Целевая сцена "${stmt.target}" не найдена`,
        stmt.span,
      );
    }
    if (stmt.condition !== undefined) {
      this.checkExpression(stmt.condition, localAssigned);
    }
  }

  /** Проверить инструкцию goto: существование target. */
  private checkGoTo(stmt: GoToStmt): void {
    if (!this.sceneNames.has(stmt.target)) {
      this.addError(
        `Целевая сцена "${stmt.target}" не найдена`,
        stmt.span,
      );
    }
  }

  /** Проверить инструкцию if: условие и ветки. */
  private checkIf(stmt: IfStmt, localAssigned: Set<string>): void {
    this.checkExpression(stmt.condition, localAssigned);
    this.checkStatements(stmt.thenBranch, localAssigned);
    if (stmt.elseBranch !== undefined) {
      this.checkStatements(stmt.elseBranch, localAssigned);
    }
  }

  /** Проверить присваивание: переменная должна быть объявлена. */
  private checkAssign(stmt: AssignStmt, localAssigned: Set<string>): void {
    if (!this.variables.has(stmt.variable)) {
      this.addError(
        `Переменная "${stmt.variable}" не объявлена. Используйте "set ${stmt.variable} = ..." на верхнем уровне`,
        stmt.span,
      );
    }
    this.checkExpression(stmt.value, localAssigned);
    // После присваивания переменная считается инициализированной в scope
    localAssigned.add(stmt.variable);
  }

  // ─────────────────────────────────────────────
  // ПРОВЕРКА ВЫРАЖЕНИЙ
  // ─────────────────────────────────────────────

  /** Рекурсивно проверить выражение: переменные объявлены. */
  private checkExpression(expr: Expression, localAssigned: Set<string>): void {
    switch (expr.kind) {
      case 'Variable':
        if (!this.variables.has(expr.name) && !localAssigned.has(expr.name)) {
          this.addError(
            `Переменная "${expr.name}" не объявлена`,
            expr.span,
          );
        }
        break;

      case 'BinaryOp':
        this.checkExpression(expr.left, localAssigned);
        this.checkExpression(expr.right, localAssigned);
        // Опциональная проверка типов в сравнениях
        this.checkBinaryOpTypes(expr);
        break;

      case 'LogicalOp':
        this.checkExpression(expr.left, localAssigned);
        this.checkExpression(expr.right, localAssigned);
        break;

      case 'UnaryOp':
        this.checkExpression(expr.operand, localAssigned);
        break;

      case 'LiteralString':
      case 'LiteralNumber':
      case 'LiteralBool':
        // Литералы не требуют проверок
        break;
    }
  }

  /** Опциональная проверка типов: предупреждение при сравнении несовместимых типов. */
  private checkBinaryOpTypes(expr: Expression & { kind: 'BinaryOp' }): void {
    // Проверяем только операторы сравнения
    const compOps = new Set(['==', '!=', '<', '<=', '>', '>=']);
    if (!compOps.has(expr.operator)) return;

    const leftType = this.inferExprType(expr.left);
    const rightType = this.inferExprType(expr.right);

    // Если оба типа известны и различны — предупреждение
    if (
      leftType !== 'unknown' &&
      rightType !== 'unknown' &&
      leftType !== rightType
    ) {
      this.addWarning(
        `Сравнение значений разных типов: ${leftType} ${expr.operator} ${rightType}`,
        expr.span,
      );
    }
  }

  // ─────────────────────────────────────────────
  // ТРЕТИЙ ПРОХОД: ДОСТИЖИМОСТЬ СЦЕН
  // ─────────────────────────────────────────────

  /** Проверить, что все сцены достижимы из первой (BFS по переходам). */
  private checkReachability(): void {
    if (this.sceneNames.size === 0) return;

    // Собрать граф переходов: scene → set<target>
    const targets = new Map<string, Set<string>>();
    for (const name of this.sceneNames) {
      targets.set(name, new Set<string>());
    }

    // Для каждой сцены — собрать все целевые переходы
    const sceneDecls = this.program.declarations.filter(
      (d): d is SceneDecl => d.kind === 'Scene'
    );

    for (const scene of sceneDecls) {
      const sceneTargets = targets.get(scene.name);
      if (sceneTargets !== undefined) {
        this.collectTargets(scene.body, sceneTargets);
      }
    }

    // BFS от первой сцены
    const firstScene = sceneDecls[0];
    if (firstScene === undefined) return;

    const reachable = new Set<string>();
    const queue: string[] = [firstScene.name];
    reachable.add(firstScene.name);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentTargets = targets.get(current);
      if (currentTargets !== undefined) {
        for (const target of currentTargets) {
          if (!reachable.has(target)) {
            reachable.add(target);
            queue.push(target);
          }
        }
      }
    }

    // Предупреждения для недостижимых сцен
    for (const scene of sceneDecls) {
      if (!reachable.has(scene.name)) {
        this.addWarning(
          `Сцена "${scene.name}" недостижима — нет переходов из других сцен`,
          scene.span,
        );
      }
    }
  }

  /** Собрать все целевые сцены из списка инструкций (рекурсивно). */
  private collectTargets(stmts: Statement[], result: Set<string>): void {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'Choice':
          result.add(stmt.target);
          break;
        case 'GoTo':
          result.add(stmt.target);
          break;
        case 'If':
          this.collectTargets(stmt.thenBranch, result);
          if (stmt.elseBranch !== undefined) {
            this.collectTargets(stmt.elseBranch, result);
          }
          break;
        // Другие инструкции не содержат переходов
      }
    }
  }

  // ─────────────────────────────────────────────
  // ВЫВОД ТИПОВ
  // ─────────────────────────────────────────────

  /** Вывести тип литерального выражения (для проверки начального значения VarDecl). */
  private inferLiteralType(expr: Expression): 'number' | 'string' | 'boolean' | 'unknown' {
    switch (expr.kind) {
      case 'LiteralNumber': return 'number';
      case 'LiteralString': return 'string';
      case 'LiteralBool':   return 'boolean';
      default:              return 'unknown';
    }
  }

  /** Попытаться вывести тип выражения (для предупреждений о сравнении). */
  private inferExprType(expr: Expression): 'number' | 'string' | 'boolean' | 'unknown' {
    switch (expr.kind) {
      case 'LiteralNumber': return 'number';
      case 'LiteralString': return 'string';
      case 'LiteralBool':   return 'boolean';
      case 'Variable': {
        const info = this.variables.get(expr.name);
        return info !== undefined ? info.type : 'unknown';
      }
      case 'BinaryOp': {
        // Арифметика → number, сравнение → boolean
        const arithOps = new Set(['+', '-', '*', '/']);
        if (arithOps.has(expr.operator)) return 'number';
        return 'boolean'; // ==, !=, <, <=, >, >=
      }
      case 'LogicalOp':
        return 'boolean';
      case 'UnaryOp':
        return expr.operator === 'not' ? 'boolean' : 'number';
      default:
        return 'unknown';
    }
  }

  // ─────────────────────────────────────────────
  // УТИЛИТЫ ДИАГНОСТИКИ
  // ─────────────────────────────────────────────

  private addDiagnostic(severity: DiagnosticSeverity, message: string, span: Span): void {
    this.diagnostics.push({
      severity,
      message,
      line: span.start.line,
      column: span.start.column,
      endLine: span.end.line,
      endColumn: span.end.column,
    });
  }

  private addError(message: string, span: Span): void {
    this.addDiagnostic('error', message, span);
  }

  private addWarning(message: string, span: Span): void {
    this.addDiagnostic('warning', message, span);
  }
}

// ─────────────────────────────────────────────
// ПУБЛИЧНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────

/**
 * Выполняет семантический анализ AST программы.
 *
 * Проверки:
 * - Дублирование имён сцен, переменных, персонажей.
 * - Существование целевых сцен в choice → target и goto → target.
 * - Объявленность переменных (set перед использованием).
 * - Пустые сцены (предупреждение).
 * - Недостижимые сцены (предупреждение).
 * - Сравнение несовместимых типов (предупреждение).
 * - Некорректные таймкоды video (from >= to).
 *
 * @param program — AST программы из парсера (parse())
 * @returns массив диагностических сообщений
 *
 * Использование:
 * ```typescript
 * import { tokenize } from './lexer.js';
 * import { parse } from './parser.js';
 * import { analyze } from './analyzer.js';
 *
 * const tokens = tokenize(source);
 * const { program, errors: parseErrors } = parse(tokens);
 * const semanticErrors = analyze(program);
 * const allErrors = [...parseErrors, ...semanticErrors];
 * ```
 */
export function analyze(program: ProgramNode): Diagnostic[] {
  const analyzer = new Analyzer(program);
  return analyzer.run();
}
