// Парсер DSL интерактивных видео-сценариев.
//
// Реализован вручную методом рекурсивного спуска (recursive descent),
// без использования nearley.js, peg.js или antlr. Каждое правило
// грамматики из CLAUDE.md — отдельный private-метод класса Parser.
//
// Принцип обработки ошибок: парсер толерантен — при синтаксической
// ошибке добавляет Diagnostic и пытается восстановиться (skip до
// следующего statement или `}`). Это позволяет показать все ошибки
// за один проход, а не останавливаться на первой.
//
// Принцип из source.md: twine-parser демонстрирует pipeline «текст →
// объект → граф». Здесь парсер — второй шаг этого pipeline: токены → AST.

import type {
  Expression,
  LiteralStringExpr,
  LiteralNumberExpr,
  LiteralBoolExpr,
  VariableExpr,
  BinaryOpExpr,
  BinaryOperator,
  LogicalOpExpr,
  UnaryOpExpr,
  Statement,
  AssignStmt,
  TextStmt,
  VideoStmt,
  ChoiceStmt,
  IfStmt,
  GoToStmt,
  Declaration,
  SceneDecl,
  CharacterDecl,
  VarDecl,
  ProgramNode,
} from './ast.types.js';
import type { Token, TokenKind } from './token.types.js';
import type { Diagnostic } from '../domain/model.types.js';

// ─────────────────────────────────────────────
// РЕЗУЛЬТАТ ПАРСИНГА
// ─────────────────────────────────────────────

/** Результат вызова `parse()`. */
export interface ParseResult {
  /** Корневой узел AST. Всегда возвращается, даже при наличии ошибок. */
  program: ProgramNode;
  /** Диагностические сообщения (синтаксические ошибки). */
  errors: Diagnostic[];
}

// ─────────────────────────────────────────────
// УТИЛИТА: ИЗВЛЕЧЕНИЕ @УПОМИНАНИЙ ИЗ СТРОКИ
// ─────────────────────────────────────────────

/**
 * Извлекает имена персонажей, упомянутых через @name в строке текста.
 * Возвращает массив уникальных имён (без символа @).
 *
 * Пример: "Тут @boss смотрит, а @guard стоит рядом с @boss"
 *       → ["boss", "guard"]
 */
export function extractMentions(text: string): string[] {
  const regex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    names.add(match[1]!);
  }
  return Array.from(names);
}

// ─────────────────────────────────────────────
// КЛАСС ПАРСЕРА
// ─────────────────────────────────────────────

/**
 * Recursive descent парсер DSL.
 *
 * Каждое правило грамматики — отдельный private-метод:
 *   parseProgram()     → ProgramNode
 *   parseDeclaration() → Declaration | null
 *   parseScene()       → SceneDecl
 *   parseCharacter()   → CharacterDecl
 *   parseVarDecl()     → VarDecl
 *   parseSceneBody()   → Statement[]
 *   parseStatement()   → Statement | null
 *   parseExpression()  → Expression  (и подуровни: or, and, not, comparison, arith, term, factor)
 */
class Parser {
  private readonly tokens: Token[];
  private pos: number = 0;
  private readonly errors: Diagnostic[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ─────────────────────────────────────────────
  // НАВИГАЦИЯ ПО ТОКЕНАМ
  // ─────────────────────────────────────────────

  /** Текущий токен (без продвижения). */
  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  /** Вид текущего токена. */
  private currentKind(): TokenKind {
    return this.current().kind;
  }

  /** Продвинуть указатель и вернуть предыдущий токен. */
  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return tok;
  }

  /** Проверить, совпадает ли вид текущего токена. */
  private check(kind: TokenKind): boolean {
    return this.currentKind() === kind;
  }

  /** Если текущий токен нужного вида — продвинуться и вернуть true. */
  private match(kind: TokenKind): boolean {
    if (this.check(kind)) {
      this.advance();
      return true;
    }
    return false;
  }

  /** Ожидать конкретный вид токена; при несовпадении — ошибка. */
  private expect(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }
    this.addError(message);
    // Возвращаем текущий токен как fallback (для span)
    return this.current();
  }

  /** Конец ввода? */
  private isAtEnd(): boolean {
    return this.currentKind() === 'EOF';
  }

  // ─────────────────────────────────────────────
  // ОШИБКИ И ВОССТАНОВЛЕНИЕ
  // ─────────────────────────────────────────────

  /** Добавить диагностическую ошибку на позиции текущего токена. */
  private addError(message: string): void {
    const tok = this.current();
    this.errors.push({
      severity: 'error',
      message,
      line: tok.span.start.line,
      column: tok.span.start.column,
      endLine: tok.span.end.line,
      endColumn: tok.span.end.column,
    });
  }

  /**
   * Восстановление после ошибки: пропускаем токены до «опорного» —
   * начала нового объявления или конца блока.
   */
  private synchronize(): void {
    while (!this.isAtEnd()) {
      const kind = this.currentKind();
      // Опорные токены — начало нового объявления/инструкции
      if (
        kind === 'SCENE' ||
        kind === 'CHARACTER' ||
        kind === 'SET' ||
        kind === 'TEXT' ||
        kind === 'VIDEO' ||
        kind === 'CHOICE' ||
        kind === 'IF' ||
        kind === 'GOTO' ||
        kind === 'RBRACE'
      ) {
        return;
      }
      this.advance();
    }
  }

  // ─────────────────────────────────────────────
  // ПРОГРАММА (корень)
  // ─────────────────────────────────────────────

  /**
   * program := (set_stmt | scene | character)*
   */
  parseProgram(): ParseResult {
    const startPos = this.current().span.start;
    const declarations: Declaration[] = [];

    while (!this.isAtEnd()) {
      const prevPos = this.pos;
      const decl = this.parseDeclaration();
      if (decl !== null) {
        declarations.push(decl);
      }
      if (this.pos === prevPos) {
        this.advance(); // prevent infinite loop on unrecognized/partial tokens
      }
    }

    const endPos = this.current().span.end;
    const program: ProgramNode = {
      kind: 'Program',
      declarations,
      span: { start: startPos, end: endPos },
    };

    return { program, errors: this.errors };
  }

  // ─────────────────────────────────────────────
  // ОБЪЯВЛЕНИЯ верхнего уровня
  // ─────────────────────────────────────────────

  /**
   * declaration := scene | character | set_stmt (как VarDecl)
   */
  private parseDeclaration(): Declaration | null {
    try {
      const kind = this.currentKind();

      if (kind === 'SCENE') {
        return this.parseScene();
      }
      if (kind === 'CHARACTER') {
        return this.parseCharacter();
      }
      if (kind === 'SET') {
        return this.parseVarDecl();
      }

      // Неожиданный токен на верхнем уровне
      this.addError(
        `Ожидалось объявление (scene, character, set), ` +
        `но встречено '${this.current().value}'`
      );
      this.synchronize();
      return null;
    } catch {
      this.synchronize();
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // SCENE
  // ─────────────────────────────────────────────

  /**
   * scene := "scene" identifier "{" scene_body "}"
   */
  private parseScene(): SceneDecl {
    const startTok = this.advance(); // consume 'scene'
    const nameTok = this.expect('IDENTIFIER', 'Ожидалось имя сцены после "scene"');
    const name = nameTok.value;
    this.expect('LBRACE', 'Ожидалась "{" после имени сцены');
    const body = this.parseSceneBody();
    const endTok = this.expect('RBRACE', 'Ожидалась "}" для закрытия блока сцены');

    return {
      kind: 'Scene',
      name,
      body,
      span: { start: startTok.span.start, end: endTok.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // CHARACTER
  // ─────────────────────────────────────────────

  /**
   * character := "character" identifier "{" character_field* "}"
   * character_field := "description" string | "name" string | "age" number
   *
   * Все поля опциональны. Порядок произвольный. `description` обрабатывается
   * как ключевое слово (DESCRIPTION). `name` и `age` — как IDENTIFIER
   * (чтобы не ломать их использование как имён переменных вне character-блока).
   */
  private parseCharacter(): CharacterDecl {
    const startTok = this.advance(); // consume 'character'
    const nameTok = this.expect('IDENTIFIER', 'Ожидалось имя персонажа после "character"');
    const charId = nameTok.value;
    this.expect('LBRACE', 'Ожидалась "{" после имени персонажа');

    let description = '';
    let displayName: string | undefined;
    let age: number | undefined;

    // Цикл по полям внутри { ... } пока не встретим }
    while (!this.isAtEnd() && !this.check('RBRACE')) {
      const fieldTok = this.current();

      // description "..." — ключевое слово DESCRIPTION
      if (fieldTok.kind === 'DESCRIPTION') {
        this.advance();
        const descTok = this.expect('STRING', 'Ожидалась строка описания после "description"');
        description = descTok.value;
        continue;
      }

      // name "..." и age N — распознаются как IDENTIFIER по значению
      if (fieldTok.kind === 'IDENTIFIER' && fieldTok.value === 'name') {
        this.advance();
        const valTok = this.expect('STRING', 'Ожидалась строка после "name"');
        displayName = valTok.value;
        continue;
      }

      if (fieldTok.kind === 'IDENTIFIER' && fieldTok.value === 'age') {
        this.advance();
        const valTok = this.expect('NUMBER', 'Ожидалось число после "age"');
        age = parseFloat(valTok.value);
        continue;
      }

      // Неожиданный токен внутри character-блока
      this.addError(
        `Ожидалось поле персонажа (description, name, age), ` +
        `но встречено '${fieldTok.value}'`
      );
      this.advance();
    }

    const endTok = this.expect('RBRACE', 'Ожидалась "}" для закрытия блока character');

    const result: CharacterDecl = {
      kind: 'Character',
      name: charId,
      description,
      span: { start: startTok.span.start, end: endTok.span.end },
    };

    if (displayName !== undefined) {
      result.displayName = displayName;
    }
    if (age !== undefined) {
      result.age = age;
    }

    return result;
  }

  // ─────────────────────────────────────────────
  // VARDECL (глобальный set)
  // ─────────────────────────────────────────────

  /**
   * var_decl := "set" identifier "=" expression
   */
  private parseVarDecl(): VarDecl {
    const startTok = this.advance(); // consume 'set'
    const nameTok = this.expect('IDENTIFIER', 'Ожидалось имя переменной после "set"');
    this.expect('ASSIGN', 'Ожидался "=" после имени переменной');
    const value = this.parseExpression();

    return {
      kind: 'VarDecl',
      variable: nameTok.value,
      initialValue: value,
      span: { start: startTok.span.start, end: value.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // ТЕЛО СЦЕНЫ (scene_body)
  // ─────────────────────────────────────────────

  /**
   * scene_body := (text_stmt | video_stmt | choice_stmt | if_stmt | set_stmt | goto_stmt)*
   */
  private parseSceneBody(): Statement[] {
    const stmts: Statement[] = [];

    while (!this.isAtEnd() && !this.check('RBRACE')) {
      const prevPos = this.pos;
      const stmt = this.parseStatement();
      if (stmt !== null) {
        stmts.push(stmt);
      }
      if (this.pos === prevPos) {
        this.advance(); // prevent infinite loop on unrecognized/partial tokens
      }
    }

    return stmts;
  }

  // ─────────────────────────────────────────────
  // STATEMENTS
  // ─────────────────────────────────────────────

  /**
   * statement := text_stmt | video_stmt | choice_stmt | if_stmt | set_stmt | goto_stmt
   */
  private parseStatement(): Statement | null {
    try {
      const kind = this.currentKind();

      if (kind === 'TEXT') return this.parseText();
      if (kind === 'VIDEO') return this.parseVideo();
      if (kind === 'CHOICE') return this.parseChoice();
      if (kind === 'IF') return this.parseIf();
      if (kind === 'SET') return this.parseAssign();
      if (kind === 'GOTO') return this.parseGoTo();

      // Неожиданный токен внутри сцены
      this.addError(
        `Ожидалась инструкция (text, video, choice, if, set, goto), ` +
        `но встречено '${this.current().value}'`
      );
      this.synchronize();
      return null;
    } catch {
      this.synchronize();
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // TEXT
  // ─────────────────────────────────────────────

  /**
   * text_stmt := "text" string
   *            | "text" identifier string  (с именем персонажа)
   */
  private parseText(): TextStmt {
    const startTok = this.advance(); // consume 'text'

    // Проверяем: следующий токен — идентификатор, за ним — строка?
    // Тогда это `text character_name "content"`
    let characterName: string | undefined;
    if (this.check('IDENTIFIER')) {
      // Lookahead: если после IDENTIFIER идёт STRING, то это имя персонажа
      const nextIdx = this.pos + 1;
      const nextTok = this.tokens[nextIdx];
      if (nextTok && nextTok.kind === 'STRING') {
        characterName = this.advance().value; // consume identifier
      }
    }

    const contentTok = this.expect('STRING', 'Ожидалась строка текста после "text"');

    // Постпроцессинг: извлечение inline-упоминаний @name из строки
    const mentions = extractMentions(contentTok.value);

    return {
      kind: 'Text',
      content: contentTok.value,
      ...(characterName !== undefined ? { characterName } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      span: { start: startTok.span.start, end: contentTok.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // VIDEO
  // ─────────────────────────────────────────────

  /**
   * video_stmt := "video" string "from" number "to" number
   */
  private parseVideo(): VideoStmt {
    const startTok = this.advance(); // consume 'video'
    const urlTok = this.expect('STRING', 'Ожидался URL видео (строка) после "video"');
    this.expect('FROM', 'Ожидалось "from" после URL видео');
    const fromTok = this.expect('NUMBER', 'Ожидался таймкод начала (число) после "from"');
    this.expect('TO', 'Ожидалось "to" после таймкода начала');
    const toTok = this.expect('NUMBER', 'Ожидался таймкод конца (число) после "to"');

    return {
      kind: 'Video',
      url: urlTok.value,
      from: parseFloat(fromTok.value),
      to: parseFloat(toTok.value),
      span: { start: startTok.span.start, end: toTok.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // CHOICE
  // ─────────────────────────────────────────────

  /**
   * choice_stmt := "choice" string "->" identifier ("when" expression)?
   */
  private parseChoice(): ChoiceStmt {
    const startTok = this.advance(); // consume 'choice'
    const labelTok = this.expect('STRING', 'Ожидался текст выбора (строка) после "choice"');
    this.expect('ARROW', 'Ожидался "->" после текста выбора');
    const targetTok = this.expect('IDENTIFIER', 'Ожидалось имя целевой сцены после "->"');

    let condition: Expression | undefined;
    let endSpan = targetTok.span;

    if (this.match('WHEN')) {
      condition = this.parseExpression();
      endSpan = condition.span;
    }

    return {
      kind: 'Choice',
      label: labelTok.value,
      target: targetTok.value,
      ...(condition !== undefined ? { condition } : {}),
      span: { start: startTok.span.start, end: endSpan.end },
    };
  }

  // ─────────────────────────────────────────────
  // IF
  // ─────────────────────────────────────────────

  /**
   * if_stmt := "if" expression "{" scene_body "}" ("else" "{" scene_body "}")?
   */
  private parseIf(): IfStmt {
    const startTok = this.advance(); // consume 'if'
    const condition = this.parseExpression();
    this.expect('LBRACE', 'Ожидалась "{" после условия if');
    const thenBranch = this.parseSceneBody();
    let endTok = this.expect('RBRACE', 'Ожидалась "}" для закрытия блока if');

    let elseBranch: Statement[] | undefined;
    if (this.match('ELSE')) {
      this.expect('LBRACE', 'Ожидалась "{" после "else"');
      elseBranch = this.parseSceneBody();
      endTok = this.expect('RBRACE', 'Ожидалась "}" для закрытия блока else');
    }

    return {
      kind: 'If',
      condition,
      thenBranch,
      ...(elseBranch !== undefined ? { elseBranch } : {}),
      span: { start: startTok.span.start, end: endTok.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // ASSIGN (set внутри сцены)
  // ─────────────────────────────────────────────

  /**
   * assign_stmt := "set" identifier "=" expression
   */
  private parseAssign(): AssignStmt {
    const startTok = this.advance(); // consume 'set'
    const nameTok = this.expect('IDENTIFIER', 'Ожидалось имя переменной после "set"');
    this.expect('ASSIGN', 'Ожидался "=" после имени переменной');
    const value = this.parseExpression();

    return {
      kind: 'Assign',
      variable: nameTok.value,
      value,
      span: { start: startTok.span.start, end: value.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // GOTO
  // ─────────────────────────────────────────────

  /**
   * goto_stmt := "goto" identifier
   */
  private parseGoTo(): GoToStmt {
    const startTok = this.advance(); // consume 'goto'
    const targetTok = this.expect('IDENTIFIER', 'Ожидалось имя целевой сцены после "goto"');

    return {
      kind: 'GoTo',
      target: targetTok.value,
      span: { start: startTok.span.start, end: targetTok.span.end },
    };
  }

  // ─────────────────────────────────────────────
  // ВЫРАЖЕНИЯ (expression parsing)
  // ─────────────────────────────────────────────
  //
  // Приоритет операторов (от низшего к высшему):
  //   or  <  and  <  not  <  сравнение (==,!=,<,<=,>,>=)  <
  //   сложение (+,-)  <  умножение (*,/)  <  унарный минус (-)  <  атом
  //
  // Каждый уровень приоритета — отдельный метод.

  /**
   * expression := or_expr
   */
  private parseExpression(): Expression {
    return this.parseOr();
  }

  /**
   * or_expr := and_expr ("or" and_expr)*
   */
  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.check('OR')) {
      this.advance();
      const right = this.parseAnd();
      left = {
        kind: 'LogicalOp',
        operator: 'or',
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      } satisfies LogicalOpExpr;
    }

    return left;
  }

  /**
   * and_expr := not_expr ("and" not_expr)*
   */
  private parseAnd(): Expression {
    let left = this.parseNot();

    while (this.check('AND')) {
      this.advance();
      const right = this.parseNot();
      left = {
        kind: 'LogicalOp',
        operator: 'and',
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      } satisfies LogicalOpExpr;
    }

    return left;
  }

  /**
   * not_expr := "not" not_expr | comparison
   */
  private parseNot(): Expression {
    if (this.check('NOT')) {
      const opTok = this.advance();
      const operand = this.parseNot();
      return {
        kind: 'UnaryOp',
        operator: 'not',
        operand,
        span: { start: opTok.span.start, end: operand.span.end },
      } satisfies UnaryOpExpr;
    }

    return this.parseComparison();
  }

  /**
   * comparison := arith (("=="|"!="|"<"|"<="|">"|">=") arith)?
   *
   * Сравнение не цепочечное (нельзя `a < b < c`): только один оператор.
   */
  private parseComparison(): Expression {
    let left = this.parseAddSub();

    const kind = this.currentKind();
    if (
      kind === 'EQ' || kind === 'NEQ' ||
      kind === 'LT' || kind === 'LTE' ||
      kind === 'GT' || kind === 'GTE'
    ) {
      const opTok = this.advance();
      const operator = opTok.value as BinaryOperator;
      const right = this.parseAddSub();
      left = {
        kind: 'BinaryOp',
        operator,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      } satisfies BinaryOpExpr;
    }

    return left;
  }

  /**
   * arith := term (("+"|"-") term)*
   */
  private parseAddSub(): Expression {
    let left = this.parseMulDiv();

    while (this.check('PLUS') || this.check('MINUS')) {
      const opTok = this.advance();
      const operator = opTok.value as BinaryOperator;
      const right = this.parseMulDiv();
      left = {
        kind: 'BinaryOp',
        operator,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      } satisfies BinaryOpExpr;
    }

    return left;
  }

  /**
   * term := factor (("*"|"/") factor)*
   */
  private parseMulDiv(): Expression {
    let left = this.parseUnaryMinus();

    while (this.check('STAR') || this.check('SLASH')) {
      const opTok = this.advance();
      const operator = opTok.value as BinaryOperator;
      const right = this.parseUnaryMinus();
      left = {
        kind: 'BinaryOp',
        operator,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      } satisfies BinaryOpExpr;
    }

    return left;
  }

  /**
   * unary_minus := "-" unary_minus | atom
   */
  private parseUnaryMinus(): Expression {
    if (this.check('MINUS')) {
      const opTok = this.advance();
      const operand = this.parseUnaryMinus();
      return {
        kind: 'UnaryOp',
        operator: '-',
        operand,
        span: { start: opTok.span.start, end: operand.span.end },
      } satisfies UnaryOpExpr;
    }

    return this.parseAtom();
  }

  /**
   * atom := number | string | "true" | "false" | identifier | "(" expression ")"
   */
  private parseAtom(): Expression {
    const tok = this.current();

    // Числовой литерал
    if (tok.kind === 'NUMBER') {
      this.advance();
      return {
        kind: 'LiteralNumber',
        value: parseFloat(tok.value),
        span: tok.span,
      } satisfies LiteralNumberExpr;
    }

    // Строковый литерал
    if (tok.kind === 'STRING') {
      this.advance();
      return {
        kind: 'LiteralString',
        value: tok.value,
        span: tok.span,
      } satisfies LiteralStringExpr;
    }

    // Булев литерал true
    if (tok.kind === 'TRUE') {
      this.advance();
      return {
        kind: 'LiteralBool',
        value: true,
        span: tok.span,
      } satisfies LiteralBoolExpr;
    }

    // Булев литерал false
    if (tok.kind === 'FALSE') {
      this.advance();
      return {
        kind: 'LiteralBool',
        value: false,
        span: tok.span,
      } satisfies LiteralBoolExpr;
    }

    // Переменная (идентификатор)
    if (tok.kind === 'IDENTIFIER') {
      this.advance();
      return {
        kind: 'Variable',
        name: tok.value,
        span: tok.span,
      } satisfies VariableExpr;
    }

    // Скобки для группировки
    if (tok.kind === 'LPAREN') {
      this.advance(); // consume '('
      const expr = this.parseExpression();
      const closeTok = this.expect('RPAREN', 'Ожидалась ")" после выражения');
      // Обновляем span, чтобы он охватывал скобки
      return {
        ...expr,
        span: { start: tok.span.start, end: closeTok.span.end },
      };
    }

    // Ничего не подошло — ошибка
    this.addError(`Ожидалось выражение, но встречено '${tok.value}'`);
    this.advance(); // пропускаем проблемный токен

    // Возвращаем фиктивный литерал для продолжения парсинга
    return {
      kind: 'LiteralNumber',
      value: 0,
      span: tok.span,
    } satisfies LiteralNumberExpr;
  }
}

// ─────────────────────────────────────────────
// ПУБЛИЧНАЯ ФУНКЦИЯ
// ─────────────────────────────────────────────

/**
 * Парсит массив токенов в AST.
 *
 * @param tokens — массив токенов из лексера (tokenize())
 * @returns AST программы и массив диагностических ошибок
 *
 * Использование:
 * ```typescript
 * import { tokenize } from './lexer.js';
 * import { parse } from './parser.js';
 *
 * const tokens = tokenize(source);
 * const { program, errors } = parse(tokens);
 * ```
 */
export function parse(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
