/**
 * Binaryen-Based Coverage Instrumentation
 *
 * Post-processes compiled WASM binaries to inject coverage tracing.
 *
 * Architecture:
 * 1. Native addon extracts debug info (BinaryDebugInfo) from WASM + source map
 * 2. Binaryen reads binary and manipulates WASM module
 * 3. Inject memory operations to increment counters in separate coverage memory
 * 4. Assign coverageMemoryIndex to each FunctionDebugInfo for runtime correlation
 *
 * Multi-Memory Coverage (Node 20+):
 * - Uses WebAssembly multi-memory to store coverage counters in separate
 *   WebAssembly.Memory instance, avoiding test/user memory conflicts.
 * - Instrumentation injects native WASM memory operations (load/add/store)
 *   to avoid WASM→JS boundary crossings
 */

import binaryen from 'binaryen';
import { debug } from '../utils/debug.mjs';
import type { BinaryDebugInfo, FunctionDebugInfo } from '../types.js';

/**
 * Coverage instrumenter using Binaryen
 *
 * Implements function-level coverage by injecting trace calls at function entry.
 * Takes BinaryDebugInfo from native addon and assigns coverageMemoryIndex to each function.
 */
export class BinaryenCoverageInstrumenter {
  /** Internal counter for coverage memory indexing */
  private coverageMemoryIndex = 0;

  /**
   * Instrument WASM binary with coverage tracing
   *
   * @param wasmBuffer - Compiled WASM binary from AS compiler
   * @param binaryDebugInfo - Debug info extracted from WASM via native addon
   * @returns Object with instrumented binary and updated debug info (with coverageMemoryIndex assigned)
   */
  instrument(
    wasmBuffer: Uint8Array,
    binaryDebugInfo: BinaryDebugInfo
  ): { binary: Uint8Array; debugInfo: BinaryDebugInfo } {
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
    this.injectCoverageTracing(module, binaryDebugInfo);

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
      debugInfo: binaryDebugInfo, // Return same object with coverageMemoryIndex assigned
    };
  }

  /**
   * Inject coverage tracing into all user functions
   *
   * For each function:
   * 1. Look up function in BinaryDebugInfo.functionsByName
   * 2. Inject memory operations to increment coverage counter at function entry
   * 3. Assign coverageMemoryIndex to the FunctionDebugInfo
   */
  private injectCoverageTracing(module: binaryen.Module, binaryDebugInfo: BinaryDebugInfo): void {
    debug('[Binaryen Coverage] Injecting coverage memory operations');

    // Ensure __coverage_memory import exists
    this.ensureCoverageMemoryImport(module);

    const fileCount = Object.keys(binaryDebugInfo.functionsByFileAndPosition).length;
    const funcCount = Object.keys(binaryDebugInfo.functionsByName).length;
    debug(`[Binaryen Coverage] BinaryDebugInfo has ${funcCount} functions from ${fileCount} files`);

    const numFunctions = module.getNumFunctions();
    debug(`[Binaryen Coverage] Found ${numFunctions} functions in module`);

    // FIRST PASS: Collect all functions to instrument
    // Do NOT modify the module during this pass to avoid index shifting
    const functionsToInstrument: Array<{
      binaryenFuncInfo: binaryen.FunctionInfo;
      functionDebugInfo: FunctionDebugInfo;
    }> = [];

    debug(`[Binaryen Coverage] PASS 1: Collecting functions to instrument`);

    for (let i = 0; i < numFunctions; i++) {
      const funcRef = module.getFunctionByIndex(i);
      const binaryenFuncInfo = binaryen.getFunctionInfo(funcRef);

      debug(`[Binaryen Coverage] Function ${i}: name="${binaryenFuncInfo.name}", module="${binaryenFuncInfo.module}", hasBody=${!!binaryenFuncInfo.body}`);

      // Skip if this is an import (has non-empty module name)
      if (binaryenFuncInfo.module !== null && binaryenFuncInfo.module !== '') {
        debug(`[Binaryen Coverage] Skipping import: ${binaryenFuncInfo.name}`);
        continue;
      }

      // Skip framework functions (start with __)
      if (binaryenFuncInfo.name.startsWith('__')) {
        debug(`[Binaryen Coverage] Skipping framework function: ${binaryenFuncInfo.name}`);
        continue;
      }

      // Skip test framework functions (from assembly/index.ts)
      if (binaryenFuncInfo.name.startsWith('assembly/index/')) {
        debug(`[Binaryen Coverage] Skipping test framework function: ${binaryenFuncInfo.name}`);
        continue;
      }

      // Skip stdlib functions (start with ~lib/)
      if (binaryenFuncInfo.name.startsWith('~lib/')) {
        debug(`[Binaryen Coverage] Skipping stdlib function: ${binaryenFuncInfo.name}`);
        continue;
      }

      // Skip runtime functions (start with ~)
      if (binaryenFuncInfo.name.startsWith('~')) {
        debug(`[Binaryen Coverage] Skipping runtime function: ${binaryenFuncInfo.name}`);
        continue;
      }

      // Skip if no body
      if (!binaryenFuncInfo.body) {
        debug(`[Binaryen Coverage] Skipping empty function (no body): ${binaryenFuncInfo.name}`);
        continue;
      }

      // Look up function in BinaryDebugInfo by name
      const functionDebugInfo = binaryDebugInfo.functionsByName[binaryenFuncInfo.name];
      if (!functionDebugInfo) {
        debug(
          `[Binaryen Coverage] No debug info found for function "${binaryenFuncInfo.name}". ` +
          `Function is present in WASM binary but not in native addon's extracted debug info.`
        );
        continue;
      }

      // Add to list of functions to instrument
      debug(`[Binaryen Coverage] Will instrument function "${binaryenFuncInfo.name}"`);
      functionsToInstrument.push({
        binaryenFuncInfo,
        functionDebugInfo,
      });
    }

    debug(`[Binaryen Coverage] PASS 1 complete: ${functionsToInstrument.length} functions collected`);

    // SECOND PASS: Actually instrument the collected functions
    debug(`[Binaryen Coverage] PASS 2: Instrumenting ${functionsToInstrument.length} functions`);

    for (const { binaryenFuncInfo, functionDebugInfo } of functionsToInstrument) {
      debug(`[Binaryen Coverage] Instrumenting function "${binaryenFuncInfo.name}" (coverage index ${this.coverageMemoryIndex})`);
      this.instrumentFunction(module, binaryenFuncInfo, functionDebugInfo);
    }

    debug(`[Binaryen Coverage] Instrumented ${this.coverageMemoryIndex} functions`);
  }

  /**
   * Instrument a single function with coverage tracing
   */
  private instrumentFunction(
    module: binaryen.Module,
    binaryenFuncInfo: binaryen.FunctionInfo,
    functionDebugInfo: FunctionDebugInfo
  ): void {
    // Get the current coverage memory index for this function
    const coverageIdx = this.coverageMemoryIndex;
    this.coverageMemoryIndex++;

    // Assign coverageMemoryIndex to the FunctionDebugInfo (mutates in place)
    functionDebugInfo.coverageMemoryIndex = coverageIdx;

    const locationStr = functionDebugInfo.representativeLocation
      ? `${functionDebugInfo.representativeLocation.line}:${functionDebugInfo.representativeLocation.column}`
      : 'no-location';
    debug(`[Binaryen Coverage] Function ${binaryenFuncInfo.name}: location=${locationStr}, coverageIdx=${coverageIdx}`);

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
    const newBody = module.block(null, [stored, binaryenFuncInfo.body], binaryenFuncInfo.results);

    // Replace the function with the instrumented version
    // We need to remove and re-add since there's no "update" method
    const functionName = binaryenFuncInfo.name;

    debug(`[Binaryen Coverage] Before removeFunction/addFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

    module.removeFunction(functionName);

    debug(`[Binaryen Coverage] After removeFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

    module.addFunction(
      functionName,
      binaryenFuncInfo.params,
      binaryenFuncInfo.results,
      binaryenFuncInfo.vars,
      newBody
    );

    debug(`[Binaryen Coverage] After addFunction for "${functionName}":`);
    debug(`[Binaryen Coverage]   Total functions in module: ${module.getNumFunctions()}`);

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
   * Get the total number of instrumented functions (for coverage memory sizing)
   */
  getInstrumentedFunctionCount(): number {
    return this.coverageMemoryIndex;
  }
}
