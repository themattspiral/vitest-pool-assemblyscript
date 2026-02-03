/**
 * Native addon interface for extracting debug information from WebAssembly binaries
 *
 * This module wraps Binaryen's C++ API to provide expression-level debug locations
 * and basic block information that the JavaScript API doesn't expose.
 *
 * The native addon outputs raw data (0-based columns, relative paths) which this
 * wrapper transforms into the final BinaryDebugInfo format (1-based columns,
 * absolute paths, grouped by file and position).
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debug } from '../util/debug.js';
import {
  NativeAddon,
  NativeInstrumentationResult,
  NativeDebugInfoOutput,
  NativeFunctionDebugInfo,
  NativeExpressionDebugInfo,
  NativeSourceLocation,
  BinaryDebugInfo,
  FunctionDebugInfo,
  SourceLocation,
  ExpressionDebugInfo,
  InstrumentationResult,
  NativeInstrumentationOptions,
  InstrumentationOptions,
} from '../types/types.js';
import { POOL_ERROR_NAMES, INTERNAL_PATH_LIB_PREFIX } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';
import { getShortFunctionName } from '../wasm-executor/wasm-names.js';

// Load the native addon via node-gyp-build
// node-gyp-build checks: prebuilds/ first, then build/Release/
// It searches from the given directory for a package.json to find the package root.
// We run from dist/ (published) or src/ (dev/tests), so we try both root paths.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootFromDist = resolve(__dirname, '..');
const rootFromSrc = resolve(__dirname, '../..');

const require = createRequire(import.meta.url);
const nodeGypBuild: (dir: string) => NativeAddon = require('node-gyp-build');

let addon: NativeAddon;
try {
  addon = nodeGypBuild(rootFromDist);
} catch {
  try {
    addon = nodeGypBuild(rootFromSrc);
  } catch (err) {
    throw createPoolError(
      `Native addon not found. Searched from ${rootFromDist} and ${rootFromSrc}. ` +
      `Ensure prebuilds are available or run 'npm run build:native' to compile from source. ` +
      `Original error: ${err instanceof Error ? err.message : String(err)}`,
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }
}

/**
 * Convert a raw location (0-indexed columns, path indexes) to
 * processed location (1-indexed columns, absolute path strings)
 *
 * Source map paths vary by import style and project structure:
 * - Relative imports: "assembly/compare.ts"
 * - Bare package imports: "~lib/vitest-pool-assemblyscript/assembly/compare.ts"
 * - Source outside project root: "../assembly/compare.ts" (e.g. test-external importing parent sources)
 *
 * All are normalized to absolute filesystem paths for consistent coverage key matching.
 */
function convertLocation(
  rawLocation: NativeSourceLocation,
  debugSourceFiles: string[],
  projectRoot: string
): SourceLocation {
  let filePath = debugSourceFiles[rawLocation.fileIndex];

  if (!filePath) {
    throw createPoolError(
      `No debug source file with index: ${rawLocation.fileIndex}}`,
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }

  // Normalize to absolute path for consistent coverage key matching
  if (filePath.startsWith(INTERNAL_PATH_LIB_PREFIX)) {
    // ~lib/vitest-pool-assemblyscript/assembly/X.ts -> projectRoot/assembly/X.ts
    const relativePart = filePath.slice(INTERNAL_PATH_LIB_PREFIX.length);
    filePath = resolve(projectRoot, 'assembly', relativePart);
  } else {
    // Resolve relative path (handles both 'assembly/X.ts' and '../assembly/X.ts')
    filePath = resolve(projectRoot, filePath);
  }

  return {
    filePath,
    line: rawLocation.line,
    column: rawLocation.column + 1,  // convert from 0-indexed to 1-indexed
  };
}

/**
 * Convert a raw expression to processed format
 */
function convertExpression(
  rawExpr: NativeExpressionDebugInfo,
  debugSourceFiles: string[],
  projectRoot: string
): ExpressionDebugInfo {
  const converted: ExpressionDebugInfo = {
    type: rawExpr.type,
    isBranch: rawExpr.isBranch,
  };

  if (rawExpr.branchPaths !== undefined) {
    converted.branchPaths = rawExpr.branchPaths;
  }

  if (rawExpr.location) {
    const convertedLocation = convertLocation(rawExpr.location, debugSourceFiles, projectRoot);
    if (convertedLocation) {
      converted.location = convertedLocation;
    }
  }

  return converted;
}

/**
 * Generate a position key to identify the SourceLocation uniquely
 * within a file. Does NOT include the file identifier.
 */
function getPositionKey(location: SourceLocation) {
  return `${location.line}:${location.column}`;
}

/**
 * Convert a raw function to processed format and compute position key
 * Returns undefined if function has no valid representative location
 */
function convertFunction(
  rawFunc: NativeFunctionDebugInfo,
  debugSourceFiles: string[],
  projectRoot: string
): { func: FunctionDebugInfo; filePath: string; positionKey: string } | undefined {
  const representativeLocation = convertLocation(rawFunc.representativeLocation, debugSourceFiles, projectRoot);

  // Convert expressions
  const expressions: ExpressionDebugInfo[] = [];
  if (rawFunc.expressions) {
    for (const expr of rawFunc.expressions) {
      expressions.push(convertExpression(expr, debugSourceFiles, projectRoot));
    }
  }

  const converted: FunctionDebugInfo = {
    wasmIndex: rawFunc.wasmIndex,
    name: rawFunc.name,
    representativeLocation,
    coverageMemoryIndex: rawFunc.coverageMemoryIndex,
    expressions,
    basicBlocks: rawFunc.basicBlocks,
  };

  const filePath = representativeLocation.filePath;
  const positionKey = getPositionKey(representativeLocation);

  return { func: converted, filePath, positionKey };
}

/**
 * Check if two WASM function names are monomorphizations of the same generic function.
 * Generic monomorphizations share the same base name and suffix, differing only in
 * the type parameters inside angle brackets.
 *
 * e.g. "assembly/compare/closeTo<bool\2cbool>" and "assembly/compare/closeTo<bool\2cu8>"
 * e.g. "assembly/expect/BaseExpectMatcher<bool>#constructor" and "assembly/expect/BaseExpectMatcher<i8>#constructor"
 */
function isGenericMonomorphizationMatch(nameA: string, nameB: string): boolean {
  const openA = nameA.indexOf('<');
  const openB = nameB.indexOf('<');

  // Both must contain generic type parameters
  if (openA === -1 || openB === -1) return false;

  const lastCloseA = nameA.lastIndexOf('>');
  const lastCloseB = nameB.lastIndexOf('>');

  if (lastCloseA === -1 || lastCloseB === -1) return false;

  // Prefix before '<' must match (includes module path, class, function name)
  const prefixA = nameA.substring(0, openA);
  const prefixB = nameB.substring(0, openB);
  if (prefixA !== prefixB) return false;

  // Suffix after last '>' must match (e.g. "#constructor", or empty)
  const suffixA = nameA.substring(lastCloseA + 1);
  const suffixB = nameB.substring(lastCloseB + 1);
  if (suffixA !== suffixB) return false;

  return true;
}

/**
 * Transform raw native addon output to processed BinaryDebugInfo
 */
function transformDebugInfo(
  raw: NativeDebugInfoOutput,
  logPrefix: string,
  projectRoot: string,
): BinaryDebugInfo {
  const functionsByFileAndPosition: Record<string, Record<string, FunctionDebugInfo[]>> = {};

  debug(`${logPrefix} - Converting ${raw.functions.length} functions`);

  let genericCollisionCount = 0;
  let skippedCount = 0;
  let instrumentedFunctionCount = 0;

  for (const rawFunc of raw.functions) {
    const result = convertFunction(rawFunc, raw.debugSourceFiles, projectRoot);
    if (!result) {
      debug(`${logPrefix} - WARNING: Skipped function (bad conversion): "${rawFunc.name}"`);
      skippedCount++;
      continue;
    }

    const { func, filePath, positionKey } = result;

    // Check for position collisions
    const existingAtPosition = functionsByFileAndPosition[filePath]?.[positionKey];
    if (existingAtPosition) {
      const existingName = existingAtPosition[0]!.name;

      // Only allow collision if both are monomorphizations of the same generic
      if (isGenericMonomorphizationMatch(existingName, func.name)) {
        existingAtPosition.push(func);
        genericCollisionCount++;
        instrumentedFunctionCount++;
        debug(
          `${logPrefix} - Generic monomorphization at ${filePath}:${positionKey}:`
          + ` "${getShortFunctionName(func.name)}" grouped with "${getShortFunctionName(existingName)}"`
        );
        continue;
      }

      throw createPoolError(
        `ERROR - Function Debug Position Collision at ${filePath}:${positionKey}: "${getShortFunctionName(existingName)}"`
        + ` will be replaced by "${getShortFunctionName(func.name)}". This is a bug. Please report it at:`
        + ` https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new`,
        POOL_ERROR_NAMES.WASMInstrumentationError
      );
    }

    instrumentedFunctionCount++;

    // Group by file and position
    if (!functionsByFileAndPosition[filePath]) {
      functionsByFileAndPosition[filePath] = {};
    }

    functionsByFileAndPosition[filePath][positionKey] = [func];
  }

  debug(
    `${logPrefix} - BinaryDebugInfo transform complete: ${instrumentedFunctionCount} instrumented functions`
    + ` (${genericCollisionCount} generic collisions, ${skippedCount} skipped)`
  );

  return {
    debugSourceFiles: raw.debugSourceFiles,
    functionsByFileAndPosition,
    instrumentedFunctionCount,
  };
}

/**
 * Instrument a WASM binary for coverage collection and regenerate source map
 *
 * This function:
 * 1. Adds __coverage_memory import (multi-memory for coverage counters)
 * 2. Injects coverage counter increments at each function entry
 * 3. Regenerates source map with correct offsets after instrumentation
 * 4. Extracts debug info with coverageMemoryIndex assigned
 *
 * @param wasmBuffer - Buffer containing the clean WASM binary
 * @param sourceMapBuffer - Buffer containing the source map JSON
 * @returns Instrumented binary, regenerated source map, and debug info
 *
 * @throws {TypeError} If wasmBuffer or sourceMapBuffer are not Buffers
 * @throws {Error} If WASM binary or source map is invalid
 */
export function instrumentForCoverage(
  wasmBuffer: Buffer,
  sourceMapBuffer: Buffer,
  instrumentationOptions: InstrumentationOptions,
  logModule: string,
  logLabel: string,
): InstrumentationResult {
  if (!Buffer.isBuffer(wasmBuffer)) {
    throw createPoolError(
      'instrumentForCoverage - wasmBuffer must be a Buffer',
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }
  if (!Buffer.isBuffer(sourceMapBuffer)) {
    throw createPoolError(
      'instrumentForCoverage - sourceMapBuffer must be a Buffer',
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }

  const interfaceLogPrefix = `[${logModule} Inst] ${logLabel}`;
  const nativeLogPrefix = `[${logModule} InstNative] ${logLabel}`;

  debug(`${interfaceLogPrefix} - Calling native instrumentForCoverage`);
  const startTime = performance.now();

  const options: NativeInstrumentationOptions = {
    coverageMemoryPagesMin: instrumentationOptions.coverageMemoryPagesMin,
    coverageMemoryPagesMax: instrumentationOptions.coverageMemoryPagesMax,
    excludedFiles: instrumentationOptions.relativeExcludedFiles,
    excludedLibraryFilePrefix: instrumentationOptions.excludedLibraryFilePrefix,
    excludedLibraryFileOverridePrefix: instrumentationOptions.excludedLibraryFileOverridePrefix,
    debug: instrumentationOptions.debug,
    logPrefix: nativeLogPrefix
  };
  const nativeResult: NativeInstrumentationResult = addon.instrumentForCoverage(wasmBuffer, sourceMapBuffer, options);
  const addonTime = performance.now();
  debug(`${interfaceLogPrefix} - TIMING Native addon: ${(addonTime - startTime).toFixed(2)} ms`);

  if (nativeResult.errors?.length) {
    throw createPoolError(
      `Errors encountered duriing native instrumentation: ${nativeResult.errors.join('\n')}`,
      POOL_ERROR_NAMES.WASMInstrumentationError,
    );
  }

  const debugInfo = transformDebugInfo(nativeResult.debugInfo, interfaceLogPrefix, instrumentationOptions.projectRoot);
  
  const transformTime = performance.now();
  debug(`${interfaceLogPrefix} - TIMING DebugInfo Transform: ${(transformTime - addonTime).toFixed(2)} ms`);
  debug(`${interfaceLogPrefix} - Binary size: ${nativeResult.instrumentedWasm.length} bytes | Source map size: ${nativeResult.sourceMap.length * 2} bytes`);

  return {
    instrumentedWasm: nativeResult.instrumentedWasm,
    sourceMap: nativeResult.sourceMap,
    debugInfo,
  };
}
