/**
 * AssemblyScript Compiler
 *
 * Handles compilation of AssemblyScript source code to WASM binaries.
 * Manages compiler options, transforms, and in-memory compilation.
 */

import asc from 'assemblyscript/dist/asc.js';
import { basename } from 'path';

import type { CompileResult, CompilerOptions, DebugInfo } from './types.js';
import { debug, debugTiming } from './utils/debug.mjs';
import { BinaryenCoverageInstrumenter } from './coverage/instrumentation.js';

/**
 * Instrument WASM binary for coverage collection
 *
 * @param wasmBinary - Clean WASM binary from AS compiler
 * @param filename - Source filename (for debug info)
 * @returns Instrumented binary and debugInfo
 */
function instrumentBinaryForCoverage(
  wasmBinary: Uint8Array,
  filename: string
): {
  binary: Uint8Array;
  debugInfo: DebugInfo;
} {
  debug('[Compiler] Instrumenting binary for coverage');
  const coverageInstrumenter = new BinaryenCoverageInstrumenter();
  const result = coverageInstrumenter.instrument(wasmBinary, filename);

  debug('[Compiler] Instrumentation complete');

  return {
    binary: result.binary,
    debugInfo: result.debugInfo,
  };
}

/**
 * Compile AssemblyScript source code to WASM binary
 *
 * Features:
 * - In-memory compilation (binary captured via writeFile callback)
 * - Filesystem reading enabled (for import resolution)
 * - Uses stub runtime and imported memory pattern
 * - Exports _start function for explicit initialization control
 * - Always returns clean binary
 * - Conditionally returns instrumented binary when coverage enabled
 *
 * @param filename - Full path to the source file (used as entry point)
 * @param options - Compilation options (coverage mode, etc.)
 * @returns Compilation result with clean binary and optional instrumented binary
 * @throws Error if compilation fails
 */
export async function compileAssemblyScript(
  filename: string,
  options: CompilerOptions
): Promise<CompileResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | undefined;
  let sourceMap: string | undefined;

  // Use full path as entry file so AS compiler can resolve relative imports
  const entryFile = filename;
  // Use simple output name to avoid AS compiler prepending it to source map paths
  const outputFile = 'output.wasm';

  debug('[ASC Compiler] Compiling:', basename(filename));
  debug('[ASC Compiler] Entry file:', entryFile);
  debug('[ASC Compiler] Output file:', outputFile);

  // Capture stdout/stderr (for potential error reporting)
  const stdout = {
    write: (text: string) => {
      stdoutLines.push(text);
      return true;
    }
  };

  const stderr = {
    write: (text: string) => {
      stderrLines.push(text);
      return true;
    }
  };

  // Build compiler flags
  const compilerFlags = [
    entryFile,
    '--outFile', outputFile,
    '--optimizeLevel', '0',           // No optimization for easier debugging
    '--runtime', 'stub',              // Minimal runtime (no GC)
    '--importMemory',                 // Import memory from JS (enables imports during WASM start)
    '--debug',                        // Include debug info
    '--sourceMap',                    // Generate source maps for error reporting
    '--exportStart', '_start',        // Export start function for explicit initialization control
    '--exportTable',                  // Export function table for direct test execution
  ];

  // Add transform for coverage metadata extraction if coverage enabled
  if (options.coverage) {
    compilerFlags.push(
      '--transform', './src/transforms/extract-function-metadata.mjs'
    );
    debug('[ASC Compiler] Coverage enabled - adding metadata extraction transform');
  }

  // Add transform to strip @inline decorators if requested
  // This improves coverage accuracy by preventing functions from being inlined
  // Only applies when coverage is enabled.
  if (options.coverage && options.stripInline === true) {
    compilerFlags.push(
      '--transform', './src/transforms/strip-inline.mjs'
    );
    debug('[ASC Compiler] Stripping @inline decorators for coverage accuracy');
  }


  // Compile with AssemblyScript compiler
  const ascStart = performance.now();
  const result = await asc.main(compilerFlags, {
    stdout,
    stderr,
    // Let AS read from filesystem for import resolution
    // WASM binary and source map are captured in memory via writeFile callback
    writeFile: (name: string, contents: string | Uint8Array, _baseDir: string) => {
      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        sourceMap = contents;
      }
    },
  });
  const ascEnd = performance.now();
  debugTiming(`[TIMING] ${basename(filename)} - asc.main: ${ascEnd - ascStart}ms`);

  // Check for compilation errors
  if (result.error) {
    // Include stderr output if available for better error messages
    const errorMessage = stderrLines.length > 0
      ? `${result.error.message}\n\nASC Compiler output:\n${stderrLines.join('')}`
      : result.error.message;

    const enhancedError = new Error(errorMessage);
    enhancedError.stack = result.error.stack;
    throw enhancedError;
  }

  // Verify binary was generated
  if (!binary) {
    // Include any stderr output that might explain why
    const errorMessage = stderrLines.length > 0
      ? `No WASM binary was generated\n\nASC Compiler output:\n${stderrLines.join('')}`
      : 'No WASM binary was generated';

    throw new Error(errorMessage);
  }

  const cleanBinary: Uint8Array = binary!;
  const wasmSourceMap: string | undefined = sourceMap;

  debug('[ASC Compiler] Compilation successful, clean binary size:', cleanBinary.length, 'bytes');
  if (wasmSourceMap) {
    debug('[ASC Compiler] Source map generated, size:', wasmSourceMap.length, 'bytes');
  }

  // Instrument binary for coverage if requested
  let instrumentedBinary: Uint8Array | undefined;
  let debugInfo: DebugInfo | undefined;

  if (options.coverage) {
    const instrumentStart = performance.now();
    const instrumentResult = instrumentBinaryForCoverage(cleanBinary, filename);
    const instrumentEnd = performance.now();
    debugTiming(`[TIMING] ${basename(filename)} - instrumentation: ${instrumentEnd - instrumentStart}ms`);

    instrumentedBinary = instrumentResult.binary;
    debugInfo = instrumentResult.debugInfo;
    debug('[ASC Compiler] Instrumented binary size:', instrumentedBinary.length, 'bytes');
  }

  return {
    clean: cleanBinary,
    instrumented: instrumentedBinary,
    sourceMap: wasmSourceMap,
    debugInfo,
  };
}
