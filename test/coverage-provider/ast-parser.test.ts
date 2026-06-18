import { describe, test, expect } from 'vitest';

import { parseSource } from '../../src/coverage-provider/ast-parser.js';

const ABS = '/proj/assembly/sample.ts';
const REL = 'assembly/sample.ts';

/** Sorted start lines of all extracted statements (robust to column specifics). */
function statementLines(src: string): number[] {
  return parseSource(src, REL, ABS).statements
    .map((s) => s.range.startLine)
    .sort((a, b) => a - b);
}

describe('parseSource — statement extraction', () => {
  test('extracts variable, if, and return statements (not the function decl or block)', () => {
    const src = [
      'export function f(n: i32): i32 {', // 1  function — NOT a statement
      '  let x = n + 1;',                 // 2  Variable
      '  if (x > 0) {',                   // 3  If
      '    return x;',                    // 4  Return
      '  }',                              // 5  Block — NOT a statement
      '  return 0;',                      // 6  Return
      '}',                                // 7
    ].join('\n');
    expect(statementLines(src)).toEqual([2, 3, 4, 6]);
  });

  test('extracts each variable declarator that has an initializer', () => {
    const src = [
      'export function g(): i32 {', // 1
      '  let a = 1, b = 2;',        // 2  two declarators -> two statements
      '  return a + b;',            // 3  Return
      '}',                          // 4
    ].join('\n');
    expect(statementLines(src)).toEqual([2, 2, 3]);
  });

  test('extracts while loop and its body statements', () => {
    const src = [
      'export function w(n: i32): i32 {', // 1
      '  let i = 0;',                     // 2  Variable
      '  while (i < n) {',                // 3  While
      '    i++;',                         // 4  Expression
      '  }',                              // 5
      '  return i;',                      // 6  Return
      '}',                                // 7
    ].join('\n');
    expect(statementLines(src)).toEqual([2, 3, 4, 6]);
  });

  test('ignores imports and empty function bodies', () => {
    const src = [
      'import { x } from "./other";',    // 1  import — NOT a statement
      'export function noop(): void {}', // 2  empty body — no statements
    ].join('\n');
    expect(statementLines(src)).toEqual([]);
  });

  test('records statement ranges with the absolute file path', () => {
    const src = 'export function f(): i32 {\n  return 1;\n}\n';
    const { statements } = parseSource(src, REL, ABS);
    expect(statements).toHaveLength(1);
    expect(statements[0]!.range.filePath).toBe(ABS);
    expect(statements[0]!.range.startLine).toBe(2);
  });
});
