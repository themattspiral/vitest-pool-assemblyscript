import { describe, test, expect, beforeAll } from 'vitest';
import { loadCliOutput } from '../helpers/shared.js';

const FIXTURE_FILE = 'expect-matchers/failure-messages.meta.test.ts';

describe('matcher failure message verification', () => {
  let cliOutput: string;
  let cleanOutput: string;

  beforeAll(async () => {
    cliOutput = await loadCliOutput();
    // Strip ANSI escape codes for clean matching
    cleanOutput = cliOutput.replace(/\x1b\[[0-9;]*m/g, '');
  });

  // =========================================================================
  // ASSERTION FAILURES (AssertionError)
  // =========================================================================

  describe('toBe', () => {
    test('integer failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 1 to be 2');
    });

    test('string failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected "hello" to be "world"');
    });

    test('float failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 1.5 to be 2.5');
    });

    test('array failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [1,2] to be [1,2]');
    });

    test('map failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [object Map] to be [object Map]');
    });

    test('set failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [object Set] to be [object Set]');
    });

    test('user-defined object failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected SimpleObject to be SimpleObject');
    });
  });

  describe('toBeCloseTo', () => {
    test('float failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 0.30000000000000007 to be close to 0.5');
    });
  });

  describe('toEqual', () => {
    test('integer failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 1 to deeply equal 2');
    });

    test('string failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected "hello" to deeply equal "world"');
    });

    test('float failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 1.5 to deeply equal 2.5');
    });

    test('number array failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [1,2,3,4] to deeply equal [1,2,7,4]');
    });

    test('string array failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected ["one","two","three"] to deeply equal ["one","two","3"]');
    });

    test('map failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [object Map] to deeply equal [object Map]');
    });

    test('set failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [object Set] to deeply equal [object Set]');
    });
  });

  describe('toStrictEqual', () => {
    test('array failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected [1,2] to strictly equal [1,3]');
    });
  });

  describe('inequality matchers', () => {
    test('toBeGreaterThan failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 5 to be greater than 10');
    });

    test('toBeGreaterThanOrEqual failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 5 to be greater than or equal to 10');
    });

    test('toBeLessThan failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 10 to be less than 5');
    });

    test('toBeLessThanOrEqual failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 10 to be less than or equal to 5');
    });
  });

  describe('type check matchers', () => {
    test('toBeTruthy failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 0 to be truthy');
    });

    test('toBeFalsy failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 1 to be falsey');
    });

    test('toBeNull failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected "hello" to be null');
    });

    test('toBeNullable failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected "hello" to be nullable');
    });

    test('toBeNaN failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 77 to be NaN');
    });
  });

  describe('toHaveLength', () => {
    test('array failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 3 to have length 5');
    });

    test('string failure message', () => {
      expect(cleanOutput).toContain('AssertionError: expected 5 to have length 3');
    });
  });

  // =========================================================================
  // RUNTIME ERRORS (WASMRuntimeError)
  // Each unique error message is verified once. The fixture tests exercise
  // every matcher × direction combination; verify tests confirm the messages
  // render correctly in vitest CLI output.
  // =========================================================================

  describe('float precision', () => {
    test('toBe/toEqual - f32 vs i32 (forward)', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare f32 with i32: float precision is insufficient');
    });

    test('toBe/toEqual - i32 vs f32 (reverse)', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare i32 with f32: float precision is insufficient');
    });

    test('inequality - f64 vs i64 (forward)', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare f64 with i64: float precision is insufficient');
    });

    test('inequality - i64 vs f64 (reverse)', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare i64 with f64: float precision is insufficient');
    });
  });

  describe('incomparable types', () => {
    test('inequality with arrays', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Inequality comparison is not supported for Array<i32> and Array<i32>');
    });
  });

  describe('null string', () => {
    test('inequality', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare null string with inequality operators');
    });
  });

  describe('cross-type comparison', () => {
    test('toEqual map vs array', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Cannot compare equality between Map<~lib/string/String,i32> and Array<~lib/string/String> - this comparison is undefined.');
    });
  });

  describe('deep equality', () => {
    test('toEqual with objects', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: Deep equality comparison of user-defined reference types is not yet implemented');
    });
  });
});
