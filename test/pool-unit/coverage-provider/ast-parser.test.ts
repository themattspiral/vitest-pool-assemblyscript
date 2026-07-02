import { describe, test, expect } from 'vitest';

import { parseSource } from '../../../src/coverage-provider/ast-parser.js';

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

  test('flags module-scope variable declarations, not in-function ones', () => {
    const src = [
      'let topConst = 1024;',         // 1  module scope -> flagged
      'export function f(): i32 {',   // 2
      '  let local = 1;',             // 3  in-function -> not flagged
      '  return local;',             // 4
      '}',                            // 5
      'let makeArrow = (): i32 => {', // 6  module-scope binding -> flagged
      '  let inArrow = 2;',           // 7  inside arrow body -> not flagged
      '  return inArrow;',           // 8
      '};',                           // 9
    ].join('\n');
    const flagByLine = new Map(
      parseSource(src, REL, ABS).statements.map((s) => [s.range.startLine, s.isModuleLevelDeclaration])
    );
    expect(flagByLine.get(1)).toBe(true);   // top-level const
    expect(flagByLine.get(3)).toBe(false);  // declaration inside a function
    expect(flagByLine.get(6)).toBe(true);   // module-scope arrow binding (a variable decl)
    expect(flagByLine.get(7)).toBe(false);  // declaration inside the arrow body
  });

  test('flags module-scope const AND let, but not declarations inside a block', () => {
    const src = [
      'let topLet = 1;',         // 1  module scope -> flagged
      'const topConst = 2;',     // 2  module scope -> flagged
      'if (topLet > 0) {',       // 3
      '  const inBlock = 3;',    // 4  inside a module-level block -> NOT flagged
      '  let alsoInBlock = 4;',  // 5  inside a module-level block -> NOT flagged
      '}',                       // 6
      '{',                       // 7  bare block
      '  let inBareBlock = 5;',  // 8  inside a bare block -> NOT flagged
      '}',                       // 9
    ].join('\n');
    const flagByLine = new Map(
      parseSource(src, REL, ABS).statements.map((s) => [s.range.startLine, s.isModuleLevelDeclaration])
    );
    expect(flagByLine.get(1)).toBe(true);   // top-level let
    expect(flagByLine.get(2)).toBe(true);   // top-level const
    expect(flagByLine.get(4)).toBe(false);  // const in a module-level if-block
    expect(flagByLine.get(5)).toBe(false);  // let in a module-level if-block
    expect(flagByLine.get(8)).toBe(false);  // let in a bare block
  });

  test('flags namespace-level declarations (they run at module init)', () => {
    const src = [
      'namespace Config {',          // 1
      '  export const SIZE = 1024;', // 2  namespace scope -> flagged
      '}',                           // 3
    ].join('\n');
    const flagByLine = new Map(
      parseSource(src, REL, ABS).statements.map((s) => [s.range.startLine, s.isModuleLevelDeclaration])
    );
    expect(flagByLine.get(2)).toBe(true);   // namespace-level const
  });

  test('expression-bodied arrow: only the module binding is flagged, not the body', () => {
    // AS supports expression-bodied arrows and wraps the body in an
    // ExpressionStatement (parser.ts parseFunctionExpressionCommon). So L1 yields
    // TWO statements — the `const` binding (module scope, flagged) and the arrow
    // body's ExpressionStatement (visited at functionDepth 1, NOT flagged) — hence
    // we assert on the flagged set rather than by line.
    const src = [
      'const compute = (): i32 => 1 + 2;', // 1  binding flagged; arrow body (L1) not
      'export function host(): i32 {',     // 2
      '  const inner = compute();',        // 3  in-function -> not flagged
      '  return inner;',                  // 4
      '}',                                 // 5
    ].join('\n');
    const flaggedLines = parseSource(src, REL, ABS).statements
      .filter((s) => s.isModuleLevelDeclaration)
      .map((s) => s.range.startLine);
    // Exactly one module-level declaration: the arrow binding on L1. The arrow's
    // expression body and the in-function `inner` (L3) are not flagged.
    expect(flaggedLines).toEqual([1]);
  });
});

describe('parseSource — branch extraction (if / ternary)', () => {
  const branches = (src: string) => parseSource(src, REL, ABS).branches;

  test('if without else: two paths, the implicit else marked', () => {
    const src = [
      'export function f(n: i32): i32 {', // 1
      '  if (n > 0) {',                   // 2  if, condition n > 0
      '    return 1;',                    // 3  then
      '  }',                              // 4
      '  return 0;',                      // 5
      '}',                                // 6
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('if');
    expect(b[0]!.conditionRange.startLine).toBe(2);
    expect(b[0]!.paths).toHaveLength(2);
    expect(b[0]!.implicitPathIndices).toEqual([1]); // implicit else
    // implicit arm uses the construct range (Istanbul convention)
    expect(b[0]!.paths[1]).toEqual(b[0]!.range);
  });

  test('if/else: two explicit paths, no implicit', () => {
    const src = [
      'export function g(n: i32): i32 {', // 1
      '  if (n > 0) {',                   // 2
      '    return 1;',                    // 3  then
      '  } else {',                       // 4
      '    return -1;',                   // 5  else
      '  }',                              // 6
      '}',                                // 7
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('if');
    expect(b[0]!.paths).toHaveLength(2);
    expect(b[0]!.implicitPathIndices).toEqual([]);
    // Arm ranges start at the block's `{`, so assert each arm CONTAINS its
    // distinguishing statement (then → `return 1` line 3; else → `return -1` line 5)
    // rather than over-fitting to brace positions.
    const [thenArm, elseArm] = b[0]!.paths;
    expect(thenArm!.startLine).toBeLessThanOrEqual(3);
    expect(thenArm!.endLine).toBeGreaterThanOrEqual(3);
    expect(elseArm!.startLine).toBeLessThanOrEqual(5);
    expect(elseArm!.endLine).toBeGreaterThanOrEqual(5);
    expect(elseArm!.startLine).toBeGreaterThan(thenArm!.startLine); // distinct arms
  });

  test('ternary: cond-expr with two explicit arms', () => {
    const src = [
      'export function h(n: i32): i32 {', // 1
      '  return n > 0 ? 1 : -1;',         // 2  ternary
      '}',                                // 3
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('cond-expr');
    expect(b[0]!.paths).toHaveLength(2);
    expect(b[0]!.implicitPathIndices).toEqual([]);
    expect(b[0]!.conditionRange.startLine).toBe(2);
  });

  test('nested ifs produce one branch each', () => {
    const src = [
      'export function k(n: i32): i32 {', // 1
      '  if (n > 0) {',                   // 2  if #1
      '    if (n > 10) {',                // 3  if #2 (nested)
      '      return 2;',                  // 4
      '    }',                            // 5
      '    return 1;',                    // 6
      '  }',                              // 7
      '  return 0;',                      // 8
      '}',                                // 9
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(2);
    expect(b.every((x) => x.branchType === 'if')).toBe(true);
    // both are if-without-else → each has an implicit arm
    expect(b.every((x) => x.implicitPathIndices.length === 1)).toBe(true);
  });

  test('logical && is a binary-expr branch with two operand arms', () => {
    const src = [
      'export function f(a: bool, b: bool): bool {', // 1
      '  return a && b;',                            // 2  &&
      '}',                                           // 3
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('binary-expr');
    expect(b[0]!.paths).toHaveLength(2);
    expect(b[0]!.implicitPathIndices).toEqual([]);
  });

  test('logical || is a binary-expr branch', () => {
    const src = 'export function f(a: bool, b: bool): bool {\n  return a || b;\n}\n';
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('binary-expr');
  });

  test('if with a logical condition yields both the && and the if as branches', () => {
    const src = [
      'export function g(a: bool, b: bool): i32 {', // 1
      '  if (a && b) {',                            // 2  && + if
      '    return 1;',                              // 3
      '  }',                                        // 4
      '  return 0;',                                // 5
      '}',                                          // 6
    ].join('\n');
    const types = branches(src).map((x) => x.branchType).sort();
    expect(types).toEqual(['binary-expr', 'if']);
  });

  test('arithmetic and comparison binaries are NOT branches', () => {
    const src = [
      'export function h(a: i32, b: i32): bool {', // 1
      '  let sum = a + b;',                        // 2  + (not a branch)
      '  return sum > 0 == (a == b);',             // 3  >, == (not branches)
      '}',                                         // 4
    ].join('\n');
    expect(branches(src)).toEqual([]);
  });

  test('switch with default: one branch, one arm per case clause', () => {
    const src = [
      'export function f(n: i32): i32 {', // 1
      '  switch (n) {',                   // 2  switch, condition n
      '    case 1: return 10;',           // 3  case 1
      '    case 2: return 20;',           // 4  case 2
      '    default: return 0;',           // 5  default
      '  }',                              // 6
      '}',                                // 7
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('switch');
    expect(b[0]!.conditionRange.startLine).toBe(2);
    expect(b[0]!.paths).toHaveLength(3); // case 1, case 2, default
    expect(b[0]!.implicitPathIndices).toEqual([]); // explicit default present
  });

  test('switch without default: an implicit default arm is added', () => {
    const src = [
      'export function g(n: i32): i32 {', // 1
      '  switch (n) {',                   // 2
      '    case 1: return 10;',           // 3
      '    case 2: return 20;',           // 4
      '  }',                              // 5
      '  return 0;',                      // 6
      '}',                                // 7
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    expect(b[0]!.branchType).toBe('switch');
    expect(b[0]!.paths).toHaveLength(3); // case 1, case 2, implicit default
    expect(b[0]!.implicitPathIndices).toEqual([2]);
    expect(b[0]!.paths[2]).toEqual(b[0]!.range); // implicit default = construct range
    expect(b[0]!.fallThroughCasePathIndices).toEqual([]); // both cases `return` → terminal
  });

  test('switch fall-through cases are flagged; terminated cases are not', () => {
    const src = [
      'export function f(n: i32): i32 {',  // 1
      '  let r: i32 = 0;',                 // 2
      '  switch (n) {',                    // 3
      '    case 1:',                       // 4  empty → falls through to case 2
      '    case 2:',                       // 5  body, break → terminal
      '      r = 12;',                     // 6
      '      break;',                      // 7
      '    case 3:',                       // 8  body, NO break → falls through to case 4
      '      r = 3;',                      // 9
      '    case 4:',                       // 10 body, return → terminal (and last clause)
      '      return 4;',                   // 11
      '  }',                               // 12
      '  return r;',                       // 13
      '}',                                 // 14
    ].join('\n');
    const b = branches(src);
    expect(b).toHaveLength(1);
    // paths: [case1(empty), case2(body), case3(body,no-break), case4(body), implicit-default]
    expect(b[0]!.paths).toHaveLength(5);
    expect(b[0]!.emptyCasePathIndices).toEqual([0]);          // case 1 empty
    expect(b[0]!.fallThroughCasePathIndices).toEqual([0, 2]); // case 1 (empty) + case 3 (no break)
    expect(b[0]!.implicitPathIndices).toEqual([4]);           // no default
  });
});
