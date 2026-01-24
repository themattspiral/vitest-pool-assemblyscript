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

import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debug } from '../util/debug.js';
import {
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
import { POOL_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';

const DEBUG_NATIVE_ADDON = false;

// Load the native addon
// The .node file is built by node-gyp into build/Release/ (see binding.gyp)
// We are usually running from dist/ but when executing directly from unit tests
// the meta.import.dirname is still the src path, so we handle fallback to that
const ADDON_PATH = 'build/Release/wasm_binaryen_debug.node';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootFromDist = resolve(__dirname, '..');
const rootFromSrc = resolve(__dirname, '../..');
const addonPathFromDist = resolve(rootFromDist, ADDON_PATH);
const addonPathFromSrc = resolve(rootFromSrc, ADDON_PATH);

let rootPath = rootFromDist;
let addonPath = addonPathFromDist;

try {
  await access(addonPath);
} catch {
  try {
    rootPath = rootFromSrc;
    addonPath = addonPathFromSrc
    await access(addonPath);
  } catch {
    throw createPoolError(
      `Native addon instrumentation file not found at ${addonPathFromDist} or ${addonPathFromSrc}`,
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }
}

const req = createRequire(rootPath);
const addon = req(addonPath);

/**
 * Convert a raw location (0-indexed columns, path indexes) to 
 * processed location (1-indexed columns, path strings)
 */
function convertLocation(
  rawLocation: NativeSourceLocation,
  debugSourceFiles: string[]
): SourceLocation {
  const filePath = debugSourceFiles[rawLocation.fileIndex];

  if (!filePath) {
    throw createPoolError(
      `No debug source file with index: ${rawLocation.fileIndex}}`,
      POOL_ERROR_NAMES.WASMInstrumentationError
    );
  }
  
  return {
    filePath: filePath!,
    line: rawLocation.line,
    column: rawLocation.column + 1,  // convert from 0-indexed to 1-indexed
  };
}

/**
 * Convert a raw expression to processed format
 */
function convertExpression(
  rawExpr: NativeExpressionDebugInfo,
  debugSourceFiles: string[]
): ExpressionDebugInfo {
  const converted: ExpressionDebugInfo = {
    type: rawExpr.type,
    isBranch: rawExpr.isBranch,
  };

  if (rawExpr.branchPaths !== undefined) {
    converted.branchPaths = rawExpr.branchPaths;
  }

  if (rawExpr.location) {
    const convertedLocation = convertLocation(rawExpr.location, debugSourceFiles);
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
  debugSourceFiles: string[]
): { func: FunctionDebugInfo; filePath: string; positionKey: string } | undefined {
  const representativeLocation = convertLocation(rawFunc.representativeLocation, debugSourceFiles);

  // Convert expressions
  const expressions: ExpressionDebugInfo[] = [];
  if (rawFunc.expressions) {
    for (const expr of rawFunc.expressions) {
      expressions.push(convertExpression(expr, debugSourceFiles));
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
 * Transform raw native addon output to processed BinaryDebugInfo
 */
function transformDebugInfo(
  raw: NativeDebugInfoOutput,
  logPrefix: string,
): BinaryDebugInfo {
  const functionsByFileAndPosition: Record<string, Record<string, FunctionDebugInfo>> = {};

  debug(`${logPrefix} - Converting ${raw.functions.length} functions`);

  let positionCollisionCount = 0;
  let skippedCount = 0;
  let instrumentedFunctionCount = 0;
  
  for (const rawFunc of raw.functions) {
    const result = convertFunction(rawFunc, raw.debugSourceFiles);
    if (!result) {
      debug(`${logPrefix} - WARNING: Skipped function (bad conversion): "${rawFunc.name}"`);
      skippedCount++;
      continue;
    }

    const { func, filePath, positionKey } = result;

    // Check for position collisions
    if (functionsByFileAndPosition[filePath]?.[positionKey]) {
      const existing = functionsByFileAndPosition[filePath][positionKey];
      positionCollisionCount++;
      throw createPoolError(
        `ERROR - Function Debug Position Collision at ${filePath}:${positionKey}: "${existing.name}" will be replaced by "${func.name}"`,
        POOL_ERROR_NAMES.WASMInstrumentationError
      );
    }

    instrumentedFunctionCount++;

    // Group by file and position
    if (!functionsByFileAndPosition[filePath]) {
      functionsByFileAndPosition[filePath] = {};
    }

    functionsByFileAndPosition[filePath][positionKey] = func;
  }

  debug(
    `${logPrefix} - BinaryDebugInfo transform complete: ${instrumentedFunctionCount} instrumented functions`
    +` (${positionCollisionCount} position collisions, ${skippedCount} skipped)`
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
    debug: DEBUG_NATIVE_ADDON,
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

  const debugInfo = transformDebugInfo(nativeResult.debugInfo, interfaceLogPrefix);
  
  const transformTime = performance.now();
  debug(`${interfaceLogPrefix} - TIMING DebugInfo Transform: ${(transformTime - addonTime).toFixed(2)} ms`);
  debug(`${interfaceLogPrefix} - Binary size: ${nativeResult.instrumentedWasm.length} bytes | Source map size: ${nativeResult.sourceMap.length * 2} bytes`);

  return {
    instrumentedWasm: nativeResult.instrumentedWasm,
    sourceMap: nativeResult.sourceMap,
    debugInfo,
  };
}
