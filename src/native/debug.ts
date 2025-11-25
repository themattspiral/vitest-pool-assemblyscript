/**
 * wasm-binaryen-debug - Node.js native addon for extracting debug information from WebAssembly binaries
 *
 * This module wraps Binaryen's C++ API to provide expression-level debug locations
 * and basic block information that the JavaScript API doesn't expose.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type {
  DebugInfo,
  InstrumentOptions,
  InstrumentResult,
} from './types.js';

// Export all types
export * from './types.js';

// Load the native addon
// The .node file is built by node-gyp into build/Release/
const req = createRequire(import.meta.dirname);
const addon = req('../build/Release/wasm_binaryen_debug.node');

/**
 * Extract debug information from a WASM binary with source map (in-memory buffers)
 *
 * This is the core API that takes binary data directly. Most efficient for use cases
 * where you already have the data in memory.
 *
 * @param wasmBuffer - Buffer containing the WASM binary
 * @param sourceMapBuffer - Buffer containing the source map JSON
 * @returns Complete debug information including expressions and basic blocks
 *
 * @throws {TypeError} If arguments are not Buffers
 * @throws {Error} If WASM binary or source map is invalid
 *
 * @example
 * ```typescript
 * const wasmBuffer = fs.readFileSync('module.wasm');
 * const sourceMapBuffer = fs.readFileSync('module.wasm.map');
 * const debugInfo = extractDebugInfo(wasmBuffer, sourceMapBuffer);
 *
 * // Access function information
 * for (const [funcName, info] of Object.entries(debugInfo.functions)) {
 *   console.log(`Function ${funcName} has ${info.expressions.length} expressions`);
 *   console.log(`  in ${info.basicBlocks.length} basic blocks`);
 * }
 * ```
 */
export function extractDebugInfo(
  wasmBuffer: Buffer,
  sourceMapBuffer: Buffer
): DebugInfo {
  if (!Buffer.isBuffer(wasmBuffer)) {
    throw new TypeError('wasmBuffer must be a Buffer');
  }
  if (!Buffer.isBuffer(sourceMapBuffer)) {
    throw new TypeError('sourceMapBuffer must be a Buffer');
  }

  return addon.extractDebugInfo(wasmBuffer, sourceMapBuffer);
}

/**
 * Extract debug information from WASM and source map files (convenience API)
 *
 * This is a convenience wrapper that reads files from disk. Paths can be relative
 * or absolute.
 *
 * @param wasmPath - Path to the WASM binary file
 * @param sourceMapPath - Path to the source map JSON file
 * @returns Complete debug information including expressions and basic blocks
 *
 * @throws {Error} If files cannot be read or are invalid
 *
 * @example
 * ```typescript
 * const debugInfo = extractDebugInfoFromFiles(
 *   './build/module.wasm',
 *   './build/module.wasm.map'
 * );
 * ```
 */
export function extractDebugInfoFromFiles(
  wasmPath: string,
  sourceMapPath: string
): DebugInfo {
  const wasmBuffer = readFileSync(resolve(wasmPath));
  const sourceMapBuffer = readFileSync(resolve(sourceMapPath));
  return extractDebugInfo(wasmBuffer, sourceMapBuffer);
}

/**
 * Instrument WASM for coverage tracking and extract debug info (not yet implemented)
 *
 * @param wasmBuffer - Buffer containing the WASM binary
 * @param sourceMapBuffer - Buffer containing the source map JSON
 * @param options - Optional instrumentation configuration
 * @returns Instrumented WASM, regenerated source map, debug info, and memory layout
 *
 * @throws {Error} Not yet implemented
 */
export function instrumentForCoverage(
  wasmBuffer: Buffer,
  sourceMapBuffer: Buffer,
  options?: InstrumentOptions
): InstrumentResult {
  throw new Error('instrumentForCoverage is not yet implemented');
}

/**
 * Instrument WASM from files (not yet implemented)
 *
 * @param wasmPath - Path to the WASM binary file
 * @param sourceMapPath - Path to the source map JSON file
 * @param options - Optional instrumentation configuration
 * @returns Instrumented WASM, regenerated source map, debug info, and memory layout
 *
 * @throws {Error} Not yet implemented
 */
export function instrumentForCoverageFromFiles(
  wasmPath: string,
  sourceMapPath: string,
  options?: InstrumentOptions
): InstrumentResult {
  throw new Error('instrumentForCoverageFromFiles is not yet implemented');
}
