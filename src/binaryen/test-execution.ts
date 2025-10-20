/**
 * Test Execution Support via Binaryen
 *
 * Post-processes compiled WASM binaries to inject __execute_function for test execution.
 * Solves tree-shaking issue where AS compiler removes exports only called from Node.js.
 *
 * Architecture:
 * 1. AS Compiler generates WASM binary
 * 2. Binaryen reads binary and manipulates WASM module
 * 3. Inject __execute_function that uses call_indirect
 * 4. Export the function so it's callable from Node.js
 */

import binaryen from 'binaryen';
import { debug } from '../utils/debug.mjs';

/**
 * Test execution injector using Binaryen
 *
 * Injects __execute_function into WASM binary to enable test execution
 * via function.index pattern without AS compiler tree-shaking.
 */
export class BinaryenTestExecutionInjector {
  /**
   * Inject test execution support into WASM binary
   *
   * @param wasmBuffer - Compiled WASM binary from AS compiler
   * @returns Modified WASM binary with __execute_function injected
   */
  inject(wasmBuffer: Uint8Array): Uint8Array {
    debug('[Binaryen] Starting test execution injection');
    const startTime = performance.now();

    // Read WASM binary into Binaryen module
    const module = binaryen.readBinary(wasmBuffer);

    // Enable BulkMemoryOpt feature for validation
    // AS compiler generates memory.copy operations which require this feature
    // Note: We use BulkMemoryOpt (not BulkMemory) to avoid assertion errors
    const currentFeatures = module.getFeatures();
    module.setFeatures(currentFeatures | binaryen.Features.BulkMemoryOpt);

    // Inject __execute_function
    this.injectExecuteFunction(module);

    // Validate the module after injection
    const isValid = module.validate();
    if (!isValid) {
      throw new Error('Binaryen validation failed after test execution injection');
    }
    debug('[Binaryen] Validation passed');

    // Emit modified binary
    const modifiedBuffer = module.emitBinary();

    const endTime = performance.now();
    const overhead = (endTime - startTime).toFixed(2);
    debug(`[Binaryen] Test execution injection complete in ${overhead}ms`);
    debug(`[Binaryen] Binary size: ${wasmBuffer.length} → ${modifiedBuffer.length} bytes`);

    return modifiedBuffer;
  }

  /**
   * Inject __execute_function into WASM module
   *
   * Creates a function that:
   * 1. Takes a function index (u32) as parameter
   * 2. Uses call_indirect to execute the function from the function table
   * 3. Is exported so Node.js can call it
   *
   * This solves the tree-shaking issue because:
   * - AS compiler can't remove Binaryen-injected code
   * - Function is explicitly exported at WASM level
   * - Bypasses AS compiler's export analysis entirely
   *
   * Implementation based on assemblyscript-unittest-framework's approach.
   */
  private injectExecuteFunction(module: binaryen.Module): void {
    debug('[Binaryen] Injecting __execute_function');

    // Check if function already exists (shouldn't, but be defensive)
    const numExports = module.getNumExports();
    for (let i = 0; i < numExports; i++) {
      const exportRef = module.getExportByIndex(i);
      const exportInfo = binaryen.getExportInfo(exportRef);
      if (exportInfo && exportInfo.name === '__execute_function') {
        debug('[Binaryen] __execute_function already exported, skipping injection');
        return;
      }
    }

    // Get or create function table
    // AS compiler creates a table for function.index to work, but we need to ensure it exists
    const tableName = '0'; // Default table name in WASM (tables are numbered)

    // Define function signature: (params) -> (result)
    // For __execute_function: (i32) -> void
    const paramTypes = binaryen.createType([binaryen.i32]);
    const resultType = binaryen.none;

    // Create the function type for the function we're creating
    // This is NOT the signature of the functions we'll call indirectly
    // The indirect calls will use their own signatures from the function table

    // Create function body:
    // (call_indirect (table 0) (local.get 0))
    //
    // This retrieves the function index from parameter 0 and executes it via call_indirect
    // The indirect call uses a function type of () -> void since tests take no params
    const testFuncType = binaryen.createType([]);
    const body = module.call_indirect(
      tableName,
      module.local.get(0, binaryen.i32), // Get fnIndex from parameter 0
      [], // No arguments to pass to the target function
      testFuncType, // Type signature of functions being called: () -> void
      binaryen.none // Return type: void
    );

    // Add function to module
    const funcName = '__execute_function';
    module.addFunction(funcName, paramTypes, resultType, [], body);

    // Export the function so Node.js can call it
    module.addFunctionExport(funcName, funcName);

    debug('[Binaryen] Successfully injected and exported __execute_function');
  }
}
