/**
 * Binaryen-Based Coverage Instrumentation
 *
 * Post-processes compiled WASM binaries to inject coverage tracing.
 * This is an alternative to AS transform-based coverage instrumentation.
 *
 * Architecture:
 * 1. AS Transform extracts function metadata (name, source lines) during compilation
 * 2. AS Compiler generates WASM binary
 * 3. Binaryen reads binary and manipulates WASM module
 * 4. Inject __coverage_trace(funcIdx, blockIdx) calls at function entry
 * 5. Use metadata to map funcIdx → {name, file, lines} in debug info
 */

import binaryen from 'binaryen';
import { debug } from '../utils/debug.mjs';
import type { DebugInfo, FunctionInfo, FunctionMetadata } from '../types.js';

/**
 * Coverage instrumenter using Binaryen
 *
 * Implements function-level coverage by injecting trace calls at function entry.
 * Provides debug info mapping compatible with the existing AS transform approach.
 */
export class BinaryenCoverageInstrumenter {
  private functionInfos: FunctionInfo[] = [];
  private fileMap = new Map<string, number>();
  private files: string[] = [];

  /**
   * Instrument WASM binary with coverage tracing
   *
   * @param wasmBuffer - Compiled WASM binary from AS compiler
   * @param sourceFile - Source file path (for metadata lookup)
   * @returns Object with instrumented binary and debug info
   */
  instrument(
    wasmBuffer: Uint8Array,
    sourceFile: string
  ): { binary: Uint8Array; debugInfo: DebugInfo } {
    debug('[Binaryen Coverage] Starting coverage instrumentation');
    const startTime = performance.now();

    // Read WASM binary into Binaryen module
    const module = binaryen.readBinary(wasmBuffer);

    // Enable features for validation
    const currentFeatures = module.getFeatures();
    module.setFeatures(currentFeatures | binaryen.Features.BulkMemoryOpt);

    // Inject coverage tracing
    this.injectCoverageTracing(module, sourceFile);

    // Validate the module after instrumentation
    const isValid = module.validate();
    if (!isValid) {
      throw new Error('Binaryen validation failed after coverage instrumentation');
    }
    debug('[Binaryen Coverage] Validation passed');

    // Emit instrumented binary
    const instrumentedBuffer = module.emitBinary();

    const endTime = performance.now();
    const overhead = (endTime - startTime).toFixed(2);
    debug(`[Binaryen Coverage] Instrumentation complete in ${overhead}ms`);
    debug(`[Binaryen Coverage] Binary size: ${wasmBuffer.length} → ${instrumentedBuffer.length} bytes`);
    debug(`[Binaryen Coverage] Instrumented ${this.functionInfos.length} functions`);

    return {
      binary: instrumentedBuffer,
      debugInfo: this.getDebugInfo(),
    };
  }

  /**
   * Inject coverage tracing into all user functions
   *
   * For each function:
   * 1. Inject __coverage_trace(funcIdx, 0) at function entry
   * 2. Extract debug info (name, file, lines) from AS transform metadata
   */
  private injectCoverageTracing(module: binaryen.Module, sourceFile: string): void {
    debug('[Binaryen Coverage] Injecting coverage trace calls');

    // Ensure __coverage_trace import exists
    this.ensureCoverageTraceImport(module);

    // Load function metadata from AS transform
    // The transform stores paths as AS sees them (relative), but we receive absolute paths
    // Try both absolute and relative lookups
    let metadata = globalThis.__functionMetadata?.get(sourceFile);

    if (!metadata) {
      // Try finding by checking if any stored key is a suffix of our sourceFile
      for (const [key, value] of globalThis.__functionMetadata?.entries() || []) {
        if (sourceFile.endsWith(key)) {
          metadata = value;
          debug(`[Binaryen Coverage] Found metadata using suffix match: ${key}`);
          break;
        }
      }
    }

    const metadataArray = metadata || [];
    debug(`[Binaryen Coverage] Loaded metadata for ${metadataArray.length} functions from transform`);

    // Since arrow functions don't have names in the AST, we can't match by name
    // Instead, we'll match by index - the order should be consistent
    let metadataIndex = 0;

    const numFunctions = module.getNumFunctions();
    debug(`[Binaryen Coverage] Found ${numFunctions} functions in module`);

    let instrumentedCount = 0;

    // Iterate through all functions
    for (let i = 0; i < numFunctions; i++) {
      const funcRef = module.getFunctionByIndex(i);
      const funcInfo = binaryen.getFunctionInfo(funcRef);

      // Skip if this is an import (has non-empty module name)
      // Real imports have module="env", non-imports have module=""
      if (funcInfo.module !== null && funcInfo.module !== '') {
        debug(`[Binaryen Coverage] Skipping import: ${funcInfo.name}`);
        continue;
      }

      // Skip framework functions (start with __)
      if (funcInfo.name.startsWith('__')) {
        debug(`[Binaryen Coverage] Skipping framework function: ${funcInfo.name}`);
        continue;
      }

      // Skip stdlib functions (start with ~lib/)
      if (funcInfo.name.startsWith('~lib/')) {
        debug(`[Binaryen Coverage] Skipping stdlib function: ${funcInfo.name}`);
        continue;
      }

      // Skip runtime functions (start with ~)
      if (funcInfo.name.startsWith('~')) {
        debug(`[Binaryen Coverage] Skipping runtime function: ${funcInfo.name}`);
        continue;
      }

      // Skip if no body
      if (!funcInfo.body) {
        debug(`[Binaryen Coverage] Skipping (no body): ${funcInfo.name}`);
        continue;
      }

      // Get metadata for this function (match by index)
      const meta: FunctionMetadata | null = metadataIndex < metadataArray.length ? metadataArray[metadataIndex]! : null;
      metadataIndex++;

      // Instrument this function
      this.instrumentFunction(module, funcInfo, instrumentedCount, meta, sourceFile);
      instrumentedCount++;
    }

    debug(`[Binaryen Coverage] Instrumented ${instrumentedCount} functions`);
  }

  /**
   * Instrument a single function with coverage tracing
   */
  private instrumentFunction(
    module: binaryen.Module,
    funcInfo: binaryen.FunctionInfo,
    funcIdx: number,
    meta: FunctionMetadata | null,
    sourceFile: string
  ): void {
    // Get file index
    const fileIdx = this.getOrCreateFileIndex(sourceFile);

    // Store function debug info with real line numbers from metadata
    if (meta) {
      this.functionInfos.push({
        name: funcInfo.name,
        fileIdx,
        startLine: meta.startLine,
        endLine: meta.endLine,
      });
      debug(`[Binaryen Coverage] Function ${funcInfo.name}: lines ${meta.startLine}-${meta.endLine}`);
    } else {
      // Fallback to placeholder if no metadata found
      this.functionInfos.push({
        name: funcInfo.name,
        fileIdx,
        startLine: 0,
        endLine: 0,
      });
      debug(`[Binaryen Coverage] Function ${funcInfo.name}: no metadata found, using placeholders`);
    }

    // Create trace call: __coverage_trace(funcIdx, 0)
    const traceCall = module.call(
      '__coverage_trace',
      [
        module.i32.const(funcIdx),
        module.i32.const(0), // blockIdx = 0 for function entry
      ],
      binaryen.none
    );

    // Create new function body: block { trace_call; original_body; }
    // We wrap in a block to sequence the trace call before the original body
    const newBody = module.block(null, [traceCall, funcInfo.body], funcInfo.results);

    // Replace the function with the instrumented version
    // We need to remove and re-add since there's no "update" method
    const functionName = funcInfo.name;
    module.removeFunction(functionName);
    module.addFunction(
      functionName,
      funcInfo.params,
      funcInfo.results,
      funcInfo.vars,
      newBody
    );

    // Re-export if it was exported
    // Check if this function was exported
    const numExports = module.getNumExports();
    for (let i = 0; i < numExports; i++) {
      const exportRef = module.getExportByIndex(i);
      const exportInfo = binaryen.getExportInfo(exportRef);
      if (exportInfo && exportInfo.value === functionName) {
        // Already exported, no need to re-add
        break;
      }
    }

    debug(`[Binaryen Coverage] Instrumented function: ${functionName} (idx=${funcIdx})`);
  }

  /**
   * Ensure __coverage_trace import exists in the module
   *
   * If it doesn't exist, add it: __coverage_trace(funcIdx: i32, blockIdx: i32) -> void
   */
  private ensureCoverageTraceImport(module: binaryen.Module): void {
    // Check if __coverage_trace already exists
    try {
      const func = module.getFunction('__coverage_trace');
      if (func) {
        debug('[Binaryen Coverage] __coverage_trace import already exists');
        return;
      }
    } catch (e) {
      // Function doesn't exist, we'll add it
    }

    // Add import: @external("env", "__coverage_trace")
    // declare function __coverage_trace(funcIdx: i32, blockIdx: i32): void
    const params = binaryen.createType([binaryen.i32, binaryen.i32]);
    const results = binaryen.none;

    module.addFunctionImport(
      '__coverage_trace',  // internal name
      'env',               // module name
      '__coverage_trace',  // base name
      params,
      results
    );

    debug('[Binaryen Coverage] Added __coverage_trace import');
  }

  /**
   * Get or create a file index for the given path
   */
  private getOrCreateFileIndex(path: string): number {
    if (this.fileMap.has(path)) {
      return this.fileMap.get(path)!;
    }

    const idx = this.files.length;
    this.files.push(path);
    this.fileMap.set(path, idx);
    return idx;
  }

  /**
   * Get the debug info mapping after instrumentation
   */
  getDebugInfo(): DebugInfo {
    return {
      files: this.files,
      functions: this.functionInfos,
    };
  }
}
