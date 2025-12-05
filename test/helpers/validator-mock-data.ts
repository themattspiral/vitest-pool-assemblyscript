/**
 * Mock data helpers for validator tests
 *
 * Uses test-fixtures/assembly-src/math.ts as the reference source file.
 * Function boundaries in that file:
 *   - add: lines 6-8
 *   - subtract: lines 10-12
 *   - multiply: lines 14-16
 *   - divide: lines 18-20
 *   - addOneLiner: line 22
 *   - subtractOneLiner: line 25
 */

import type { BinaryDebugInfo, FunctionDebugInfo, ExpressionDebugInfo, SourceLocation } from '../../src/types.js';

/** Path to the math source file (relative to project root, as source maps use) */
export const MATH_SOURCE_PATH = 'test-fixtures/assembly-src/math.ts';

/** Function name prefix for math functions in WASM */
export const MATH_FUNC_PREFIX = 'test-fixtures/assembly-src/math';

/**
 * Function boundaries in math.ts
 * Used to verify expressions are within correct line ranges
 */
export const MATH_FUNCTION_BOUNDS = {
  add: { start: 6, end: 8 },
  subtract: { start: 10, end: 12 },
  multiply: { start: 14, end: 16 },
  divide: { start: 18, end: 20 },
  addOneLiner: { start: 22, end: 22 },
  subtractOneLiner: { start: 25, end: 25 },
} as const;

/**
 * Create a basic FunctionDebugInfo object
 * All fields are required, caller can override as needed
 */
export function createFunctionDebugInfo(
  overrides: Partial<FunctionDebugInfo> & { name: string; wasmIndex: number }
): FunctionDebugInfo {
  return {
    hasDebugInfo: true,
    signature: { params: [], results: [] },
    expressions: [],
    basicBlocks: [],
    ...overrides,
  };
}

/**
 * Create a basic ExpressionDebugInfo object
 */
export function createExpressionDebugInfo(
  overrides: Partial<ExpressionDebugInfo> = {}
): ExpressionDebugInfo {
  return {
    type: 'Const',
    isBranch: false,
    branchPaths: 0,
    ...overrides,
  };
}

/**
 * Create an expression with a source location
 */
export function createExpressionWithLocation(
  filePath: string,
  line: number,
  column: number,
  overrides: Partial<ExpressionDebugInfo> = {}
): ExpressionDebugInfo {
  return createExpressionDebugInfo({
    location: { filePath, line, column },
    ...overrides,
  });
}

/**
 * Create a minimal valid BinaryDebugInfo structure
 */
export function createBinaryDebugInfo(
  overrides: Partial<BinaryDebugInfo> = {}
): BinaryDebugInfo {
  return {
    debugSourceFiles: [],
    functionsByFileAndPosition: {},
    functionsByName: {},
    ...overrides,
  };
}

/**
 * Create BinaryDebugInfo with a single function
 * Convenience helper for simple test cases
 */
export function createSingleFunctionDebugInfo(
  funcName: string,
  func: FunctionDebugInfo,
  sourceFiles: string[] = []
): BinaryDebugInfo {
  return createBinaryDebugInfo({
    debugSourceFiles: sourceFiles,
    functionsByName: { [funcName]: func },
  });
}

/**
 * All function names in math.ts
 */
export type MathFunctionName = 'add' | 'subtract' | 'multiply' | 'divide' | 'addOneLiner' | 'subtractOneLiner';

/**
 * Get full WASM function name for a math function
 */
export function mathFuncName(name: MathFunctionName): string {
  return `${MATH_FUNC_PREFIX}/${name}`;
}

/**
 * Base mock data for ALL math.ts functions
 * These match the actual compiled WASM function signatures
 */
export const MATH_FUNCTIONS: Record<string, FunctionDebugInfo> = {
  [mathFuncName('add')]: createFunctionDebugInfo({
    name: mathFuncName('add'),
    wasmIndex: 0,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
  [mathFuncName('subtract')]: createFunctionDebugInfo({
    name: mathFuncName('subtract'),
    wasmIndex: 1,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
  [mathFuncName('multiply')]: createFunctionDebugInfo({
    name: mathFuncName('multiply'),
    wasmIndex: 2,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
  [mathFuncName('divide')]: createFunctionDebugInfo({
    name: mathFuncName('divide'),
    wasmIndex: 3,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
  [mathFuncName('addOneLiner')]: createFunctionDebugInfo({
    name: mathFuncName('addOneLiner'),
    wasmIndex: 4,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
  [mathFuncName('subtractOneLiner')]: createFunctionDebugInfo({
    name: mathFuncName('subtractOneLiner'),
    wasmIndex: 5,
    signature: { params: ['i32', 'i32'], results: ['i32'] },
  }),
};

/**
 * Create a deep clone of an object for safe modification
 */
export function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Create a position key from line and column
 */
export function positionKey(line: number, column: number): string {
  return `${line}:${column}`;
}

/**
 * Create a SourceLocation object
 */
export function createSourceLocation(filePath: string, line: number, column: number): SourceLocation {
  return { filePath, line, column };
}

/**
 * Build functionsByFileAndPosition from functionsByName
 * Only includes functions that have representativeLocation
 */
export function buildFunctionsByFileAndPosition(
  functionsByName: Record<string, FunctionDebugInfo>
): Record<string, Record<string, FunctionDebugInfo>> {
  const result: Record<string, Record<string, FunctionDebugInfo>> = {};

  for (const func of Object.values(functionsByName)) {
    if (!func.representativeLocation) continue;

    const { filePath, line, column } = func.representativeLocation;
    if (!result[filePath]) {
      result[filePath] = {};
    }
    result[filePath][positionKey(line, column)] = func;
  }

  return result;
}

/**
 * Create complete BinaryDebugInfo for math.ts with all functions.
 * Optionally customize specific functions via overrides.
 *
 * Note: This creates functions WITHOUT representativeLocation by default.
 * Use createMathDebugInfoWithPositions for full position-keyed debug info.
 */
export function createMathDebugInfo(
  functionOverrides: Partial<Record<string, Partial<FunctionDebugInfo>>> = {}
): BinaryDebugInfo {
  const functions = cloneDeep(MATH_FUNCTIONS);

  // Apply overrides
  for (const [name, overrides] of Object.entries(functionOverrides)) {
    if (functions[name]) {
      Object.assign(functions[name], overrides);
    } else {
      // New function being added (e.g., for testing nonexistent function errors)
      functions[name] = createFunctionDebugInfo({
        name,
        wasmIndex: Object.keys(functions).length,
        ...overrides,
      } as FunctionDebugInfo);
    }
  }

  return createBinaryDebugInfo({
    debugSourceFiles: [MATH_SOURCE_PATH],
    functionsByName: functions,
  });
}

/**
 * Representative locations for math.ts functions (first statement position)
 * These are the positions where each function's first expression would be
 */
export const MATH_REPRESENTATIVE_LOCATIONS: Record<MathFunctionName, SourceLocation> = {
  add: createSourceLocation(MATH_SOURCE_PATH, 7, 2),
  subtract: createSourceLocation(MATH_SOURCE_PATH, 11, 2),
  multiply: createSourceLocation(MATH_SOURCE_PATH, 15, 2),
  divide: createSourceLocation(MATH_SOURCE_PATH, 19, 2),
  addOneLiner: createSourceLocation(MATH_SOURCE_PATH, 22, 48),
  subtractOneLiner: createSourceLocation(MATH_SOURCE_PATH, 25, 53),
};

/**
 * Create an expression at a math function's representative location
 */
export function createExpressionAtMathRepLocation(
  funcName: MathFunctionName,
  overrides: Partial<ExpressionDebugInfo> = {}
): ExpressionDebugInfo {
  const loc = MATH_REPRESENTATIVE_LOCATIONS[funcName];
  return createExpressionWithLocation(loc.filePath, loc.line, loc.column, overrides);
}

/**
 * Create complete BinaryDebugInfo with proper functionsByFileAndPosition.
 * All functions get representativeLocation, a default expression at that location,
 * and are indexed in both maps.
 */
export function createMathDebugInfoWithPositions(
  functionOverrides: Partial<Record<string, Partial<FunctionDebugInfo>>> = {}
): BinaryDebugInfo {
  // Start with base functions, add representativeLocation and default expression
  const functions: Record<string, FunctionDebugInfo> = {};

  for (const [shortName, location] of Object.entries(MATH_REPRESENTATIVE_LOCATIONS)) {
    const fullName = mathFuncName(shortName as MathFunctionName);
    const baseFunc = MATH_FUNCTIONS[fullName]!;
    functions[fullName] = {
      ...cloneDeep(baseFunc),
      representativeLocation: { ...location },
      expressions: [createExpressionWithLocation(location.filePath, location.line, location.column)],
    };
  }

  // Apply overrides
  for (const [name, overrides] of Object.entries(functionOverrides)) {
    if (functions[name]) {
      Object.assign(functions[name], overrides);
    } else {
      functions[name] = createFunctionDebugInfo({
        name,
        wasmIndex: Object.keys(functions).length,
        ...overrides,
      } as FunctionDebugInfo);
    }
  }

  return createBinaryDebugInfo({
    debugSourceFiles: [MATH_SOURCE_PATH],
    functionsByName: functions,
    functionsByFileAndPosition: buildFunctionsByFileAndPosition(functions),
  });
}
