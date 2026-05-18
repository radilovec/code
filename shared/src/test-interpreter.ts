/**
 * Скрипт-ассертов для AST-интерпретатора.
 *
 * Запуск: npx tsx shared/src/test-interpreter.ts
 * Или после сборки: node dist/test-interpreter.js
 *
 * 15 тестов покрывают: литералы, арифметику, сравнения,
 * логические операции, унарные операции, строковую конкатенацию,
 * переменные, execute (Assign, If/else, GoTo).
 */

import type { Expression, Statement, Span } from './dsl/ast.types.js';
import type { RuntimeState } from './interpreter/state.types.js';
import { evaluate, execute } from './interpreter/evaluator.js';

// ─── Хелперы для создания AST-узлов ───

/** Фиктивный span — в тестах позиция не важна. */
const dummySpan: Span = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function litNum(v: number): Expression {
  return { kind: 'LiteralNumber', value: v, span: dummySpan };
}

function litStr(v: string): Expression {
  return { kind: 'LiteralString', value: v, span: dummySpan };
}

function litBool(v: boolean): Expression {
  return { kind: 'LiteralBool', value: v, span: dummySpan };
}

function variable(name: string): Expression {
  return { kind: 'Variable', name, span: dummySpan };
}

function binOp(
  operator: '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=',
  left: Expression,
  right: Expression,
): Expression {
  return { kind: 'BinaryOp', operator, left, right, span: dummySpan };
}

function logicOp(operator: 'and' | 'or', left: Expression, right: Expression): Expression {
  return { kind: 'LogicalOp', operator, left, right, span: dummySpan };
}

function unaryOp(operator: 'not' | '-', operand: Expression): Expression {
  return { kind: 'UnaryOp', operator, operand, span: dummySpan };
}

// ─── Тесты evaluate() ───

interface EvalTest {
  name: string;
  expr: Expression;
  state: RuntimeState;
  expected: number | string | boolean;
}

const evalTests: EvalTest[] = [
  {
    name: 'сложение двух чисел',
    expr: binOp('+', litNum(2), litNum(3)),
    state: {},
    expected: 5,
  },
  {
    name: 'вычитание',
    expr: binOp('-', litNum(10), litNum(4)),
    state: {},
    expected: 6,
  },
  {
    name: 'умножение',
    expr: binOp('*', litNum(3), litNum(7)),
    state: {},
    expected: 21,
  },
  {
    name: 'деление',
    expr: binOp('/', litNum(20), litNum(4)),
    state: {},
    expected: 5,
  },
  {
    name: 'переменная из state',
    expr: variable('hp'),
    state: { hp: 100 },
    expected: 100,
  },
  {
    name: 'сравнение >= (true)',
    expr: binOp('>=', variable('hp'), litNum(50)),
    state: { hp: 100 },
    expected: true,
  },
  {
    name: 'сравнение == (false)',
    expr: binOp('==', variable('hp'), litNum(50)),
    state: { hp: 100 },
    expected: false,
  },
  {
    name: 'сравнение != (true)',
    expr: binOp('!=', litBool(true), litBool(false)),
    state: {},
    expected: true,
  },
  {
    name: 'логическое and (true and true)',
    expr: logicOp('and', litBool(true), litBool(true)),
    state: {},
    expected: true,
  },
  {
    name: 'логическое or (false or true)',
    expr: logicOp('or', litBool(false), litBool(true)),
    state: {},
    expected: true,
  },
  {
    name: 'логическое not',
    expr: unaryOp('not', litBool(false)),
    state: {},
    expected: true,
  },
  {
    name: 'унарный минус',
    expr: unaryOp('-', litNum(42)),
    state: {},
    expected: -42,
  },
  {
    name: 'конкатенация строк',
    expr: binOp('+', litStr('hello '), litStr('world')),
    state: {},
    expected: 'hello world',
  },
];

// ─── Тесты execute() ───

interface ExecTest {
  name: string;
  stmts: Statement[];
  initialState: RuntimeState;
  expectedState: RuntimeState;
}

const execTests: ExecTest[] = [
  {
    name: 'execute: Assign устанавливает переменную',
    stmts: [
      { kind: 'Assign', variable: 'hp', value: litNum(100), span: dummySpan },
    ],
    initialState: {},
    expectedState: { hp: 100 },
  },
  {
    name: 'execute: If then-ветка (условие true)',
    stmts: [
      {
        kind: 'If',
        condition: binOp('>=', variable('hp'), litNum(50)),
        thenBranch: [
          { kind: 'Assign', variable: 'status', value: litStr('healthy'), span: dummySpan },
        ],
        elseBranch: [
          { kind: 'Assign', variable: 'status', value: litStr('wounded'), span: dummySpan },
        ],
        span: dummySpan,
      },
    ],
    initialState: { hp: 80 },
    expectedState: { hp: 80, status: 'healthy' },
  },
  {
    name: 'execute: If else-ветка (условие false)',
    stmts: [
      {
        kind: 'If',
        condition: binOp('>=', variable('hp'), litNum(50)),
        thenBranch: [
          { kind: 'Assign', variable: 'status', value: litStr('healthy'), span: dummySpan },
        ],
        elseBranch: [
          { kind: 'Assign', variable: 'status', value: litStr('wounded'), span: dummySpan },
        ],
        span: dummySpan,
      },
    ],
    initialState: { hp: 20 },
    expectedState: { hp: 20, status: 'wounded' },
  },
  {
    name: 'execute: GoTo записывает __goto в state',
    stmts: [
      { kind: 'GoTo', target: 'boss_fight', span: dummySpan },
    ],
    initialState: { hp: 100 },
    expectedState: { hp: 100, __goto: 'boss_fight' },
  },
];

// ─── Запуск ───

let passed = 0;
let failed = 0;

// Тесты evaluate
for (const t of evalTests) {
  try {
    const actual = evaluate(t.expr, t.state);
    if (actual === t.expected) {
      console.log(`  \u2713 ${t.name}`);
      passed++;
    } else {
      console.log(`  \u2717 ${t.name}: ожидалось ${JSON.stringify(t.expected)}, получено ${JSON.stringify(actual)}`);
      failed++;
    }
  } catch (e) {
    console.log(`  \u2717 ${t.name}: исключение — ${e}`);
    failed++;
  }
}

// Тесты execute
for (const t of execTests) {
  try {
    const actual = execute(t.stmts, t.initialState);
    const actualJSON = JSON.stringify(actual, Object.keys(actual).sort());
    const expectedJSON = JSON.stringify(t.expectedState, Object.keys(t.expectedState).sort());
    if (actualJSON === expectedJSON) {
      console.log(`  \u2713 ${t.name}`);
      passed++;
    } else {
      console.log(`  \u2717 ${t.name}: ожидалось ${expectedJSON}, получено ${actualJSON}`);
      failed++;
    }
  } catch (e) {
    console.log(`  \u2717 ${t.name}: исключение — ${e}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
