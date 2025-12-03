/**
 * Tests for internal test helper validators
 *
 * PURPOSE: These tests verify that our validator functions (used in other tests)
 * correctly detect various types of corrupt or invalid debug info structures.
 *
 * WHY: Catch regressions if we modify validator logic. Ensures our test helpers
 * work correctly so we can trust them when validating actual extraction results.
 *
 * APPROACH: Use minimal mock DebugInfo structures to test validator logic in isolation.
 * Uses test-fixtures/assembly-src/math.ts as the reference source file for tests
 * that require actual source file reading.
 */

import { describe, it, expect } from 'vitest';
import {
  validateDebugInfoStructure,
  sanityCheckDebugInfoAgainstSourceMap,
  validateDebugInfoFunctionSourceLocations,
} from '../helpers/validate-debug-info.js';
import {
  MATH_SOURCE_PATH,
  MATH_FUNCTION_BOUNDS,
  MATH_REPRESENTATIVE_LOCATIONS,
  createBinaryDebugInfo,
  createFunctionDebugInfo,
  createExpressionDebugInfo,
  createExpressionWithLocation,
  createMathDebugInfo,
  createMathDebugInfoWithPositions,
  mathFuncName,
  positionKey,
} from '../helpers/validator-mock-data.js';

describe('validator functions', () => {
  describe('validateDebugInfoStructure', () => {
    describe('functionsByName validation', () => {
      it('should detect duplicate function indices', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              signature: { params: ['i32'], results: ['i32'] },
            }),
            'func2': createFunctionDebugInfo({
              name: 'func2',
              wasmIndex: 0, // Duplicate index!
              signature: { params: ['i32'], results: ['i32'] },
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('duplicate index'))).toBe(true);
      });

      it('should detect invalid expression indices in basic blocks', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              expressions: [createExpressionDebugInfo({ type: 'Const' })],
              basicBlocks: [
                {
                  index: 0,
                  expressionIndices: [0, 9999], // 9999 is out of range!
                  branches: [],
                },
              ],
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('out of range'))).toBe(true);
      });

      it('should detect invalid branch targets', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              expressions: [createExpressionDebugInfo({ type: 'If', isBranch: true, branchPaths: 2 })],
              basicBlocks: [
                {
                  index: 0,
                  expressionIndices: [0],
                  branches: [
                    { targetBlockIndex: 9999 }, // Invalid block index!
                  ],
                },
              ],
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        // Error message: "has branch to invalid target block index"
        expect(result.errors.some(e => e.includes('invalid target block index'))).toBe(true);
      });

      it('should detect invalid signature param types', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              signature: { params: [123 as unknown as string], results: ['i32'] },
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors[0]).toBe('Function "func1" signature param 0 is not a string');
        expect(result.errors.length).toBe(1);
        expect(result.warnings).toEqual([]);
        expect(result.valid).toBe(false);
      });

      it('should detect invalid signature result types', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              signature: { params: ['i32'], results: [null as unknown as string] },
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors[0]).toBe('Function "func1" signature result 0 is not a string');
        expect(result.errors.length).toBe(1);
        expect(result.warnings).toEqual([]);
        expect(result.valid).toBe(false);
      });

      it('should detect invalid globalName type', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              globalName: 123 as unknown as string, // Invalid: not a string
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors[0]).toBe('Function "func1" has invalid globalName (expected string, got number)');
        expect(result.errors.length).toBe(1);
        expect(result.warnings).toEqual([]);
        expect(result.valid).toBe(false);
      });

      it('should detect empty globalName', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              globalName: '', // Invalid: empty string
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors[0]).toBe('Function "func1" has empty globalName');
        expect(result.errors.length).toBe(1);
        expect(result.warnings).toEqual([]);
        expect(result.valid).toBe(false);
      });

      it('should pass validation with valid globalName', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              signature: { params: ['i32'], results: ['i32'] },
              globalName: 'test/myArrow',
              expressions: [createExpressionDebugInfo({ type: 'Const' })],
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('should pass validation for well-formed debug info', () => {
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'func1': createFunctionDebugInfo({
              name: 'func1',
              wasmIndex: 0,
              signature: { params: ['i32'], results: ['i32'] },
              expressions: [
                createExpressionDebugInfo({ type: 'Const' }),
                createExpressionDebugInfo({ type: 'Return' }),
              ],
              basicBlocks: [
                {
                  index: 0,
                  expressionIndices: [0, 1],
                  branches: [],
                },
              ],
            }),
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.stats.totalFunctions).toBe(1);
        expect(result.stats.totalExpressions).toBe(2);
      });
    });

    describe('functionsByFileAndPosition validation', () => {
      it('should detect invalid position key format', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {
            'test.ts': {
              'invalid-key': func, // Should be "10:5"
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'functionsByFileAndPosition["test.ts"] has invalid position key: "invalid-key" (expected "line:column" format)'
        );
      });

      it('should detect position key mismatch with representativeLocation', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {
            'test.ts': {
              '20:3': func, // Wrong position, should be "10:5"
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/func" position key "20:3" does not match representativeLocation "10:5"'
        );
      });

      it('should detect filePath mismatch between file key and representativeLocation', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'other.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts', 'other.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {
            'test.ts': { // Wrong file key, should be "other.ts"
              '10:5': func,
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/func" representativeLocation.filePath "other.ts" does not match file key "test.ts"'
        );
      });

      it('should detect function missing representativeLocation in position map', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          // No representativeLocation
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {
            'test.ts': {
              '10:5': func,
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/func" in functionsByFileAndPosition["test.ts"]["10:5"] has no representativeLocation'
        );
      });

      it('should detect function in position map not found in functionsByName', () => {
        const func = createFunctionDebugInfo({
          name: 'test/orphan',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {}, // Function not in functionsByName
          functionsByFileAndPosition: {
            'test.ts': {
              '10:5': func,
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/orphan" in functionsByFileAndPosition not found in functionsByName'
        );
      });

      it('should detect function with representativeLocation missing from position map', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {}, // Empty, but function has representativeLocation
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/func" has representativeLocation but is not in functionsByFileAndPosition'
        );
      });

      it('should detect different object references between maps', () => {
        const func1 = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });
        const func2 = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func1 },
          functionsByFileAndPosition: {
            'test.ts': {
              '10:5': func2, // Different object, same content
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          'Function "test/func" in functionsByFileAndPosition is not the same object as in functionsByName'
        );
      });

      it('should pass validation for correctly structured position map', () => {
        const func = createFunctionDebugInfo({
          name: 'test/func',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: { 'test/func': func },
          functionsByFileAndPosition: {
            'test.ts': {
              '10:5': func, // Same object reference
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('should allow functions without representativeLocation to be absent from position map', () => {
        const funcWithLocation = createFunctionDebugInfo({
          name: 'test/withLoc',
          wasmIndex: 0,
          representativeLocation: { filePath: 'test.ts', line: 10, column: 5 },
        });
        const funcWithoutLocation = createFunctionDebugInfo({
          name: 'test/noLoc',
          wasmIndex: 1,
          // No representativeLocation
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['test.ts'],
          functionsByName: {
            'test/withLoc': funcWithLocation,
            'test/noLoc': funcWithoutLocation,
          },
          functionsByFileAndPosition: {
            'test.ts': {
              '10:5': funcWithLocation,
            },
          },
        });

        const result = validateDebugInfoStructure(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('sanityCheckDebugInfoAgainstSourceMap', () => {
    it('should detect invalid source map JSON', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts'] });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, 'invalid json');

      expect(result.errors[0]).toMatch(/Failed to parse source map JSON:.+/);
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect missing required source map "sources" field', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts'] });
      const incompleteSourceMap = JSON.stringify({ version: 3 });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, incompleteSourceMap);

      expect(result.errors[0]).toBe('Source map missing or invalid "sources" field');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect missing required source map "mappings" field', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts'] });
      const incompleteSourceMap = JSON.stringify({ version: 3, sources: [] });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, incompleteSourceMap);

      expect(result.errors[0]).toBe('Source map missing or invalid "mappings" field');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should warn about missing source files in debugInfo from source map', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts'] });
      const mismatchedSourceMap = JSON.stringify({
        version: 3,
        sources: ['test.ts', 'other.ts'],
        names: [],
        mappings: '',
      });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, mismatchedSourceMap);

      expect(result.errors[0]).toBe('Source map file "other.ts" not found in Debug Info');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should warn about missing source files in source map from debugInfo', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts', 'other.ts'] });
      const mismatchedSourceMap = JSON.stringify({
        version: 3,
        sources: ['test.ts'],
        names: [],
        mappings: '',
      });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, mismatchedSourceMap);

      expect(result.errors[0]).toBe('Debug Info file "other.ts" not found in source map');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should pass validation for matching source files', () => {
      const debugInfo = createBinaryDebugInfo({ debugSourceFiles: ['test.ts'] });
      const validSourceMap = JSON.stringify({
        version: 3,
        sources: ['test.ts'],
        names: [],
        mappings: '',
      });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, validSourceMap);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  /**
   * validateDebugSourceLocations tests
   *
   * Uses test-fixtures/assembly-src/math.ts as the reference file.
   * Function boundaries in math.ts (see MATH_FUNCTION_BOUNDS):
   *   - add: lines 6-8
   *   - subtract: lines 10-12
   *   - multiply: lines 14-16
   *   - divide: lines 18-20
   *   - addOneLiner: line 22
   *   - subtractOneLiner: line 25
   *
   * Non-code lines: 1-4 (JSDoc), 5, 9, 13, 17, 21, 23 (comment), 24
   */
  describe('validateDebugSourceLocations', () => {
    describe('expression location validation', () => {
      it('should detect expressions outside function boundaries', () => {
        // multiply bounds, expression in divide's range
        const multiplyBounds = MATH_FUNCTION_BOUNDS.multiply;
        const divideLineInside = MATH_FUNCTION_BOUNDS.divide.start + 1; // Line inside divide, outside multiply
        const debugInfo = createMathDebugInfo({
          [mathFuncName('multiply')]: {
            expressions: [
              createExpressionWithLocation(MATH_SOURCE_PATH, divideLineInside, 2),
            ],
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `WASM function "${mathFuncName('multiply')}" expression 0 at line ${divideLineInside} is outside source function "multiply" bounds (${multiplyBounds.start}-${multiplyBounds.end})`
        );
      });

      it('should detect WASM function referencing nonexistent source function', () => {
        // Add a nonExistentFunc that doesn't exist in source
        const nonExistentFuncName = 'test-fixtures/assembly-src/math/nonExistentFunc';
        const subtractLineInside = MATH_FUNCTION_BOUNDS.subtract.start + 1;
        const debugInfo = createMathDebugInfo({
          [nonExistentFuncName]: {
            expressions: [createExpressionWithLocation(MATH_SOURCE_PATH, subtractLineInside, 2)],
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `Unexpected WASM function "${nonExistentFuncName}" - Expected source name: "nonExistentFunc" not found in source file "${MATH_SOURCE_PATH}"`
        );
      });

      it('should detect locations pointing to non-code lines', () => {
        // Line 5 in math.ts is empty (between JSDoc and first function), outside multiply bounds
        const emptyLine = 5;
        const multiplyBounds = MATH_FUNCTION_BOUNDS.multiply;
        const debugInfo = createMathDebugInfo({
          [mathFuncName('multiply')]: {
            expressions: [
              createExpressionWithLocation(MATH_SOURCE_PATH, emptyLine, 0),
            ],
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        // Line 5 is outside function bounds, is non-code, and triggers reverse check errors
        expect(result.errors).toEqual([
          `WASM function "${mathFuncName('multiply')}" expression 0 at line ${emptyLine} is outside source function "multiply" bounds (${multiplyBounds.start}-${multiplyBounds.end})`,
          `WASM function "${mathFuncName('multiply')}" expression 0 at line ${emptyLine} points to non-code (comment/whitespace)`,
          `Source function "multiply" in "${MATH_SOURCE_PATH}" (lines ${multiplyBounds.start}-${multiplyBounds.end}) found as "${mathFuncName('multiply')}" but has no debug locations within source boundaries`,
          `Source function "multiply" in "${MATH_SOURCE_PATH}" (lines ${multiplyBounds.start}-${multiplyBounds.end}) found as "${mathFuncName('multiply')}" but some expression debug locations are outside source boundaries`,
        ]);
      });

      it('should pass when expressions are within function boundaries', () => {
        // Expression inside multiply's bounds
        const multiplyLineInside = MATH_FUNCTION_BOUNDS.multiply.start + 1;
        const debugInfo = createMathDebugInfo({
          [mathFuncName('multiply')]: {
            expressions: [
              createExpressionWithLocation(MATH_SOURCE_PATH, multiplyLineInside, 2),
              createExpressionWithLocation(MATH_SOURCE_PATH, multiplyLineInside, 7),
            ],
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('should pass when expressions are on function declaration line', () => {
        // Expression on add's start line
        const addStartLine = MATH_FUNCTION_BOUNDS.add.start;
        const debugInfo = createMathDebugInfo({
          [mathFuncName('add')]: {
            expressions: [
              createExpressionWithLocation(MATH_SOURCE_PATH, addStartLine, 16),
            ],
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('should skip functions without debug info', () => {
        // stdlib function with hasDebugInfo: false should be skipped
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['~lib/internal.ts'],
          functionsByName: {
            '~lib/rt/itcms/free': createFunctionDebugInfo({
              name: '~lib/rt/itcms/free',
              wasmIndex: 0,
              hasDebugInfo: false, // No debug info - skip validation
              signature: { params: ['i32'], results: [] },
              expressions: [
                createExpressionWithLocation('~lib/internal.ts', 99999, 0), // Invalid but skipped
              ],
            }),
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('should handle missing source files correctly', () => {
        // Missing source file errors should exclude stdlib files (starting with ~lib)
        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: ['src/nonexistent.ts', '~lib/internal.ts'],
          functionsByName: {
            '~lib/internal/func1': createFunctionDebugInfo({
              name: '~lib/internal/func1',
              wasmIndex: 0,
              expressions: [createExpressionWithLocation('~lib/internal.ts', 1, 0)],
            }),
            'src/nonexistent/func2': createFunctionDebugInfo({
              name: 'src/nonexistent/func2',
              wasmIndex: 1,
              expressions: [createExpressionWithLocation('src/nonexistent.ts', 1, 0)],
            }),
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        // Should only error about the non-stdlib missing file
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toBe('Could not read source file for validation: src/nonexistent.ts');
      });

      it('should validate all math functions with expressions in bounds', () => {
        const debugInfo = createMathDebugInfoWithPositions();

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });
    });

    describe('representativeLocation validation', () => {
      it('should detect representativeLocation outside function bounds', () => {
        // representativeLocation in divide's range, but function is multiply
        const multiplyBounds = MATH_FUNCTION_BOUNDS.multiply;
        const divideLineInside = MATH_FUNCTION_BOUNDS.divide.start + 1;
        const badPosKey = positionKey(divideLineInside, 2);
        const func = createFunctionDebugInfo({
          name: mathFuncName('multiply'),
          wasmIndex: 0,
          signature: { params: ['i32', 'i32'], results: ['i32'] },
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: divideLineInside, column: 2 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('multiply')]: func },
          functionsByFileAndPosition: {
            [MATH_SOURCE_PATH]: { [badPosKey]: func },
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `Function "${mathFuncName('multiply')}" representativeLocation at line ${divideLineInside} is outside source function "multiply" bounds (${multiplyBounds.start}-${multiplyBounds.end})`
        );
      });

      it('should detect representativeLocation line out of range', () => {
        const outOfRangeLine = 9999;
        const badPosKey = positionKey(outOfRangeLine, 2);
        const func = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: outOfRangeLine, column: 2 },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('add')]: func },
          functionsByFileAndPosition: {
            [MATH_SOURCE_PATH]: { [badPosKey]: func },
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(new RegExp(`representativeLocation line ${outOfRangeLine} out of range`));
      });

      it('should detect representativeLocation column out of range', () => {
        const addRepLoc = MATH_REPRESENTATIVE_LOCATIONS.add;
        const outOfRangeColumn = 999;
        const badPosKey = positionKey(addRepLoc.line, outOfRangeColumn);
        const func = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          signature: { params: ['i32', 'i32'], results: ['i32'] },
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: addRepLoc.line, column: outOfRangeColumn },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('add')]: func },
          functionsByFileAndPosition: {
            [MATH_SOURCE_PATH]: { [badPosKey]: func },
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(new RegExp(`representativeLocation column ${outOfRangeColumn} out of range`));
      });

      it('should detect representativeLocation file missing from functionsByFileAndPosition', () => {
        const addRepLoc = MATH_REPRESENTATIVE_LOCATIONS.add;
        const func = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: addRepLoc.line, column: addRepLoc.column },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('add')]: func },
          functionsByFileAndPosition: {}, // Missing the file entry
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `Function "${mathFuncName('add')}" has representativeLocation in "${MATH_SOURCE_PATH}" but file not in functionsByFileAndPosition`
        );
      });

      it('should detect representativeLocation position missing from functionsByFileAndPosition', () => {
        const addRepLoc = MATH_REPRESENTATIVE_LOCATIONS.add;
        const addPosKey = positionKey(addRepLoc.line, addRepLoc.column);
        const func = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: addRepLoc.line, column: addRepLoc.column },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('add')]: func },
          functionsByFileAndPosition: {
            [MATH_SOURCE_PATH]: {}, // File exists but position is missing
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `Function "${mathFuncName('add')}" has representativeLocation "${addPosKey}" but not found at that position in functionsByFileAndPosition`
        );
      });

      it('should detect object mismatch between functionsByName and functionsByFileAndPosition', () => {
        const addRepLoc = MATH_REPRESENTATIVE_LOCATIONS.add;
        const addPosKey = positionKey(addRepLoc.line, addRepLoc.column);
        const func1 = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: addRepLoc.line, column: addRepLoc.column },
        });
        const func2 = createFunctionDebugInfo({
          name: mathFuncName('add'),
          wasmIndex: 0,
          representativeLocation: { filePath: MATH_SOURCE_PATH, line: addRepLoc.line, column: addRepLoc.column },
        });

        const debugInfo = createBinaryDebugInfo({
          debugSourceFiles: [MATH_SOURCE_PATH],
          functionsByName: { [mathFuncName('add')]: func1 },
          functionsByFileAndPosition: {
            [MATH_SOURCE_PATH]: { [addPosKey]: func2 }, // Different object
          },
        });

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe(
          `Function "${mathFuncName('add')}" at position "${addPosKey}" in functionsByFileAndPosition is different object than in functionsByName`
        );
      });

      it('should pass validation for correctly structured representativeLocation', () => {
        const debugInfo = createMathDebugInfoWithPositions();

        const result = validateDebugInfoFunctionSourceLocations(debugInfo);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });
    });
  });
});
