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
import { resolve } from 'node:path';
import { debug } from '../utils/debug.mjs';
import type {
  NativeDebugInfoOutput,
  NativeFunctionDebugInfo,
  NativeExpressionDebugInfo,
  NativeSourceLocation,
  BinaryDebugInfo,
  FunctionDebugInfo,
  SourceLocation,
  ExpressionDebugInfo,
} from '../types.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

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
  // TODO - add these to a separate collection for debugging/tracking (maybe functionsByName)
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
    expressions,
    basicBlocks: rawFunc.basicBlocks,
  };

  if (rawFunc.globalName) {
    converted.globalName = rawFunc.globalName;
  }

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
  const functionsByName: Record<string, FunctionDebugInfo> = {};

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

    // Check for and log name collisions
    if (functionsByName[func.name]) {
      const existing = functionsByName[func.name]!;
      const existingPos = existing.representativeLocation
        ? `${existing.representativeLocation.filePath}:${existing.representativeLocation.line}:${existing.representativeLocation.column}`
        : 'NO_POS';
      debug(`[AddonInterface] ERROR - NAME COLLISION: "${func.name}" already at ${existingPos}, new at ${filePath}:${positionKey}`);
      nameCollisionCount++;
    }

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

    // Name lookup for v1 instrumentation and potential matching optimization
    functionsByName[func.name] = func;
  }

  const byNameCount = Object.keys(functionsByName).length;
  const byPositionCount = Object.values(functionsByFileAndPosition).reduce((sum, m) => sum + Object.keys(m).length, 0);
  debug(`[AddonInterface] Transform complete: ${byNameCount} by name, ${byPositionCount} by position, ${nameCollisionCount} name collisions, ${positionCollisionCount} position collisions, ${skippedCount} skipped`);

  return {
    debugSourceFiles: raw.debugSourceFiles,
    functionsByFileAndPosition,
    functionsByName
  };
}

/**
 * Extract debug information from a WASM binary with source map
 *
 * @param wasmBuffer - Buffer containing the WASM binary
 * @param sourceMapBuffer - Buffer containing the source map JSON
 * @param projectRoot - Project root directory for resolving relative paths
 * @returns Processed debug information with 1-based columns and absolute paths
 *
 * @throws {TypeError} If wasmBuffer or sourceMapBuffer are not Buffers
 * @throws {Error} If WASM binary or source map is invalid
 */
export function extractDebugInfo(
  wasmBuffer: Buffer,
  sourceMapBuffer: Buffer
): BinaryDebugInfo {
  if (!Buffer.isBuffer(wasmBuffer)) {
    throw new TypeError('wasmBuffer must be a Buffer');
  }
  if (!Buffer.isBuffer(sourceMapBuffer)) {
    throw new TypeError('sourceMapBuffer must be a Buffer');
  }

  // Call native addon to get raw output
  const raw: NativeDebugInfoOutput = addon.extractDebugInfo(wasmBuffer, sourceMapBuffer);

  // Transform to final format
  return transformDebugInfo(raw);
}
