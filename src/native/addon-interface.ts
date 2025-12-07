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

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debug, isDebugModeEnabled } from '../utils/debug.mjs';
import type {
  NativeInstrumentationResult,
  NativeDebugInfoOutput,
  NativeFunctionDebugInfo,
  NativeExpressionDebugInfo,
  NativeSourceLocation,
  BinaryDebugInfo,
  FunctionDebugInfo,
  SourceLocation,
  ExpressionDebugInfo,
  InstrumentationResult
} from '../types.js';

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
if (!existsSync(addonPath)) {
  rootPath = rootFromSrc;
  addonPath = addonPathFromSrc

  if (!existsSync(addonPath)) {
    throw new Error(`Native addon debug extractor file not found at ${addonPathFromDist} or ${addonPathFromSrc}`);
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
): SourceLocation | undefined {
  if (!rawLocation || !debugSourceFiles) {
    return undefined;
  }
  
  const filePath = debugSourceFiles[rawLocation.fileIndex];
  return filePath ? {
    filePath,
    line: rawLocation.line,
    column: rawLocation.column + 1,  // convert from 0-indexed to 1-indexed
  } : undefined;
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
  const representativeLocation = rawFunc.representativeLocation
    ? convertLocation(rawFunc.representativeLocation, debugSourceFiles)
    : undefined;

  // Skip functions without a valid representative location (can't group them)
  if (!representativeLocation) {
    return undefined;
  }

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
    hasDebugInfo: rawFunc.hasDebugInfo,
    signature: rawFunc.signature,
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
  raw: NativeDebugInfoOutput
): BinaryDebugInfo {
  const functionsByFileAndPosition: Record<string, Record<string, FunctionDebugInfo>> = {};

  let nameCollisionCount = 0;
  let positionCollisionCount = 0;
  let skippedCount = 0;

  for (const rawFunc of raw.functions) {
    const result = convertFunction(rawFunc, raw.debugSourceFiles);
    if (!result) {
      debug(`[AddonInterface] Skipped function (no representativeLocation): "${rawFunc.name}"`);
      skippedCount++;
      continue;
    }

    const { func, filePath, positionKey } = result;

    // Check for and log position collisions
    if (functionsByFileAndPosition[filePath]?.[positionKey]) {
      const existing = functionsByFileAndPosition[filePath][positionKey];
      debug(`[AddonInterface] ERROR - POSITION COLLISION at ${filePath}:${positionKey}: "${existing.name}" will be replaced by "${func.name}"`);
      positionCollisionCount++;
    }

    // Group by file and position
    if (!functionsByFileAndPosition[filePath]) {
      functionsByFileAndPosition[filePath] = {};
    }
    functionsByFileAndPosition[filePath][positionKey] = func;
  }

  const byPositionCount = Object.values(functionsByFileAndPosition).reduce((sum, m) => sum + Object.keys(m).length, 0);
  debug(`[AddonInterface] Transform complete: ${byPositionCount} by position, ${nameCollisionCount} name collisions, ${positionCollisionCount} position collisions, ${skippedCount} skipped`);

  return {
    debugSourceFiles: raw.debugSourceFiles,
    functionsByFileAndPosition,
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
  sourceMapBuffer: Buffer
): InstrumentationResult {
  if (!Buffer.isBuffer(wasmBuffer)) {
    throw new TypeError('wasmBuffer must be a Buffer');
  }
  if (!Buffer.isBuffer(sourceMapBuffer)) {
    throw new TypeError('sourceMapBuffer must be a Buffer');
  }

  debug('[AddonInterface] Calling native instrumentForCoverage');
  const startTime = performance.now();

  // Call native addon
  const raw: NativeInstrumentationResult = addon.instrumentForCoverage(wasmBuffer, sourceMapBuffer, isDebugModeEnabled());

  const addonTime = performance.now();
  debug(`[AddonInterface] Native addon completed in ${(addonTime - startTime).toFixed(2)}ms`);

  // Transform debug info to final format
  const debugInfo = transformDebugInfo(raw.debugInfo);

  const transformTime = performance.now();
  debug(`[AddonInterface] Transform completed in ${(transformTime - addonTime).toFixed(2)}ms`);
  debug(`[AddonInterface] Instrumented binary size: ${raw.instrumentedWasm.length} bytes`);
  debug(`[AddonInterface] Source map size: ${raw.sourceMap.length} bytes`);

  return {
    instrumentedWasm: raw.instrumentedWasm,
    sourceMap: raw.sourceMap,
    debugInfo,
  };
}
