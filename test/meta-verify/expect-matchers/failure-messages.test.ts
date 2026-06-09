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
      expect(block).toContain('AssertionError: expected [1, 2, 3] to be [1, 2, 3]');
    });

    test('map failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'map [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "x" => 1, "y" => 2 } to be Map { "x" => 1, "y" => 2 }');
    });

    test('set failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'set [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2, 3 } to be Set { 1, 2, 3 }');
    });

    test('user-defined object failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'user-defined object [should fail]'));
      expect(block).toContain('AssertionError: expected Point{ x: 1, y: 2 } to be Point{ x: 1, y: 2 }');
    });

    test('ArrayBuffer failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'ArrayBuffer [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[8] to be ArrayBuffer[8]');
    });

    test('SIMD vector failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toBe', 'SIMD vector [should fail]'));
      expect(block).toContain('AssertionError: expected v128 to be v128');
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
      expect(block).toContain('AssertionError: expected [1, 2, 3, 4] to deeply equal [1, 2, 7, 4] (differs at index [2])');
    });

    test('string array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'string array [should fail]'));
      expect(block).toContain('AssertionError: expected ["one", "two", "three"] to deeply equal ["one", "two", "3"] (differs at index [2])');
    });

    test('map failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'map [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "x" => 1, "y" => 2 } to deeply equal Map { "x" => 1, "y" => 99 } (differs at key ["y"])');
    });

    test('map with integer key failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'map with integer key [should fail]'));
      expect(block).toContain('AssertionError: expected Map { 7 => 100, 8 => 200 } to deeply equal Map { 7 => 100, 8 => 999 } (differs at key [8])');
    });

    test('set failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'set [should fail]'));
      expect(block).toContain('AssertionError: expected Set { "apple", "cherry" } to deeply equal Set { "apple", "banana" }');
    });

    test('ArrayBuffer same length failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'ArrayBuffer same length [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[4] to deeply equal ArrayBuffer[4]');
    });

    test('ArrayBuffer different length failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'ArrayBuffer different length [should fail]'));
      expect(block).toContain('AssertionError: expected ArrayBuffer[4] to deeply equal ArrayBuffer[8]');
    });

    test('SIMD vector failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toEqual', 'SIMD vector [should fail]'));
      expect(block).toContain('AssertionError: expected v128 to deeply equal v128');
    });
  });

  describe('toStrictEqual', () => {
    test('array failure message', () => {
      const block = requireErrorBlock(parsedCli, testPath('toStrictEqual', 'array [should fail]'));
      expect(block).toContain('AssertionError: expected [1, 2] to strictly equal [1, 3] (differs at index [1])');
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

  describe('toContain failure messages', () => {
    test('array of primitives', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'array of primitives [should fail]'));
      expect(block).toContain('AssertionError: expected [1, 2, 3] to contain 7');
    });
    
    test('array of objects', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'array of objects [should fail]'));
      expect(block).toContain('AssertionError: expected [Point{ x: 1, y: 2 }, Point{ …(2) }] to contain Point{ x: 1, y: 2 }');
    });
    
    test('string', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to contain "low"');
    });
    
    test('set of primitives', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'set of primitives [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2 } to contain 7');
    });
    
    test('set of primitives does not contain', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'set of primitives does not contain [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2 } not to contain 2');
    });
    
    test('set of objects', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'set of objects [should fail]'));
      expect(block).toContain('AssertionError: expected Set { Point{ x: 1, y: 2 }, …(1) } to contain Point{ x: 3, y: 4 }');
    });

    test('map using entry with primitive val', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'map using entry with primitive val [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => 1, "two" => 2 } to contain entry("one", 7)');
    });

    test('map using entry with object val', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'map using entry with object val [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => Point{ …(2) }, …(1) } to contain entry("one", Point{ x: 1, y: 2 })');
    });
    
    test('map using array with strings', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContain', 'map using array with strings [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => "ONE!", …(1) } to contain ["seven", "SEVEN!"]');
    });
  });
  
  describe('toContainEqual failure messages', () => {
    test('array of primitives', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'array of primitives [should fail]'));
      expect(block).toContain('AssertionError: expected [1, 2, 3] to deep equally contain 7');
    });
    
    test('array of objects', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'array of objects [should fail]'));
      expect(block).toContain('AssertionError: expected [Point{ x: 1, y: 2 }, Point{ …(2) }] to deep equally contain Point{ x: 8, y: 9 }');
    });
    
    test('array of objects with nested field fail', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'array of objects with nested field fail [should fail]'));
      expect(block).toContain('AssertionError: expected [ShapeWrapper{ …(2) }, …(2)] to deep equally contain ShapeWrapper{ label: "w1", …(1) }');
    });
    
    test('string', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'string [should fail]'));
      expect(block).toContain('AssertionError: expected "hello" to deep equally contain "low"');
    });
    
    test('set of primitives', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'set of primitives [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2 } to deep equally contain 7');
    });

    test('set of primitives does not contain', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'set of primitives does not contain [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2 } not to deep equally contain 2');
    });
    
    test('set of objects', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'set of objects [should fail]'));
      expect(block).toContain('AssertionError: expected Set { Point{ x: 1, y: 2 }, …(1) } to deep equally contain Point{ x: 8, y: 9 }');
    });

    test('map using entry with primitive val', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'map using entry with primitive val [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => 1, "two" => 2 } to deep equally contain entry("one", 7)');
    });

    test('map using entry with object val', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'map using entry with object val [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => Point{ …(2) }, …(1) } to deep equally contain entry("one", Point{ x: 8, y: 9 })');
    });
    
    test('map using array with strings', () => {
      const block = requireErrorBlock(parsedCli, testPath('toContainEqual', 'map using array with strings [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "one" => "ONE!", …(1) } to deep equally contain ["seven", "SEVEN!"]');
    });
  });

  // =========================================================================
  // RUNTIME ERRORS (WASMRuntimeError)
  //
  // Each test verifies a unique error message from the fixture's runtime
  // error scenarios. One representative test is verified per error path
  // (forward/reverse, each matcher direction — the fixture exercises all
  // directions but they produce the same error message type).
  //
  // Error message constants: static suffixes extracted from compare.ts throw
  // messages. Each test concatenates the type-specific prefix with the
  // appropriate suffix to verify the complete message.
  // =========================================================================

  // Float precision — two variants: toBe (via identical()) and inequality (via compareInequality())
  // differ only in the suggestion text (toBe vs toBeGreaterThan).
  const FLOAT_PRECISION_TOBE_SUFFIX = ': float precision is insufficient for the integer type\'s range.'
    + ' Cast both values to f64 before comparing, e.g. expect(f64(a)).toBe(f64(b)).'
    + ' Note: large integer values may lose precision when cast to f64, which could cause false positives.';
  const FLOAT_PRECISION_INEQUALITY_SUFFIX = ': float precision is insufficient for the integer type\'s range.'
    + ' Cast both values to f64 before comparing, e.g. expect(f64(a)).toBeGreaterThan(f64(b)).'
    + ' Note: large integer values may lose precision when cast to f64, which could cause false positives.';

  // Inequality with non-orderable types
  const INEQUALITY_REFERENCE_SUFFIX = '. Only numeric types and strings can be compared with inequality matchers.';

  // Approximate comparison with unsupported types
  const CLOSETO_UNSUPPORTED_SUFFIX = '. Extract lane values and compare them individually with toBeCloseTo().';

  // Null string inequality
  const NULL_STRING_INEQUALITY_MESSAGE = 'WASMRuntimeError: Cannot compare null string with inequality operators:'
    + ' the result is undefined. Use toBeNull() to check for null values.';

  describe('float precision', () => {
    test('toBe - f32 vs i32 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBe', 'f32 vs i32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('toBe - i32 vs f32 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBe', 'i32 vs f32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with f32' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('inequality - f64 vs i64 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBeGreaterThan', 'f64 vs i64 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f64 with i64' + FLOAT_PRECISION_INEQUALITY_SUFFIX);
    });

    test('inequality - i64 vs f64 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toBeGreaterThan', 'i64 vs f64 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i64 with f64' + FLOAT_PRECISION_INEQUALITY_SUFFIX);
    });

    test('toContain - f32 vs i32 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toContain', 'f32 vs i32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('toContain - i32 vs f32 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toContain', 'i32 vs f32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with f32' + FLOAT_PRECISION_TOBE_SUFFIX);
    });
    
    test('toContainEqual - f32 vs i32 (forward)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toContainEqual', 'f32 vs i32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 at index [0]' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('toContainEqual - i32 vs f32 (reverse)', () => {
      const block = requireErrorBlock(parsedCli, testPath('float precision - toContainEqual', 'i32 vs f32 [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with f32 at index [0]' + FLOAT_PRECISION_TOBE_SUFFIX);
    });
  });

  describe('incomparable types', () => {
    test('inequality with arrays', () => {
      const block = requireErrorBlock(parsedCli, testPath('incomparable types', 'toBeGreaterThan with arrays [should fail]'));
      expect(block).toContain('WASMRuntimeError: Inequality comparison is not supported for Array<i32> and Array<i32>' + INEQUALITY_REFERENCE_SUFFIX);
    });
  });

  describe('null string', () => {
    test('inequality', () => {
      const block = requireErrorBlock(parsedCli, testPath('null string', 'toBeGreaterThan [should fail]'));
      expect(block).toContain(NULL_STRING_INEQUALITY_MESSAGE);
    });
  });

  describe('unsupported types', () => {
    const INEQUALITY_UNSUPPORTED_PREFIX = 'WASMRuntimeError: Inequality comparison is not supported for';
    const CLOSETO_UNSUPPORTED_PREFIX = 'WASMRuntimeError: Approximate comparison is not supported for';

    test('toBe with reference and primitive', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBe with reference and primitive [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare Point with i32' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });
    
    test('toEqual with reference and primitive', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toEqual with reference and primitive [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare Point with i32' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });

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
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} v128 and v128${CLOSETO_UNSUPPORTED_SUFFIX}`);
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
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} v128 and f32${CLOSETO_UNSUPPORTED_SUFFIX}`);
    });

    test('toBeCloseTo with f32 actual and v128 expected', () => {
      const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toBeCloseTo with f32 actual and v128 expected [should fail]'));
      expect(block).toContain(`${CLOSETO_UNSUPPORTED_PREFIX} f32 and v128${CLOSETO_UNSUPPORTED_SUFFIX}`);
    });
    
    describe("toContain", () => {
      test('toContain with i32 array actual and v128 expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with i32 array actual and v128 expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with v128: incompatible types`);
      });
      
      test('toContain with i32 array actual and Point expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with i32 array actual and Point expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with Point: reference and value types are not comparable`);
      });
      
      test('toContain with string actual and i32 expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with string actual and i32 expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a given value of type i32`);
      });
      
      test('toContain with string actual and Point expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with string actual and Point expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a given value of type Point`);
      });
      
      test('toContain with nullable array null actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with nullable array null actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if null contains a given value of type i32`);
      });
      
      test('toContain with nullable string null actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with nullable string null actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if null contains a given value of type String`);
      });

      test('toContain with bare null actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with bare null actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if null contains a given value of type i32`);
      });
      
      test('toContain with string actual and bare null expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with string actual and bare null expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a null value`);
      });
      
      test('toContain with string actual and null value expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with string actual and null value expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a null value`);
      });
      
      test('toContain with primitive actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with primitive actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if type u64 contains a given value of type i32`);
      });
      
      test('toContain with object actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with object actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if type Point contains a given value of type i32`);
      });

      test('toContain with ArrayBuffer actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContain', 'toContain with ArrayBuffer actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: An ArrayBuffer has no element type to search for membership with toContain / toContainEqual.`);
      });
    });
    
    describe("toContainEqual", () => {
      test('toContainEqual with i32 array actual and v128 expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with i32 array actual and v128 expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with v128 at index [0]: incompatible types`);
      });
      
      test('toContainEqual with i32 array actual and Point expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with i32 array actual and Point expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with Point at index [0]: reference and value types are not comparable`);
      });
      
      test('toContainEqual with string actual and i32 expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with string actual and i32 expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a given value of type i32`);
      });
      
      test('toContainEqual with string actual and Point expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with string actual and Point expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a given value of type Point`);
      });
      
      test('toContainEqual with nullable array null actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with nullable array null actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if null contains a given value of type i32`);
      });
      
      test('toContainEqual with bare null actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with bare null actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if null contains a given value of type i32`);
      });

      test('toContainEqual with string actual and bare null expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with string actual and bare null expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a null value`);
      });
      
      test('toContainEqual with string actual and null value expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with string actual and null value expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if a String contains a null value`);
      });

      test('toContainEqual with primitive actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with primitive actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if type u64 contains a given value of type i32`);
      });
      
      test('toContainEqual with object actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with object actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot determine if type Point contains a given value of type i32`);
      });

      test('toContainEqual with ArrayBuffer actual', () => {
        const block = requireErrorBlock(parsedCli, testPath('unsupported types', 'toContainEqual', 'toContainEqual with ArrayBuffer actual [should fail]'));
        expect(block).toContain(`WASMRuntimeError: An ArrayBuffer has no element type to search for membership with toContain / toContainEqual.`);
      });
    });
  });

  describe('cross-type comparison', () => {
    test('toEqual map vs array', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toEqual map vs array [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare deep equality between Map<~lib/string/String,i32> and Array<~lib/string/String>');
    });

    test('toEqual user class type mismatch', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toEqual user class type mismatch [should fail]'));
      expect(block).toContain('AssertionError: expected Circle to deeply equal Shape (runtime type mismatch: Circle vs Shape)');
    });

    test('toEqual nested type mismatch', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toEqual nested type mismatch [should fail]'));
      expect(block).toContain('AssertionError: expected ShapeWrapper to deeply equal ShapeWrapper (runtime type mismatch at .shape: Circle vs Square)');
    });

    test('toContainEqual user class type mismatch - array', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toContainEqual user class type mismatch - array [should fail]'));
      expect(block).toContain(`AssertionError: expected [Circle{ color: "red", …(1) }, …(1)] to deep equally contain Shape{ color: "red" }`);
    });
    
    test('toContainEqual user class type mismatch - set', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toContainEqual user class type mismatch - set [should fail]'));
      expect(block).toContain(`AssertionError: expected Set { Circle{ …(2) }, …(1) } to deep equally contain Shape{ color: "red" }`);
    });
    
    test('toContainEqual user class type mismatch - map', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toContainEqual user class type mismatch - map [should fail]'));
      expect(block).toContain(`AssertionError: expected Map { "one" => Circle{ …(2) }, …(1) } to deep equally contain entry("one", Shape{ color: "red" })`);
    });

    test('toContainEqual user class type mismatch - nested mismatch', () => {
      const block = requireErrorBlock(parsedCli, testPath('cross-type comparison', 'toContainEqual user class type mismatch - nested mismatch [should fail]'));
      expect(block).toContain(`AssertionError: expected [ShapeWrapper{ …(2) }, …(2)] to deep equally contain ShapeWrapper{ label: "w1", …(1) }`);
    });
  });

  // Container type safety: throws inside container element/value comparisons.
  // Verifies full error message including error type classification and path context.
  const INCOMPARABLE_REF_VALUE_SUFFIX = ': reference and value types are not comparable.';

  describe('container type safety', () => {
    describe('toEqual', () => {
      test('Array incomparable element types', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Array incomparable element types [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String at index [0]' + INCOMPARABLE_REF_VALUE_SUFFIX);
      });
  
      test('Set incomparable element types', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Set incomparable element types [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String within Set' + INCOMPARABLE_REF_VALUE_SUFFIX);
      });
  
      test('Map incomparable value types with string key', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Map incomparable value types with string key [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String at key ["x"]' + INCOMPARABLE_REF_VALUE_SUFFIX);
      });
  
      test('Map incomparable value types with integer key', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Map incomparable value types with integer key [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare String with i32 at key [7]' + INCOMPARABLE_REF_VALUE_SUFFIX);
      });
  
      test('Array precision loss', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Array precision loss [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 at index [0]' + FLOAT_PRECISION_TOBE_SUFFIX);
      });
  
      test('Set precision loss', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Set precision loss [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 within Set' + FLOAT_PRECISION_TOBE_SUFFIX);
      });
  
      test('Map precision loss with string key', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Map precision loss with string key [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 at key ["x"]' + FLOAT_PRECISION_TOBE_SUFFIX);
      });
  
      test('Map mismatched key types', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Map mismatched key types [should fail]'));
        expect(block).toContain('WASMRuntimeError: Map key types must match for deep equality comparison: Map<~lib/string/String,i32> and Map<i32,~lib/string/String>');
      });
  
      test('Set vs Array cross-container', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toEqual', 'Set vs Array cross-container [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare deep equality between Set<~lib/string/String> and Array<~lib/string/String>');
      });
    });

    describe('toContain', () => {
      test('toContain with i32 set actual and u64 expected', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain with i32 set actual and u64 expected [should fail]'));
        expect(block).toContain(`WASMRuntimeError: A Set<i32> cannot contain a value of type u64. Use toContainEqual() to do a cross-type Set membership check.`);
      });
      
      test('toContain on map with ambiguous expected type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain on map with ambiguous expected type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Membership in a Map is ambiguous between keys and values`);
      });
      
      test('toContain on map with mismatched expected entry key type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain on map with mismatched expected entry key type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: A Map<~lib/string/String,i32> cannot contain an entry with key of type i32`);
      });
      
      test('toContain on map with mismatched expected array key type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain on map with mismatched expected array key type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: A Map<~lib/string/String,~lib/string/String> cannot contain an entry with key of type Point`);
      });
      
      test('toContain on map with mismatched expected entry value type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain on map with mismatched expected entry value type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with String: reference and value types are not comparable`);
      });

      test('toContain on map using array with incorrect number of items', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContain', 'toContain on map using array with incorrect number of items [should fail]'));
        expect(block).toContain('WASMRuntimeError: Membership in a Map is ambiguous with 1-item array');
      });
    });

    describe('toContainEqual', () => {
      test('toContainEqual on map with ambiguous expected type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContainEqual', 'toContainEqual on map with ambiguous expected type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Membership in a Map is ambiguous between keys and values`);
      });
      
      test('toContainEqual on map with mismatched expected entry key type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContainEqual', 'toContainEqual on map with mismatched expected entry key type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: A Map<~lib/string/String,i32> cannot contain an entry with key of type i32`);
      });
      
      test('toContainEqual on map with mismatched expected array key type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContainEqual', 'toContainEqual on map with mismatched expected array key type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: A Map<~lib/string/String,~lib/string/String> cannot contain an entry with key of type Point`);
      });
      
      test('toContainEqual on map with mismatched expected entry value type', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContainEqual', 'toContainEqual on map with mismatched expected entry value type [should fail]'));
        expect(block).toContain(`WASMRuntimeError: Cannot compare i32 with String at key ["one"]: reference and value types are not comparable`);
      });

      test('toContainEqual on map using array with incorrect number of items', () => {
        const block = requireErrorBlock(parsedCli, testPath('container type safety', 'toContainEqual', 'toContainEqual on map using array with incorrect number of items [should fail]'));
        expect(block).toContain('WASMRuntimeError: Membership in a Map is ambiguous with 1-item array');
      });
    });
  });

  // =========================================================================
  // toEqual USER OBJECTS: PATH CONTEXT & STRINGIFICATION DIFF
  // Verifies path information in assertion messages for container elements,
  // user object fields, and composed field+container paths.
  // =========================================================================

  describe('toEqual path context', () => {
    describe('top-level container element', () => {
      // `nameof<T>()` for container types includes the full module path to the element type,
      // which differs between local (`test/...`) and external (`../vitest-pool-assemblyscript/test/...`)
      // contexts. Use TEST_FILE_PREFIX to construct the expected string for both.
      test('Array element runtime type mismatch', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'top-level container element', 'Array element runtime type mismatch [should fail]'));
        const shapeType = `Array<${TEST_FILE_PREFIX}test/assembly-src/user-class-utils/Shape>`;
        expect(block).toContain(`AssertionError: expected ${shapeType} to deeply equal ${shapeType} (runtime type mismatch at index [0]: Circle vs Square)`);
      });

      test('Map value runtime type mismatch', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'top-level container element', 'Map value runtime type mismatch [should fail]'));
        const mapType = `Map<~lib/string/String,${TEST_FILE_PREFIX}test/assembly-src/user-class-utils/Shape>`;
        expect(block).toContain(`AssertionError: expected ${mapType} to deeply equal ${mapType} (runtime type mismatch at key ["a"]: Circle vs Square)`);
      });

      test('Set of arrays with incomparable element types', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'top-level container element', 'Set of arrays with incomparable element types [should fail]'));
        expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String within Set' + INCOMPARABLE_REF_VALUE_SUFFIX);
      });
    });

    describe('user object field', () => {
      test('field value differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'user object field', 'field value differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected ShapeWrapper{ label: "hello", …(1) } to deeply equal ShapeWrapper{ label: "world", …(1) } (differs at .label)');
        // strigified diff
        expect(block).toContain([
          '  ShapeWrapper {',
          '-   "label": "world",',
          '+   "label": "hello",',
          '    "shape": Circle {',
          '      "color": "red",',
          '      "radius": 5.0',
          '    }',
          '  }',
        ].join('\n'));
      });

      test('nested field value differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'user object field', 'nested field value differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected Line{ start: Point{ x: 1, y: 2 }, …(1) } to deeply equal Line{ …(2) } (differs at .start.x)');
        // strigified diff
        expect(block).toContain([
          '  Line {',
          '    "start": Point {',
          '-     "x": 99,',
          '+     "x": 1,',
          '      "y": 2',
          '    },',
        ].join('\n'));
      });

      test("multiple field values differ", () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'user object field', 'multiple field values differ'));
        // error message
        expect(block).toContain('AssertionError: expected GameState{ level: 3, …(15) } to deeply equal GameState{ level: 99, …(15) } (differs at .level)');
        // strigified diffs
        expect(block).toContain([
          '  GameState {',
          '-   "level": 99,',
          '+   "level": 3,',
          '    "score": 1500.5,',
          '    "active": true,',
          '-   "playerName": "Matt",',
          '+   "playerName": "Hero",',
        ].join('\n'));
        expect(block).toContain([
          '-     },',
          '-     Point {',
          '-       "x": 3,',
          '-       "y": 3',
          '      }'
        ].join('\n'));
      });
    });

    describe('composed field and container path', () => {
      test('array field element differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'array field element differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected Scoreboard{ name: "team1", …(1) } to deeply equal Scoreboard{ name: "team1", …(1) } (differs at .scores[1])');
        // strigified diff
        expect(block).toContain([
          '  Scoreboard {',
          '    "name": "team1",',
          '    "scores": [',
          '      10,',
          '-     99,',
          '+     20,',
          '      30',
          '    ]',
          '  }'
        ].join('\n'));
      });

      test('array field nested object field differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'array field nested object field differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected Team{ teamName: "squad", …(1) } to deeply equal Team{ teamName: "squad", …(1) } (differs at .members[1].name)');
        // strigified diff
        expect(block).toContain([
          '      Person {',
          '-       "name": "Charlie",',
          '+       "name": "Bob",',
          '        "age": 25',
          '      }',
        ].join('\n'));
      });

      test('map field primitive value differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'map field primitive value differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected Settings{ label: "s1", …(1) } to deeply equal Settings{ label: "s1", …(1) } (differs at .config["y"])');
        // strigified diff
        expect(block).toContain([
          '  Settings {',
          '    "label": "s1",',
          '    "config": Map {',
          '      "x" => 1,',
          '-     "y" => 99',
          '+     "y" => 2',
          '    }',
          '  }'
        ].join('\n'));
      });

      test('map field nested object field differs', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'map field nested object field differs [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected Registry{ entries: Map { …(2) } } to deeply equal Registry{ entries: Map { …(2) } } (differs at .entries["target"].x)');
        // strigified diff
        expect(block).toContain([
          '      "target" => Point {',
          '-       "x": 99,',
          '+       "x": 5,',
          '        "y": 10',
          '      }',
        ].join('\n'));
      });

      test('set field element not found', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'set field element not found [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected PointGroup{ points: Set { …(2) } } to deeply equal PointGroup{ points: Set { …(2) } } (differs at .points)');
        // strigified diff
        expect(block).toContain([
          '      Point {',
          '-       "x": 99,',
          '-       "y": 99',
          '+       "x": 3,',
          '+       "y": 4',
          '      }',
        ].join('\n'));
      });

      test('array field sibling subclass RTM', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'array field sibling subclass RTM [should fail]'));
        expect(block).toContain('AssertionError: expected ShapeList to deeply equal ShapeList (runtime type mismatch at .shapes[0]: Circle vs Square)');
      });

      test('map field sibling subclass value RTM', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'map field sibling subclass value RTM [should fail]'));
        expect(block).toContain('AssertionError: expected ShapeRegistry to deeply equal ShapeRegistry (runtime type mismatch at .shapes["a"]: Circle vs Square)');
      });

      test('array field subclass vs base RTM', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'array field subclass vs base RTM [should fail]'));
        expect(block).toContain('AssertionError: expected ShapeList to deeply equal ShapeList (runtime type mismatch at .shapes[0]: Circle vs Shape)');
      });

      test('map field subclass vs base value RTM', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'map field subclass vs base value RTM [should fail]'));
        expect(block).toContain('AssertionError: expected ShapeRegistry to deeply equal ShapeRegistry (runtime type mismatch at .shapes["a"]: Circle vs Shape)');
      });

      test('set field polymorphic no match', () => {
        const block = requireErrorBlock(parsedCli, testPath('toEqual path context', 'composed field and container path', 'set field polymorphic no match [should fail]'));
        // error message
        expect(block).toContain('AssertionError: expected ShapeGroup{ label: "group1", …(1) } to deeply equal ShapeGroup{ label: "group1", …(1) } (differs at .shapes)');
        // strigified diff
        expect(block).toContain([
          '    "shapes": Set {',
          '-     Square {',
          '+     Circle {',
          '        "color": "red",',
          '-       "side": 5.0',
          '+       "radius": 5.0',
          '      }',
          '    }',
        ].join('\n'));
      });
    });
  });
});
