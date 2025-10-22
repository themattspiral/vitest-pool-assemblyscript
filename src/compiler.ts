/**
 * AssemblyScript Compiler
 *
 * Handles compilation of AssemblyScript source code to WASM binaries.
 * Manages compiler options, transforms, and in-memory compilation.
 */

import asc from 'assemblyscript/dist/asc.js';
import { basename } from 'path';

import type { CompileResult, CompilerOptions, DebugInfo } from './types.js';
import { debug } from './utils/debug.mjs';
import { BinaryenCoverageInstrumenter } from './coverage/instrumentation.js';

/**
 * Instrument WASM binaries for coverage collection
 *
 * Handles three coverage modes:
 * - false: No coverage - returns clean binary only
 * - true: Single instrumented binary - fast but breaks error locations
 * - 'dual': Both clean and instrumented binaries - accurate errors + coverage (slower)
 *
 * @param wasmBinary - Clean WASM binary from AS compiler
 * @param filename - Source filename (for debug info)
 * @param coverageMode - Coverage mode configuration
 * @returns Object with binary, optional coverageBinary, and optional debugInfo
 */
function instrumentBinariesForCoverage(
  wasmBinary: Uint8Array,
  filename: string,
  coverageMode: boolean | 'dual'
): {
  binary: Uint8Array;
  coverageBinary?: Uint8Array;
  debugInfo: DebugInfo | null;
} {
  if (coverageMode === 'dual') {
    // Dual mode: Keep clean binary for execution, create instrumented binary for coverage
    debug('[Compiler] Dual coverage mode - compiling both clean and instrumented binaries');

    const coverageInstrumenter = new BinaryenCoverageInstrumenter();
    const result = coverageInstrumenter.instrument(wasmBinary, filename);

    debug('[Compiler] Dual mode complete - clean binary:', wasmBinary.length, 'bytes, coverage binary:', result.binary.length, 'bytes');

    return {
      binary: wasmBinary, // Clean binary for test execution
      coverageBinary: result.binary, // Instrumented binary for coverage collection
      debugInfo: result.debugInfo,
    };
  } else if (coverageMode === true) {
    // Single instrumented binary mode: Fast but error locations inaccurate when tests fail
    debug('[Compiler] Single-binary coverage mode - instrumented binary only');
    const coverageInstrumenter = new BinaryenCoverageInstrumenter();
    const result = coverageInstrumenter.instrument(wasmBinary, filename);

    debug('[Compiler] Coverage instrumentation complete');

    return {
      binary: result.binary,
      debugInfo: result.debugInfo,
    };
  } else {
    // No coverage mode: Clean binary only
    debug('[Compiler] No coverage mode - clean binary only');
    return {
      binary: wasmBinary,
      debugInfo: null,
    };
  }
}

/**
 * Compile AssemblyScript source code to WASM binary
 *
 * Features:
 * - In-memory compilation (binary captured via writeFile callback)
 * - Filesystem reading enabled (for import resolution)
 * - Uses stub runtime and imported memory pattern
 * - Exports _start function for explicit initialization control
 * - Configurable coverage modes (false, true, 'dual')
 * - Dual-mode produces both clean and instrumented binaries
 *
 * @param filename - Full path to the source file (used as entry point)
 * @param options - Compilation options (coverage mode, etc.)
 * @returns Compilation result with binary (and optional coverage binary) or error
 */
export async function compileAssemblyScript(
  filename: string,
  options: CompilerOptions = {}
): Promise<CompileResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | null = null;
  let sourceMap: string | null = null;

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

  // Add transform for coverage metadata extraction if coverage enabled (true or 'dual')
  const needsCoverage = options.coverage === true || options.coverage === 'dual';
  if (needsCoverage) {
    compilerFlags.push(
      '--transform', './src/transforms/extract-function-metadata.mjs'
    );
    debug('[ASC Compiler] Coverage enabled - adding metadata extraction transform');
  }

  // Add transform to strip @inline decorators if requested
  // This improves coverage accuracy by preventing functions from being inlined
  // Only applies when coverage is enabled.
  const needsInlineStripping = needsCoverage && options.stripInline === true;
  if (needsInlineStripping) {
    compilerFlags.push(
      '--transform', './src/transforms/strip-inline.mjs'
    );
    debug('[ASC Compiler] Stripping @inline decorators for coverage accuracy');
  }


  // Compile with AssemblyScript compiler
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

  // Check for compilation errors
  if (result.error) {
    // Include stderr output if available for better error messages
    const errorMessage = stderrLines.length > 0
      ? `${result.error.message}\n\nASC Compiler output:\n${stderrLines.join('')}`
      : result.error.message;

    const enhancedError = new Error(errorMessage);
    enhancedError.stack = result.error.stack;

    return {
      binary: null,
      sourceMap: null,
      debugInfo: null,
      error: enhancedError,
    };
  }

  // Verify binary was generated
  if (!binary) {
    // Include any stderr output that might explain why
    const errorMessage = stderrLines.length > 0
      ? `No WASM binary was generated\n\nASC Compiler output:\n${stderrLines.join('')}`
      : 'No WASM binary was generated';

    return {
      binary: null,
      sourceMap: null,
      debugInfo: null,
      error: new Error(errorMessage),
    };
  }

  // Extract to const to help TypeScript narrow the type
  const wasmBinary: Uint8Array = binary;
  const wasmSourceMap: string | null = sourceMap;

  debug('[ASC Compiler] Compilation successful, binary size:', wasmBinary.length, 'bytes');
  if (wasmSourceMap !== null) {
    debug('[ASC Compiler] Source map generated, size:', (wasmSourceMap as string).length, 'bytes');
  }

  // Instrument binaries for coverage based on mode
  const coverageResult = instrumentBinariesForCoverage(wasmBinary, filename, options.coverage ?? false);

  return {
    binary: coverageResult.binary,
    sourceMap: wasmSourceMap,
    debugInfo: coverageResult.debugInfo,
    coverageBinary: coverageResult.coverageBinary,
    error: null,
  };
}
