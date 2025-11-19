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
 * 4. Inject memory operations to increment counters in separate coverage memory
 * 5. Use metadata to map funcIdx → {name, file, lines} in debug info
 *
 * Multi-Memory Coverage (Node 20+):
 * - Uses WebAssembly multi-memory to store coverage counters in separate 
 *   WebAssembly.Memory instance, avoid test/user memory conflicts.
 * - Instrumentation injects native WASM memory operations (load/add/store) 
 *   to avoid WASM→JS boundary crossings using imports/exports to track executions
 */

import binaryen from 'binaryen';
import { debug } from '../utils/debug.mjs';
import type { DebugInfo, FunctionInfo } from '../types.js';

/**
 * Coverage instrumenter using Binaryen
 *
 * Implements function-level coverage by injecting trace calls at function entry.
 * Provides debug info mapping compatible with the existing AS transform approach.
 */
export class BinaryenCoverageInstrumenter {
  /** Output debug info in nested structure */
  private debugInfo: DebugInfo = { qualifiedFunctionsByAbsoluteFilePath: {}, absoluteFilePathByQualifiedFunctionName: {} };
  /** Internal counter for coverage memory indexing */
  private coverageMemoryIndex = 0;

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

    // Enable features for validation and multi-memory support
    const currentFeatures = module.getFeatures();
    module.setFeatures(
      currentFeatures |
      binaryen.Features.BulkMemoryOpt |
      binaryen.Features.MultiMemory
    );

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
    debug(`[Binaryen Coverage] Instrumented ${this.coverageMemoryIndex} functions`);

    return {
      binary: instrumentedBuffer,
      debugInfo: this.getDebugInfo(),
    };
  }

  /**
   * Inject coverage tracing into all user functions
   *
   * For each function:
   * 1. Inject memory operations to increment coverage counter at function entry
   * 2. Extract debug info (name, file, lines) from AS transform metadata
   */
  private injectCoverageTracing(module: binaryen.Module, _sourceFile: string): void {
    debug('[Binaryen Coverage] Injecting coverage memory operations');

    // Ensure __coverage_memory import exists
    this.ensureCoverageMemoryImport(module);

    // Load function metadata from transform
    // The transform collects metadata from all User and UserEntry sources
    const metadata = globalThis.__functionMetadata;

    if (metadata) {
      const fileCount = Object.keys(metadata.qualifiedFunctionsByAbsoluteFilePath).length;
      const funcCount = Object.keys(metadata.absoluteFilePathByQualifiedFunctionName).length;
      debug(`[Binaryen Coverage] Loading metadata from ${fileCount} source files`);
      for (const [path, functions] of Object.entries(metadata.qualifiedFunctionsByAbsoluteFilePath)) {
        debug(`[Binaryen Coverage]   ${path}: ${Object.keys(functions).length} functions`);
      }
      debug(`[Binaryen Coverage] Total metadata: ${funcCount} unique functions from all sources`);
    } else {
      debug(`[Binaryen Coverage] No metadata found in globalThis.__functionMetadata`);
    }

    const numFunctions = module.getNumFunctions();
    debug(`[Binaryen Coverage] Found ${numFunctions} functions in module`);

    // FIRST PASS: Collect all functions to instrument
    // Do NOT modify the module during this pass to avoid index shifting
    const functionsToInstrument: Array<{
      funcInfo: binaryen.FunctionInfo;
      functionInfo: FunctionInfo;
      filePath: string;
    }> = [];

    debug(`[Binaryen Coverage] PASS 1: Collecting functions to instrument`);

    for (let i = 0; i < numFunctions; i++) {
      const funcRef = module.getFunctionByIndex(i);
      const funcInfo = binaryen.getFunctionInfo(funcRef);

      debug(`[Binaryen Coverage] Function ${i}: name="${funcInfo.name}", module="${funcInfo.module}", hasBody=${!!funcInfo.body}`);

      // Skip if this is an import (has non-empty module name)
      if (funcInfo.module !== null && funcInfo.module !== '') {
        debug(`[Binaryen Coverage] Skipping import: ${funcInfo.name}`);
        continue;
      }

      // Skip framework functions (start with __)
      if (funcInfo.name.startsWith('__')) {
        debug(`[Binaryen Coverage] Skipping framework function: ${funcInfo.name}`);
        continue;
      }

      // Skip test framework functions (from assembly/index.ts)
      if (funcInfo.name.startsWith('assembly/index/')) {
        debug(`[Binaryen Coverage] Skipping test framework function: ${funcInfo.name}`);
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
        debug(`[Binaryen Coverage] Skipping empty function (no body): ${funcInfo.name}`);
        continue;
      }

      // Get metadata for this function using reverse lookup
      if (!metadata) {
        debug(`[Binaryen Coverage] No metadata available, skipping function "${funcInfo.name}"`);
        continue;
      }

      const filePath = metadata.absoluteFilePathByQualifiedFunctionName[funcInfo.name];
      if (!filePath) {
        debug(
          `[Binaryen Coverage] No metadata found for function "${funcInfo.name}". ` +
          `This indicates the transform failed to collect metadata for this function. ` +
          `Function is present in WASM binary but missing from transform metadata.`
        );
        continue;
      }

      const functionInfo = metadata.qualifiedFunctionsByAbsoluteFilePath[filePath]?.[funcInfo.name];
      if (!functionInfo) {
        debug(`[Binaryen Coverage] Function info not found for "${funcInfo.name}" in "${filePath}"`);
        continue;
      }

      // Add to list of functions to instrument
      debug(`[Binaryen Coverage] Will instrument function "${funcInfo.name}" from ${filePath}`);
      functionsToInstrument.push({
        funcInfo,
        functionInfo,
        filePath
      });
    }

    debug(`[Binaryen Coverage] PASS 1 complete: ${functionsToInstrument.length} functions collected`);

    // SECOND PASS: Actually instrument the collected functions
    debug(`[Binaryen Coverage] PASS 2: Instrumenting ${functionsToInstrument.length} functions`);

    for (const { funcInfo, functionInfo, filePath } of functionsToInstrument) {
      debug(`[Binaryen Coverage] Instrumenting function "${funcInfo.name}" (coverage index ${this.coverageMemoryIndex})`);
      this.instrumentFunction(filePath, module, funcInfo, functionInfo);
    }

    debug(`[Binaryen Coverage] Instrumented ${this.coverageMemoryIndex} functions`);
  }

  /**
   * Instrument a single function with coverage tracing
   */
  private instrumentFunction(
    filePath: string,
    module: binaryen.Module,
    funcInfo: binaryen.FunctionInfo,
    functionInfo: FunctionInfo
  ): void {
    // Ensure file entry exists in output debugInfo
    if (!this.debugInfo.qualifiedFunctionsByAbsoluteFilePath[filePath]) {
      this.debugInfo.qualifiedFunctionsByAbsoluteFilePath[filePath] = {};
    }

    // Get the current coverage memory index for this function
    const coverageIdx = this.coverageMemoryIndex;
    this.coverageMemoryIndex++;

    // Store function info in output debugInfo with coverageMemoryIndex
    const instrumentedFunctionInfo: FunctionInfo = {
      ...functionInfo,
      coverageMemoryIndex: coverageIdx,
    };
    this.debugInfo.qualifiedFunctionsByAbsoluteFilePath[filePath][funcInfo.name] = instrumentedFunctionInfo;
    this.debugInfo.absoluteFilePathByQualifiedFunctionName[funcInfo.name] = filePath;

    debug(`[Binaryen Coverage] Function ${funcInfo.name}: lines ${functionInfo.startLine}-${functionInfo.endLine}, coverageIdx=${coverageIdx}`);

    // Create memory operations to increment coverage counter
    // Calculate address: coverageIdx * 4 (4 bytes per i32 counter)
    const addr = module.i32.mul(
      module.i32.const(coverageIdx),
      module.i32.const(4)
    );

    // Load current counter value from coverage memory
    const loaded = module.i32.load(0, 1, addr, '__coverage_memory');

    // Increment counter
    const incremented = module.i32.add(loaded, module.i32.const(1));

    // Store incremented value back to coverage memory
    const stored = module.i32.store(0, 1, addr, incremented, '__coverage_memory');

    // Create new function body: block { stored; original_body; }
    // We wrap in a block to sequence the memory operations before the original body
    const newBody = module.block(null, [stored, funcInfo.body], funcInfo.results);

    // Replace the function with the instrumented version
    // We need to remove and re-add since there's no "update" method
    const functionName = funcInfo.name;

    debug(`[Binaryen Coverage] Before removeFunction/addFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

    module.removeFunction(functionName);

    debug(`[Binaryen Coverage] After removeFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

    module.addFunction(
      functionName,
      funcInfo.params,
      funcInfo.results,
      funcInfo.vars,
      newBody
    );

    debug(`[Binaryen Coverage] After addFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

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

    debug(`[Binaryen Coverage] Instrumented function: ${functionName} (coverageIdx=${coverageIdx})`);
  }

  /**
   * Ensure __coverage_memory import exists in the module
   *
   * Adds a second WebAssembly.Memory import for storing coverage counters.
   * This enables coverage tracking without WASM→JS boundary crossings.
   */
  private ensureCoverageMemoryImport(module: binaryen.Module): void {
    // Add coverage memory import
    // The memory will be provided by the executor as a second WebAssembly.Memory instance
    module.addMemoryImport(
      '__coverage_memory',  // internal name
      'env',                // module name
      '__coverage_memory'   // base name
    );

    debug('[Binaryen Coverage] Added __coverage_memory import');
  }

  /**
   * Get the debug info mapping after instrumentation
   */
  getDebugInfo(): DebugInfo {
    return this.debugInfo;
  }

  /**
   * Get the total number of instrumented functions (for coverage memory sizing)
   */
  getInstrumentedFunctionCount(): number {
    return this.coverageMemoryIndex;
  }
}
