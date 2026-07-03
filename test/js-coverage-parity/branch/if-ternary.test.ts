import { test, describe, expect } from 'vitest';
import {
  absVal, clampLow, classify, clampRange, pickFirst, orDefault, sign,
  gateThenOnly, guardElseOnly, gateAfterStmts, countBelowThreshold,
  gateAfterStmtsWithElse,
} from '../../js-coverage-parity-src/branch/if-ternary.js';

// Parity twin for the AS if/ternary fixtures: identical inputs to if-ternary.meta.test.ts
// so v8's branch coverage is the comparison oracle for the AS coverage.
describe('if / ternary branch parity twin', () => {
  test('absVal', () => {
    expect(absVal(-3)).toBe(3);
    expect(absVal(5)).toBe(5);
    expect(absVal(-1)).toBe(1);
  });
  test('clampLow', () => {
    expect(clampLow(-3)).toBe(0);
    expect(clampLow(5)).toBe(5);
  });
  test('classify', () => {
    expect(classify(-5)).toBe(-1);
    expect(classify(0)).toBe(0);
    expect(classify(9)).toBe(1);
  });
  test('clampRange', () => {
    expect(clampRange(50)).toBe(50);
    expect(clampRange(200)).toBe(100);
    expect(clampRange(-5)).toBe(0);
  });
  test('pickFirst', () => {
    expect(pickFirst(true)).toBe(1);
    expect(pickFirst(false)).toBe(2);
  });
  test('orDefault', () => {
    expect(orDefault(0, 9)).toBe(9);
    expect(orDefault(0, 7)).toBe(7);
  });
  test('sign', () => {
    expect(sign(5)).toBe(1);
    expect(sign(-3)).toBe(-1);
    expect(sign(0)).toBe(0);
  });
  test('gateThenOnly', () => {
    expect(gateThenOnly(5)).toBe(1);
    expect(gateThenOnly(3)).toBe(1);
  });
  test('guardElseOnly', () => {
    expect(guardElseOnly(5)).toBe(5);
    expect(guardElseOnly(3)).toBe(3);
  });
  test('gateAfterStmts', () => {
    expect(gateAfterStmts(1)).toBe(1);
    expect(gateAfterStmts(5)).toBe(0);
  });
  test('countBelowThreshold', () => {
    expect(countBelowThreshold(4)).toBe(2);
  });
  test('gateAfterStmtsWithElse', () => {
    expect(gateAfterStmtsWithElse(3)).toBe(1);
    expect(gateAfterStmtsWithElse(1)).toBe(0);
  });
});
