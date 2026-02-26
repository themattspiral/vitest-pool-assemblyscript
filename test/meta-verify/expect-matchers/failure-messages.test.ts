import { describe, test, expect, beforeAll } from 'vitest';
import { type ParsedCliOutput, loadParsedCliOutput, requireErrorBlock, TEST_FILE_PREFIX } from '../helpers/shared.js';

const FIXTURE_FILE = `${TEST_FILE_PREFIX}test/assembly/expect-matchers/failure-messages.meta.test.ts`;

/** Construct the full test path as it appears in vitest's CLI FAIL header. */
function testPath(...segments: string[]): string {
  return `${FIXTURE_FILE} > ${segments.join(' > ')}`;
}

describe('matcher failure message verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  // =========================================================================
  // MATCHING FAILURES (AssertionError)
  //
  // Each test extracts the specific error block for a single fixture test
  // (scoped by full test path) and verifies the error type + message appear
  // within that block.
  // =========================================================================

  describe('toBe', () => {
    test('integer failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 1 to be 2');
    });

    test('string failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to be "world"');
    });

    test('float failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'float [should fail]'));
      expect(block).toContain('AssertionError: expected 1.5 to be 2.5');
    });

    test('array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'array [should fail]'));
      expect(block).toContain('AssertionError: expected [1,2] to be [1,2]');
    });

    test('map failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'map [should fail]'));
      expect(block).toContain('AssertionError: expected [object Map] to be [object Map]');
    });

    test('set failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'set [should fail]'));
      expect(block).toContain('AssertionError: expected [object Set] to be [object Set]');
    });

    test('user-defined object failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'user-defined object [should fail]'));
      expect(block).toContain('AssertionError: expected Point to be Point');
    });

    test('ArrayBuffer failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'ArrayBuffer [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[8] to be ArrayBuffer[8]');
    });
  });

  describe('toBeCloseTo', () => {
    test('float failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeCloseTo', 'float [should fail]'));
      expect(block).toContain('AssertionError: expected 0.30000000000000007 to be close to 0.5');
    });
  });

  describe('toEqual', () => {
    test('integer failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 1 to deeply equal 2');
    });

    test('string failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to deeply equal "world"');
    });

    test('float failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'float [should fail]'));
      expect(block).toContain('AssertionError: expected 1.5 to deeply equal 2.5');
    });

    test('number array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'number array [should fail]'));
      expect(block).toContain('AssertionError: expected [1,2,3,4] to deeply equal [1,2,7,4]');
    });

    test('string array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'string array [should fail]'));
      expect(block).toContain('AssertionError: expected ["one","two","three"] to deeply equal ["one","two","3"]');
    });

    test('map failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'map [should fail]'));
      expect(block).toContain('AssertionError: expected [object Map] to deeply equal [object Map]');
    });

    test('set failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'set [should fail]'));
      expect(block).toContain('AssertionError: expected [object Set] to deeply equal [object Set]');
    });

    test('ArrayBuffer same length failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'ArrayBuffer same length [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[4] to deeply equal ArrayBuffer[4]');
    });

    test('ArrayBuffer different length failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'ArrayBuffer different length [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[4] to deeply equal ArrayBuffer[8]');
    });
  });

  describe('toStrictEqual', () => {
    test('array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toStrictEqual', 'array [should fail]'));
      expect(block).toContain('AssertionError: expected [1,2] to strictly equal [1,3]');
    });
  });

  describe('inequality matchers', () => {
    test('toBeGreaterThan failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeGreaterThan', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 5 to be greater than 10');
    });

    test('toBeGreaterThanOrEqual failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeGreaterThanOrEqual', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 5 to be greater than or equal to 10');
    });

    test('toBeLessThan failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeLessThan', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 10 to be less than 5');
    });

    test('toBeLessThanOrEqual failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeLessThanOrEqual', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 10 to be less than or equal to 5');
    });
  });

  describe('type check matchers', () => {
    test('toBeTruthy failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeTruthy', 'zero [should fail]'));
      expect(block).toContain('AssertionError: expected 0 to be truthy');
    });

    test('toBeFalsy failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeFalsy', 'nonzero [should fail]'));
      expect(block).toContain('AssertionError: expected 1 to be falsey');
    });

    test('toBeNull failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeNull', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to be null');
    });

    test('toBeNullable failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeNullable', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to be nullable');
    });

    test('toBeNaN failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBeNaN', 'integer [should fail]'));
      expect(block).toContain('AssertionError: expected 77 to be NaN');
    });
  });

  describe('toHaveLength', () => {
    test('array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toHaveLength', 'array [should fail]'));
      expect(block).toContain('AssertionError: expected 3 to have length 5');
    });

    test('string failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toHaveLength', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected 5 to have length 3');
    });
  });

  // =========================================================================
  // RUNTIME ERRORS (WASMRuntimeError)
  //
  // Each test verifies a unique error message from the fixture's runtime
  // error scenarios. One representative test is verified per error path
  // (forward/reverse, each matcher direction — the fixture exercises all
  // directions but they produce the same error message type).
  // =========================================================================

  describe('float precision', () => {
    test('toBe - f32 vs i32 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBe', 'f32 vs i32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32: float precision is insufficient');
    });

    test('toBe - i32 vs f32 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBe', 'i32 vs f32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with f32: float precision is insufficient');
    });

    test('inequality - f64 vs i64 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBeGreaterThan', 'f64 vs i64 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f64 with i64: float precision is insufficient');
    });

    test('inequality - i64 vs f64 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBeGreaterThan', 'i64 vs f64 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i64 with f64: float precision is insufficient');
    });
  });

  describe('incomparable types', () => {
    test('inequality with arrays', () => {
      const block = requireErrorBlock(parsedCli, testPath('incomparable types', 'toBeGreaterThan with arrays [should fail]'));
      expect(block).toContain('WASMRuntimeError: Inequality comparison is not supported for Array<i32> and Array<i32>');
    });
  });

  describe('null string', () => {
    test('inequality', () => {
      const block = requireErrorBlock(parsedCli, testPath('null string', 'toBeGreaterThan [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare null string with inequality operators');
    });
  });

  describe('unsupported types', () => {
    const INEQUALITY_UNSUPPORTED_PREFIX = 'WASMRuntimeError: Inequality comparison is not supported for';
    const CLOSETO_UNSUPPORTED_PREFIX = 'WASMRuntimeError: Approximate comparison is not supported for';

    test('toBeGreaterThan with v128 vectors', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeGreaterThan with v128 [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} v128 and v128.`);
    });

    test('toBeGreaterThanOrEqual with v128 vectors', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeGreaterThanOrEqual with v128 [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} v128 and v128.`);
    });

    test('toBeLessThan with v128 vectors', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeLessThan with v128 [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} v128 and v128.`);
    });

    test('toBeLessThanOrEqual with v128 vectors', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeLessThanOrEqual with v128 [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} v128 and v128.`);
    });

    test('toBeCloseTo with v128 vectors', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeCloseTo with v128 [should fail]'));
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} v128 and v128`);
    });

    test('toBeGreaterThan with v128 actual and i32 expected', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeGreaterThan with v128 actual and i32 expected [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} v128 and i32.`);
    });

    test('toBeGreaterThan with i32 actual and v128 expected', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeGreaterThan with i32 actual and v128 expected [should fail]'));
      expect(block).toContain(`${INEQUALITY_UNSUPPORTED_PREFIX} i32 and v128.`);
    });

    test('toBeCloseTo with v128 actual and f32 expected', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeCloseTo with v128 actual and f32 expected [should fail]'));
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} v128 and f32`);
    });

    test('toBeCloseTo with f32 actual and v128 expected', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeCloseTo with f32 actual and v128 expected [should fail]'));
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} f32 and v128`);
    });
  });

  describe('cross-type comparison', () => {
    test('toEqual map vs array', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toEqual map vs array [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare deep equality between Map<~lib/string/String,i32> and Array<~lib/string/String>');
    });

    test('toEqual user class type mismatch', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toEqual user class type mismatch [should fail]'));
      expect(block).toContain('AssertionError: expected Circle to deeply equal Shape (runtime type mismatch)');
    });
  });

});
