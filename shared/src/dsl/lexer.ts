// Лексер DSL интерактивных видео-сценариев.
//
// Архитектурное решение: лексер реализован вручную (однопроходной по
// символам), без использования nearley.js, peg.js или antlr. Это осознанный
// выбор: лексер и парсер DSL — основной технический вклад дипломной работы;
// использование генератора скрыло бы реализацию и затруднило обоснование
// на защите. Принцип аналогичен twine-parser из source.md, где парсер
// реализован вручную.
//
// Принцип обработки ошибок: лексер толерантен — при неизвестном символе
// возвращает UNKNOWN-токен и продолжает. Настоящая диагностика формируется
// позже — парсером и семантическим анализатором, с передачей позиции
// в Monaco markers.

import type { Position, Span } from './ast.types.js';
import type { Token, TokenKind } from './token.types.js';

// ─────────────────────────────────────────────
// ТАБЛИЦА КЛЮЧЕВЫХ СЛОВ
// ─────────────────────────────────────────────

/**
 * Lookup-таблица: строка → TokenKind.
 * Используется после прочтения IDENTIFIER-последовательности:
 * если слово найдено — возвращаем соответствующий вид ключевого слова,
 * иначе — IDENTIFIER.
 *
 * Ключевые слова регистрозависимы (case-sensitive): `scene` — ключевое
 * слово, `Scene` — идентификатор. Это упрощает парсер.
 */
const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map<string, TokenKind>([
  ['scene',       'SCENE'],
  ['character',   'CHARACTER'],
  ['set',         'SET'],
  ['text',        'TEXT'],
  ['video',       'VIDEO'],
  ['from',        'FROM'],
  ['to',          'TO'],
  ['choice',      'CHOICE'],
  ['when',        'WHEN'],
  ['goto',        'GOTO'],
  ['if',          'IF'],
  ['else',        'ELSE'],
  ['and',         'AND'],
  ['or',          'OR'],
  ['not',         'NOT'],
  ['true',        'TRUE'],
  ['false',       'FALSE'],
  ['description', 'DESCRIPTION'],
]);

// ─────────────────────────────────────────────
// КЛАСС ЛЕКСЕРА
// ─────────────────────────────────────────────

/**
 * Лексер DSL — преобразует исходный текст сценария в плоский массив токенов.
 *
 * Использование:
 * ```typescript
 * const tokens = new Lexer(source).tokenize();
 * // или сокращённо:
 * const tokens = tokenize(source);
 * ```
 */
export class Lexer {
  private readonly source: string;
  /** Текущая позиция (0-based offset в source). */
  private pos: number = 0;
  /** Текущая строка (1-based). */
  private line: number = 1;
  /** Текущий столбец (1-based). */
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Основной публичный метод.
   * Возвращает полный массив токенов, заканчивающийся токеном EOF.
   * Вызов `tokenize()` можно повторять — каждый раз сброс состояния.
   */
  tokenize(): Token[] {
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    const tokens: Token[] = [];

    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;
      tokens.push(this.readNextToken());
    }

    const eofPos = this.currentPosition();
    tokens.push({
      kind: 'EOF',
      value: '',
      span: { start: eofPos, end: eofPos },
    });

    return tokens;
  }

  // ─────────────────────────────────────────────
  // ПОЗИЦИЯ
  // ─────────────────────────────────────────────

  /** Возвращает текущую позицию как объект Position. */
  private currentPosition(): Position {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  // ─────────────────────────────────────────────
  // НАВИГАЦИЯ ПО ИСХОДНИКУ
  // ─────────────────────────────────────────────

  /**
   * Текущий символ без продвижения указателя.
   * @param offset — смещение вперёд (0 = текущий, 1 = следующий и т.д.)
   */
  private peek(offset: number = 0): string {
    return this.source[this.pos + offset] ?? '';
  }

  /**
   * Возвращает текущий символ и продвигает указатель.
   * Обновляет line/column: при '\n' переходим на новую строку.
   */
  private advance(): string {
    const ch = this.source[this.pos] ?? '';
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  // ─────────────────────────────────────────────
  // ПРОПУСК ПРОБЕЛОВ И КОММЕНТАРИЕВ
  // ─────────────────────────────────────────────

  /**
   * Пропускает пробельные символы и комментарии двух видов:
   *   - строчный: `// текст до конца строки`
   *   - блочный: `/* ... *\/` (может занимать несколько строк)
   *
   * После возврата `this.pos` указывает на первый значимый символ
   * или выходит за конец строки.
   */
  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      // Пробельные символы
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
        continue;
      }

      // Строчный комментарий: // до конца строки
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      // Блочный комментарий: /* ... */
      if (ch === '/' && this.peek(1) === '*') {
        this.advance(); // /
        this.advance(); // *
        while (this.pos < this.source.length) {
          if (this.peek() === '*' && this.peek(1) === '/') {
            this.advance(); // *
            this.advance(); // /
            break;
          }
          this.advance();
        }
        continue;
      }

      // Значимый символ — выходим
      break;
    }
  }

  // ─────────────────────────────────────────────
  // ЧТЕНИЕ ОЧЕРЕДНОГО ТОКЕНА
  // ─────────────────────────────────────────────

  /** Читает один токен из текущей позиции. Всегда продвигает указатель. */
  private readNextToken(): Token {
    const ch = this.peek();

    if (ch === '"') {
      return this.readString();
    }

    if (isDigit(ch)) {
      return this.readNumber();
    }

    if (isIdentStart(ch)) {
      return this.readIdentifierOrKeyword();
    }

    return this.readOperatorOrPunctuation();
  }

  // ─────────────────────────────────────────────
  // СТРОКОВЫЕ ЛИТЕРАЛЫ
  // ─────────────────────────────────────────────

  /**
   * Читает строковый литерал вида `"..."`.
   *
   * Поддерживаемые escape-последовательности:
   *   `\"` → `"`   (экранированная кавычка)
   *   `\\` → `\`   (обратный слеш)
   *   `\n` → LF    (перенос строки)
   *   `\t` → Tab   (табуляция)
   *   `\r` → CR
   *   Прочие `\X` → `X` (символ как есть, backslash отбрасывается)
   *
   * Значение токена STRING — содержимое без обрамляющих кавычек,
   * с уже развёрнутыми escape-последовательностями.
   *
   * Незакрытая строка (EOF внутри) → UNKNOWN-токен.
   */
  private readString(): Token {
    const startPos = this.currentPosition();

    this.advance(); // открывающая "

    let result = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (ch === '"') {
        this.advance(); // закрывающая "
        const endPos = this.currentPosition();
        return { kind: 'STRING', value: result, span: { start: startPos, end: endPos } };
      }

      if (ch === '\\') {
        this.advance(); // \
        const escaped = this.peek();
        switch (escaped) {
          case '"':  this.advance(); result += '"';  break;
          case '\\': this.advance(); result += '\\'; break;
          case 'n':  this.advance(); result += '\n'; break;
          case 't':  this.advance(); result += '\t'; break;
          case 'r':  this.advance(); result += '\r'; break;
          default:
            // Неизвестный escape — сохраняем символ после backslash как есть
            if (escaped !== '') {
              result += escaped;
              this.advance();
            }
        }
        continue;
      }

      result += ch;
      this.advance();
    }

    // Незакрытая строка (EOF внутри литерала) — возвращаем UNKNOWN
    const endPos = this.currentPosition();
    return { kind: 'UNKNOWN', value: result, span: { start: startPos, end: endPos } };
  }

  // ─────────────────────────────────────────────
  // ЧИСЛОВЫЕ ЛИТЕРАЛЫ
  // ─────────────────────────────────────────────

  /**
   * Читает числовой литерал по паттерну `\d+(\.\d+)?`.
   *
   * Значение токена NUMBER — строка (e.g. "42", "3.14").
   * Преобразование в число выполняет парсер через `parseFloat(token.value)`.
   *
   * Дробная часть распознаётся только если после '.' следует цифра —
   * это предотвращает конфликт с гипотетическим обращением к полю `obj.field`.
   */
  private readNumber(): Token {
    const startPos = this.currentPosition();

    let value = '';

    while (this.pos < this.source.length && isDigit(this.peek())) {
      value += this.advance();
    }

    // Дробная часть
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      value += this.advance(); // .
      while (this.pos < this.source.length && isDigit(this.peek())) {
        value += this.advance();
      }
    }

    const endPos = this.currentPosition();
    return { kind: 'NUMBER', value, span: { start: startPos, end: endPos } };
  }

  // ─────────────────────────────────────────────
  // ИДЕНТИФИКАТОРЫ И КЛЮЧЕВЫЕ СЛОВА
  // ─────────────────────────────────────────────

  /**
   * Читает последовательность символов идентификатора, затем проверяет
   * по таблице KEYWORDS: если найдено — возвращает вид ключевого слова,
   * иначе — IDENTIFIER.
   *
   * Идентификаторы: `[a-zA-Z_][a-zA-Z0-9_]*` (ASCII only).
   */
  private readIdentifierOrKeyword(): Token {
    const startPos = this.currentPosition();

    let value = '';
    while (this.pos < this.source.length && isIdentPart(this.peek())) {
      value += this.advance();
    }

    const kind: TokenKind = KEYWORDS.get(value) ?? 'IDENTIFIER';
    const endPos = this.currentPosition();
    return { kind, value, span: { start: startPos, end: endPos } };
  }

  // ─────────────────────────────────────────────
  // ОПЕРАТОРЫ И ПУНКТУАЦИЯ
  // ─────────────────────────────────────────────

  /**
   * Читает оператор или символ пунктуации.
   *
   * Двухсимвольные операторы проверяются первыми (жадный match):
   *   `->`, `==`, `!=`, `<=`, `>=`
   *
   * При неизвестном символе возвращает UNKNOWN-токен и продвигается
   * на 1 символ — это позволяет парсеру сформировать сообщение об ошибке
   * с точной позицией, не прерывая токенизацию.
   */
  private readOperatorOrPunctuation(): Token {
    const startPos = this.currentPosition();
    const ch = this.peek();
    const ch2 = this.peek(1);

    // Двухсимвольные операторы — жадный match
    if (ch === '-' && ch2 === '>') {
      this.advance(); this.advance();
      return { kind: 'ARROW',  value: '->',  span: { start: startPos, end: this.currentPosition() } };
    }
    if (ch === '=' && ch2 === '=') {
      this.advance(); this.advance();
      return { kind: 'EQ',     value: '==',  span: { start: startPos, end: this.currentPosition() } };
    }
    if (ch === '!' && ch2 === '=') {
      this.advance(); this.advance();
      return { kind: 'NEQ',    value: '!=',  span: { start: startPos, end: this.currentPosition() } };
    }
    if (ch === '<' && ch2 === '=') {
      this.advance(); this.advance();
      return { kind: 'LTE',    value: '<=',  span: { start: startPos, end: this.currentPosition() } };
    }
    if (ch === '>' && ch2 === '=') {
      this.advance(); this.advance();
      return { kind: 'GTE',    value: '>=',  span: { start: startPos, end: this.currentPosition() } };
    }

    // Односимвольные операторы и пунктуация
    this.advance();
    const endPos = this.currentPosition();
    const span: Span = { start: startPos, end: endPos };

    switch (ch) {
      case '=': return { kind: 'ASSIGN', value: '=',  span };
      case '<': return { kind: 'LT',     value: '<',  span };
      case '>': return { kind: 'GT',     value: '>',  span };
      case '+': return { kind: 'PLUS',   value: '+',  span };
      case '-': return { kind: 'MINUS',  value: '-',  span };
      case '*': return { kind: 'STAR',   value: '*',  span };
      case '/': return { kind: 'SLASH',  value: '/',  span };
      case '{': return { kind: 'LBRACE', value: '{',  span };
      case '}': return { kind: 'RBRACE', value: '}',  span };
      case '(': return { kind: 'LPAREN', value: '(',  span };
      case ')': return { kind: 'RPAREN', value: ')',  span };
      case ',': return { kind: 'COMMA',  value: ',',  span };
      case ':': return { kind: 'COLON',  value: ':',  span };
      default:
        // Неизвестный символ — UNKNOWN; лексер продолжает работу
        return { kind: 'UNKNOWN', value: ch, span };
    }
  }
}

// ─────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (чистые, не методы)
// ─────────────────────────────────────────────

/** Является ли символ ASCII-цифрой. */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Является ли символ допустимым первым символом идентификатора.
 * ASCII-буква или подчёркивание. Unicode-буквы не поддерживаются намеренно:
 * имена сцен и переменных должны быть ASCII для предсказуемости.
 */
function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') ||
         (ch >= 'A' && ch <= 'Z') ||
         ch === '_';
}

/**
 * Является ли символ допустимой частью идентификатора.
 * ASCII-буква, цифра или подчёркивание.
 */
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

// ─────────────────────────────────────────────
// ПУБЛИЧНАЯ УТИЛИТА
// ─────────────────────────────────────────────

/**
 * Удобная функция-обёртка над `new Lexer(source).tokenize()`.
 * Используется в парсере, анализаторе и unit-тестах.
 *
 * @param source — исходный текст DSL-сценария
 * @returns плоский массив токенов, заканчивающийся EOF
 */
export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
