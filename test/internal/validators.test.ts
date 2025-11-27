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
 * Only compile real fixtures when testing validators that require actual source maps.
 */

import { describe, it, expect } from 'vitest';
import {
  validateDebugInfoStructure,
  sanityCheckDebugInfoAgainstSourceMap,
  validateDebugInfoFunctionSourceLocations,
} from '../helpers/validate-debug-info.js';
import type { DebugInfo, FunctionDebugInfo } from '../../src/native/addon-types';

// Complete mock data for simple.ts fixture - matches actual compiled WASM
const SIMPLE_FUNCTIONS: Record<string, FunctionDebugInfo> = {
  'start:test/assembly/simple~anonymous|0': {
    index: 0,
    hasDebugInfo: true,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
    globalName: 'test/assembly/simple/add',
    expressions: [],
    basicBlocks: [],
  },
  'test/assembly/simple/multiply': {
    index: 1,
    hasDebugInfo: true,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
    expressions: [],
    basicBlocks: [],
  },
  'test/assembly/simple/identity': {
    index: 2,
    hasDebugInfo: true,
    signature: { params: ['i32'], results: ['i32'] },
    expressions: [],
    basicBlocks: [],
  },
  'test/assembly/simple/conditional': {
    index: 3,
    hasDebugInfo: true,
    signature: { params: ['i32'], results: ['i32'] },
    expressions: [],
    basicBlocks: [],
  },
  'test/assembly/simple/withLocals': {
    index: 4,
    hasDebugInfo: true,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
    expressions: [],
    basicBlocks: [],
  },
};

describe('validator functions', () => {
  describe('validateDebugInfoStructure', () => {
    it('should detect duplicate function indices', () => {
      // Create mock DebugInfo with duplicate function indices
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32'], results: ['i32'] },
            expressions: [],
            basicBlocks: [],
          },
          'func2': {
            index: 0, // Duplicate index!
            hasDebugInfo: true,
            signature: { params: ['i32'], results: ['i32'] },
            expressions: [],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('duplicate index'))).toBe(true);
    });

    it('should detect invalid expression indices in basic blocks', () => {
      // Create mock DebugInfo with invalid expression reference
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            expressions: [
              { type: 'Const', isBranch: false, branchPaths: 0 },
            ],
            basicBlocks: [
              {
                index: 0,
                expressionIndices: [0, 9999], // 9999 is out of range!
                branches: [],
              },
            ],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('out of range'))).toBe(true);
    });

    it('should detect invalid branch targets', () => {
      // Create mock DebugInfo with invalid branch target
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            expressions: [
              { type: 'If', isBranch: true, branchPaths: 2 },
            ],
            basicBlocks: [
              {
                index: 0,
                expressionIndices: [0],
                branches: [
                  { toBlock: 9999 }, // Invalid block index!
                ],
              },
            ],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid block'))).toBe(true);
    });

    it('should detect invalid signature param types', () => {
      // Signature params must be array of strings
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [123 as any], results: ['i32'] },
            expressions: [],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.errors[0]).toBe('Function "func1" signature param 0 is not a string');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect invalid signature result types', () => {
      // Signature results must be array of strings
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32'], results: [null as any] },
            expressions: [],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.errors[0]).toBe('Function "func1" signature result 0 is not a string');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect invalid globalName type', () => {
      // globalName must be a string if present
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            globalName: 123 as any, // Invalid: not a string
            expressions: [],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.errors[0]).toBe('Function "func1" has invalid globalName (expected string, got number)');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect empty globalName', () => {
      // globalName must not be empty string
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            globalName: '', // Invalid: empty string
            expressions: [],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.errors[0]).toBe('Function "func1" has empty globalName');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should pass validation with valid globalName', () => {
      // globalName is optional and must be a non-empty string
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32'], results: ['i32'] },
            globalName: 'test/myArrow',
            expressions: [
              { type: 'Const', isBranch: false, branchPaths: 0 },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('should pass validation for well-formed debug info', () => {
      // Create valid mock DebugInfo
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {
          'func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32'], results: ['i32'] },
            expressions: [
              { type: 'Const', isBranch: false, branchPaths: 0 },
              { type: 'Return', isBranch: false, branchPaths: 0 },
            ],
            basicBlocks: [
              {
                index: 0,
                expressionIndices: [0, 1],
                branches: [],
              },
            ],
          },
        },
      };

      const result = validateDebugInfoStructure(debugInfo);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.stats.totalFunctions).toBe(1);
      expect(result.stats.totalExpressions).toBe(2);
    });
  });

  describe('sanityCheckDebugInfoAgainstSourceMap', () => {
    it('should detect invalid source map JSON', () => {
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {},
      };

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, 'invalid json');

      expect(result.errors[0]).toMatch(/Failed to parse source map JSON:.+/);
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect missing required source map "sources" field', () => {
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {},
      };

      // Malformed source map (missing required fields)
      const incompleteSourceMap = JSON.stringify({ version: 3 });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, incompleteSourceMap);

      expect(result.errors[0]).toBe('Source map missing or invalid "sources" field');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });
    
    it('should detect missing required source map "mappings" field', () => {
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {},
      };

      // Malformed source map (missing required fields)
      const incompleteSourceMap = JSON.stringify({ version: 3, sources: [] });

      const result = sanityCheckDebugInfoAgainstSourceMap(debugInfo, incompleteSourceMap);

      expect(result.errors[0]).toBe('Source map missing or invalid "mappings" field');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should warn about missing source files in debugInfo from source map', () => {
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {},
      };

      // Source map with different file list
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
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts', 'other.ts'],
        functions: {},
      };

      // Source map with different file list
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
      const debugInfo: DebugInfo = {
        debugFiles: ['test.ts'],
        functions: {},
      };

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

  describe('validateDebugSourceLocations', () => {
    it('should detect expressions outside function boundaries', () => {
      // Function "multiply" in simple.ts spans lines 8-10
      // Expression at line 15 is outside those boundaries
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/simple.ts'],
        functions: {
          'test/assembly/simple/multiply': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32', 'i32'], results: ['i32'] },
            expressions: [
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 13, // Outside "multiply" function, in "identity function"
                  column: 2,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors[0]).toMatch('WASM function "test/assembly/simple/multiply" expression 0 at line 13 is outside source function "multiply" bounds (8-10)');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect function not found in source', () => {
      // simple.ts has functions: add, multiply, identity, conditional, withLocals
      // "nonExistentFunc" doesn't exist
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/simple.ts'],
        functions: {
          'test/assembly/simple/nonExistentFunc': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            expressions: [
              {
                type: 'Const',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 10,
                  column: 2,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors[0]).toBe('WASM function "test/assembly/simple/nonExistentFunc" (expected source name: "nonExistentFunc") not found in source file "test/assembly/simple.ts" (index: 0)');
      expect(result.errors.length).toBe(1);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(false);
    });

    it('should detect locations pointing to non-code lines', () => {
      // Line 3 in simple.ts is empty
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/simple.ts'],
        functions: {
          'test/assembly/simple/multiply': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32', 'i32'], results: ['i32'] },
            expressions: [
              {
                type: 'Const',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 3, // Empty line (outside multiply function)
                  column: 0,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.valid).toBe(false);
      // Line 3 is both outside function AND is non-code
      expect(result.errors[0]).toMatch(/WASM function "test\/assembly\/simple\/multiply" expression 0 at line 3 is outside source function "multiply" bounds.+/);
      expect(result.errors[1]).toMatch(/WASM function "test\/assembly\/simple\/multiply" expression 0 at line 3 points to non-code \(comment\/whitespace\)/);
      expect(result.errors.length).toBe(2);
      expect(result.warnings).toEqual([]);
    });

    it('should pass when expressions are within named function boundaries', () => {
      // Function "multiply" spans lines 8-10, expressions at 9 are within bounds
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/simple.ts'],
        functions: {
          ...SIMPLE_FUNCTIONS,
          // Override multiply with test-specific expressions
          'test/assembly/simple/multiply': {
            ...SIMPLE_FUNCTIONS['test/assembly/simple/multiply'],
            expressions: [
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 9, // Within "multiply" function
                  column: 2,
                },
              },
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 9,
                  column: 7,
                },
              },
            ],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });
    
    it('should pass when expressions are within arrow function boundaries', () => {
      // Arrow Function "add" spans lines 4-6, expressions at 5 are within bounds
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/simple.ts'],
        functions: {
          'test/assembly/simple/add': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: ['i32', 'i32'], results: ['i32'] },
            expressions: [
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 5, // Within "add" function
                  column: 2,
                },
              },
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 5,
                  column: 7,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('should skip functions without debug info', () => {
      // Function with hasDebugInfo: false should be skipped entirely
      const debugInfo: DebugInfo = {
        debugFiles: ['test/assembly/complex.ts'],
        functions: {
          '~lib/rt/itcms/free': {
            index: 0,
            hasDebugInfo: false, // No debug info - skip validation
            signature: { params: ['i32'], results: [] },
            expressions: [
              {
                type: 'LocalGet',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 99999, // Invalid but should be skipped
                  column: 0,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('should handle missing source files correctly', () => {
      // Missing source file errors should exclude std lib files
      const debugInfo: DebugInfo = {
        debugFiles: ['src/nonexistant.ts', '~lib/internal.ts'],
        functions: {
          '~lib/internal/func1': {
            index: 0,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            expressions: [
              {
                type: 'Const',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 1,
                  column: 0,
                },
              },
            ],
            basicBlocks: [],
          },
          'src/nonexistant/func2': {
            index: 1,
            hasDebugInfo: true,
            signature: { params: [], results: [] },
            expressions: [
              {
                type: 'Const',
                isBranch: false,
                branchPaths: 0,
                location: {
                  fileIndex: 0,
                  line: 1,
                  column: 0,
                },
              },
            ],
            basicBlocks: [],
          },
        },
      };

      const result = validateDebugInfoFunctionSourceLocations(debugInfo);

      expect(result.warnings).toEqual([]);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toBe('Could not read source file for validation: src/nonexistant.ts');
    });
  });
});
