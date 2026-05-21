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
  });

  // Container type safety: throws inside container element/value comparisons.
  // Verifies full error message including error type classification and path context.
  const INCOMPARABLE_REF_VALUE_SUFFIX = ': reference and value types are not comparable.';

  describe('container type safety', () => {
    test('Array incomparable element types', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Array incomparable element types [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String at index [0]' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });

    test('Set incomparable element types', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Set incomparable element types [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String within Set' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });

    test('Map incomparable value types with string key', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Map incomparable value types with string key [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare i32 with String at key ["x"]' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });

    test('Map incomparable value types with integer key', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Map incomparable value types with integer key [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare String with i32 at key [7]' + INCOMPARABLE_REF_VALUE_SUFFIX);
    });

    test('Array precision loss', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Array precision loss [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 at index [0]' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('Set precision loss', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Set precision loss [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 within Set' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('Map precision loss with string key', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Map precision loss with string key [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare f32 with i32 at key ["x"]' + FLOAT_PRECISION_TOBE_SUFFIX);
    });

    test('Map mismatched key types', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Map mismatched key types [should fail]'));
      expect(block).toContain('WASMRuntimeError: Map key types must match for deep equality comparison: Map<~lib/string/String,i32> and Map<i32,~lib/string/String>');
    });

    test('Set vs Array cross-container', () => {
      const block = requireErrorBlock(parsedCli, testPath('container type safety', 'Set vs Array cross-container [should fail]'));
      expect(block).toContain('WASMRuntimeError: Cannot compare deep equality between Set<~lib/string/String> and Array<~lib/string/String>');
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
