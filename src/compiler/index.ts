/**
 * AssemblyScript Compiler
 *
 * Handles compilation of AssemblyScript source code to WASM binaries.
 * Manages compiler options, transforms, and in-memory compilation.
 */

import asc from 'assemblyscript/asc';
import { basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';

import { CompileResult, AssemblyScriptCompilerOptions, AssemblyScriptPoolError } from '../types.js';
import { POOL_ERROR_NAMES } from '../types.js';
import { debug } from '../util/debug.js';
import { instrumentForCoverage } from '../native-instrumentation/addon-interface.js';
import { throwPoolErrorIfAborted } from '../util/pool-errors.js';

const DEBUG_WRITE_FILES = false;

// Absolute paths to transform modules
// TODO - convert to passing via API options instead of raw file!!
const STRIP_INLINE_TRANSFORM = resolve(import.meta.dirname, 'compiler/transforms/strip-inline.js');

if (!existsSync(STRIP_INLINE_TRANSFORM)) {
  throw new AssemblyScriptPoolError(
    `ASC Compiler strip inline transform file not found at ${STRIP_INLINE_TRANSFORM}`,
    POOL_ERROR_NAMES.CompilationError
  );
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
  options: AssemblyScriptCompilerOptions,
  signal?: AbortSignal
): Promise<CompileResult> {
  throwPoolErrorIfAborted(signal);

  const compileStart = performance.now();

  if (options.shouldInstrument && !options.instrumentationOptions) {
    throw new AssemblyScriptPoolError(
      'Instrumentation options are required for coverage instrumentation',
      POOL_ERROR_NAMES.CompilationError
    );
  }

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | undefined;
  let sourceMap: string | undefined;

  // Use full path as entry file so AS compiler can resolve relative imports
  const entryFile = filename;
  // Use simple output name to avoid AS compiler prepending it to source map paths
  const outputFile = 'output.wasm';

  debug(`[ASC Compiler] Compiling: "${filename}"`);

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

  // Add transform to strip @inline decorators if requested
  // This improves coverage accuracy by preventing functions from being inlined,
  // and enables correct source-mapped error reporting for errors originating
  // inside inlined functions.
  if (options.stripInline === true) {
    compilerFlags.push(
      '--transform', STRIP_INLINE_TRANSFORM
    );
    debug('[ASC Compiler] Added Transform - Strip @inline decorators');
  }

  // Compile with AssemblyScript compiler
  const ascStart = performance.now();
  const result = await asc.main(compilerFlags, {
    stdout,
    stderr,
    // Let AS read from filesystem for import resolution
    // WASM binary and source map are captured in memory via writeFile callback
    writeFile: (name: string, contents: string | Uint8Array, _baseDir: string) => {
      throwPoolErrorIfAborted(signal);

      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
        debug(`[ASC Compiler] Captured binary in memory: "${name}"`);
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        debug(`[ASC Compiler] Captured source map in memory: "${name}"`);
        sourceMap = contents;
      } else {
        debug(`[ASC Compiler] writeFile - Captured UNEXPECTED FILE: "${name}" at baseDir: "${_baseDir}"`);
      }
    },
  });
  const ascEnd = performance.now();
  debug(`[TIMING] ${basename(filename)} - asc.main: ${(ascEnd - ascStart).toFixed(2)}ms`);

  if (result.error) {
    const errorMessage = stderrLines.length > 0
      ? `${result.error.message}\n\n${stderrLines.join('')}`
      : result.error.message;

    throw new AssemblyScriptPoolError(errorMessage, POOL_ERROR_NAMES.CompilationError, result.error.stack);
  }

  if (!binary) {
    const errorMessage = stderrLines.length > 0
      ? `No WASM binary was generated\n\nASC Compiler output:\n${stderrLines.join('')}`
      : 'No WASM binary was generated';

    throw new AssemblyScriptPoolError(errorMessage, POOL_ERROR_NAMES.CompilationError);
  }

  if (!sourceMap) {
    throw new AssemblyScriptPoolError('Source map not captured from AssemblyScript Compiler', POOL_ERROR_NAMES.CompilationError);
  }

  const cleanBinary: Uint8Array = binary;
  const wasmSourceMap: string = sourceMap;

  debug('[ASC Compiler] Compilation successful, clean binary size:', cleanBinary.length, 'bytes');
  debug('[ASC Compiler] Source map generated, size:', wasmSourceMap.length, 'bytes');
  
  if (DEBUG_WRITE_FILES) {
    // Write source map to project maps directory for debugging
    const mapsDir = './maps';
    const sourceMapFileName = `${basename(filename, '.ts')}.as.ts.map`;
    const sourceMapPath = `${mapsDir}/${sourceMapFileName}`;

    // Create maps directory if it doesn't exist
    try {
      await mkdir(mapsDir, { recursive: true });
    } catch {
      // Directory already exists or creation failed, continue
    }

    // Format as well-formed JSON
    const formattedSourceMap = JSON.stringify(JSON.parse(wasmSourceMap), null, 2);
    writeFile(sourceMapPath, formattedSourceMap, { encoding: 'utf8' });
    debug('[ASC Compiler] Wrote source map to:', sourceMapPath);

    // Also write WASM binary for inspection
    const wasmPath = sourceMapPath.replace('.map', '.wasm');
    writeFile(wasmPath, cleanBinary);
    debug('[ASC Compiler] Wrote WASM binary to:', wasmPath);
  }

  // Instrument binary for coverage if requested
  if (options.shouldInstrument) {
    throwPoolErrorIfAborted(signal);

    const instrumentStart = performance.now();
    const wasmBuffer = Buffer.from(cleanBinary);
    const sourceMapBuffer = Buffer.from(wasmSourceMap);

    const instrumentResult = instrumentForCoverage(wasmBuffer, sourceMapBuffer, options.instrumentationOptions!);
    const instCount = instrumentResult.debugInfo.instrumentedFunctionCount;

    const instrumentEnd = performance.now();
    debug(`[TIMING] ${basename(filename)} - instrumentation: ${(instrumentEnd - instrumentStart).toFixed(2)}ms`);
    debug(`[ASC Compiler] Instrumented ${instCount} functions`);
    debug('[ASC Compiler] Instrumented binary size:', instrumentResult.instrumentedWasm.length, 'bytes');

    return {
      binary: instrumentResult.instrumentedWasm,
      sourceMap: instrumentResult.sourceMap,
      debugInfo: instrumentResult.debugInfo,
      isInstrumented: true,
      compileTimings: {
        phaseStart: compileStart,
        phaseEnd: instrumentEnd
      }
    };
  }

  // No instrumentation requested
  return {
    binary: cleanBinary,
    sourceMap: wasmSourceMap,
    isInstrumented: false,
    compileTimings: {
      phaseStart: compileStart,
      phaseEnd: performance.now()
    }
  };
}
