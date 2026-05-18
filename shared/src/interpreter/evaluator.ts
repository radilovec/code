/**
 * AST-интерпретатор для DSL интерактивных видео-сценариев.
 *
 * Две чистые функции:
 * - evaluate() — вычисляет выражение (Expression) в контексте состояния;
 * - execute()  — исполняет список инструкций (Statement[]), возвращая новое состояние.
 *
 * Безопасность: никакого eval(), Function(), vm.runInContext(). Все вычисления —
 * явный обход AST-дерева (pattern matching по `kind`). AST одинаково
 * интерпретируется и на клиенте (плеер), и на сервере (валидация при публикации).
 */

import type { Expression, Statement } from '../dsl/ast.types.js';
import type { RuntimeState } from './state.types.js';

// ─────────────────────────────────────────────
// evaluate: Expression → значение
// ─────────────────────────────────────────────

/**
 * Вычисляет AST-выражение в контексте текущего состояния.
 * Возвращает примитив: number, string или boolean.
 * Бросает Error при неизвестном узле или необъявленной переменной.
 */
export function evaluate(
  expr: Expression,
  state: RuntimeState,
): number | string | boolean {
  switch (expr.kind) {
    // --- Литералы ---
    case 'LiteralString':
    case 'LiteralNumber':
    case 'LiteralBool':
      return expr.value;

    // --- Переменная ---
    case 'Variable': {
      const val = state[expr.name];
      if (val === undefined) {
        throw new Error(`Undefined variable: "${expr.name}"`);
      }
      return val;
    }

    // --- Бинарные операции (арифметика + сравнение) ---
    case 'BinaryOp': {
      const left = evaluate(expr.left, state);
      const right = evaluate(expr.right, state);
      return applyBinaryOp(expr.operator, left, right);
    }

    // --- Логические операции (short-circuit) ---
    case 'LogicalOp': {
      const leftVal = evaluate(expr.left, state);
      if (expr.operator === 'and') {
        return leftVal ? !!evaluate(expr.right, state) : false;
      }
      // or
      return leftVal ? true : !!evaluate(expr.right, state);
    }

    // --- Унарные операции ---
    case 'UnaryOp': {
      const operand = evaluate(expr.operand, state);
      if (expr.operator === 'not') {
        return !operand;
      }
      // унарный минус
      if (typeof operand !== 'number') {
        throw new Error(`Unary minus applied to non-number: ${typeof operand}`);
      }
      return -operand;
    }

    default: {
      // exhaustive check
      const _never: never = expr;
      throw new Error(`Unknown expression kind: ${(_never as Expression).kind}`);
    }
  }
}

// ─────────────────────────────────────────────
// applyBinaryOp: вспомогательная функция
// ─────────────────────────────────────────────

/** Проверяет, что оба операнда — числа. Бросает при несовпадении типов. */
function expectNumbers(
  op: string,
  left: number | string | boolean,
  right: number | string | boolean,
): asserts left is number {
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new Error(
      `Operator "${op}" requires numbers, got ${typeof left} and ${typeof right}`,
    );
  }
}

function applyBinaryOp(
  op: string,
  left: number | string | boolean,
  right: number | string | boolean,
): number | string | boolean {
  switch (op) {
    // Арифметика (+ поддерживает конкатенацию строк)
    case '+':
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left) + String(right);
      }
      expectNumbers(op, left, right);
      return (left as number) + (right as number);
    case '-':
      expectNumbers(op, left, right);
      return (left as number) - (right as number);
    case '*':
      expectNumbers(op, left, right);
      return (left as number) * (right as number);
    case '/': {
      expectNumbers(op, left, right);
      if ((right as number) === 0) {
        throw new Error('Division by zero');
      }
      return (left as number) / (right as number);
    }

    // Сравнение (== и != работают для любых типов)
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      expectNumbers(op, left, right);
      return (left as number) < (right as number);
    case '<=':
      expectNumbers(op, left, right);
      return (left as number) <= (right as number);
    case '>':
      expectNumbers(op, left, right);
      return (left as number) > (right as number);
    case '>=':
      expectNumbers(op, left, right);
      return (left as number) >= (right as number);

    default:
      throw new Error(`Unknown binary operator: ${op}`);
  }
}

// ─────────────────────────────────────────────
// execute: Statement[] → новое состояние
// ─────────────────────────────────────────────

/**
 * Исполняет список инструкций и возвращает обновлённое состояние.
 *
 * Входное состояние НЕ мутируется — создаётся поверхностная копия.
 * Инструкции Text, Video и Choice игнорируются — они обрабатываются
 * плеером на уровне представления, а не интерпретатором.
 *
 * GoTo записывает `__goto: targetSceneId` в состояние — плеер
 * проверяет этот ключ после execute() для перехода.
 */
export function execute(
  stmts: Statement[],
  state: RuntimeState,
): RuntimeState {
  let current: RuntimeState = { ...state };

  for (const stmt of stmts) {
    switch (stmt.kind) {
      // Присваивание: set var = expr
      case 'Assign':
        current = { ...current, [stmt.variable]: evaluate(stmt.value, current) };
        break;

      // Условный блок: if cond { ... } else { ... }
      case 'If': {
        const condVal = evaluate(stmt.condition, current);
        if (condVal) {
          current = execute(stmt.thenBranch, current);
        } else if (stmt.elseBranch) {
          current = execute(stmt.elseBranch, current);
        }
        break;
      }

      // Безусловный переход: goto scene
      case 'GoTo':
        current = { ...current, __goto: stmt.target };
        break;

      // Text, Video, Choice — пропускаем, обрабатываются плеером
      case 'Text':
      case 'Video':
      case 'Choice':
        break;

      default: {
        const _never: never = stmt;
        throw new Error(`Unknown statement kind: ${(_never as Statement).kind}`);
      }
    }
  }

  return current;
}
