import { test, describe, expect } from 'vitest';
import {
  calledOnce, calledTwice, calledThrice, calledFiveTimes, countdown, identity,
} from '../../js-coverage-parity-src/function/counting.js';

// Parity twin for the AS counting fixture: identical call sequence to
// function/counting.meta.test.ts, so v8's function coverage is the comparison oracle.
describe('function counting parity twin', () => {
  test('each function is called the matching number of times', () => {
    expect(calledOnce()).toBe(1);

    calledTwice();
    expect(calledTwice()).toBe(2);

    calledThrice();
    calledThrice();
    expect(calledThrice()).toBe(3);

    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    calledFiveTimes();
    expect(calledFiveTimes()).toBe(5);
    // neverCalled is intentionally never invoked
  });

  test('recursion yields one entry per call', () => {
    expect(countdown(4)).toBe(0);
  });

  test('generic called with two types', () => {
    expect(identity(1)).toBe(1);
    expect(identity(2.5)).toBe(2.5);
  });
});
