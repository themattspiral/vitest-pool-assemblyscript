/**
 * AssemblyScript Compiler
 *
 * Handles compilation of AssemblyScript source code to WASM binaries.
 * Manages compiler options, transforms, and in-memory compilation.
 */

import { main as ascMain } from 'assemblyscript/asc';
import { basename, resolve } from 'node:path';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';

import { AssemblyScriptCompilerResult, AssemblyScriptCompilerOptions } from '../types/types.js';
import { POOL_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { instrumentForCoverage } from '../native-instrumentation/addon-interface.js';
import { createPoolError, throwPoolErrorIfAborted } from '../util/pool-errors.js';

const DEBUG_WRITE_FILES = false;

// Path prefix the AS compiler uses when resolving bare `vitest-pool-assemblyscript/assembly` imports
// via node_modules. Used to detect self-imports and redirect to local assembly/ dir when running in-tree.
const POOL_ASSEMBLY_NODE_MODULES_PREFIX = 'node_modules/vitest-pool-assemblyscript/assembly/';

// path assumes that we're running from dist/
const STRIP_INLINE_TRANSFORM = resolve(import.meta.dirname, './compiler/transforms/strip-inline.mjs');

setImmediate(async () => {
  try {
    await access(STRIP_INLINE_TRANSFORM);
  } catch {
    throw createPoolError(
      `AS Compiler strip inline transform file not found at "${STRIP_INLINE_TRANSFORM}"`,
      POOL_ERROR_NAMES.CompilationError
    );
  }
});

/**
 * Compile AssemblyScript source code to WASM binary
 */
export async function compileAssemblyScript(
  filename: string,
  options: AssemblyScriptCompilerOptions,
  logModule: string,
  logLabel: string,
  signal?: AbortSignal
): Promise<AssemblyScriptCompilerResult> {
  throwPoolErrorIfAborted(signal);

  const compileStart = performance.now();
  const logPrefix = `[${logModule} ASC] ${logLabel}`;

  const { shouldInstrument, instrumentationOptions, extraFlags } = options;

  if (shouldInstrument && !instrumentationOptions) {
    throw createPoolError(
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

  debug(`${logPrefix} - Compiling: "${filename}"`);

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

    // overrideable, though not recommended
    '--optimizeLevel', '0',           // No optimization for easier debugging
    '--shrinkLevel', '0',             // No shrink
    '--runtime', 'stub',              // stub runtime (no GC)

    ...(extraFlags || []),

    // non-overrideable
    '--outFile', outputFile,
    '--importMemory',                 // Import memory from JS (enables imports during WASM start)
    '--debug',                        // Include debug info
    '--sourceMap',                    // Generate source maps for error reporting
    '--exportStart', '_start',        // Export start function for explicit initialization control
    '--exportTable'                   // Export function table for direct test execution
  ];

  // Add transform to strip @inline decorators if requested
  // This improves coverage accuracy by preventing functions from being inlined,
  // and enables correct source-mapped error reporting for errors originating
  // inside inlined functions.
  if (options.stripInline === true) {
    compilerFlags.push(
      '--transform', STRIP_INLINE_TRANSFORM
    );
    debug(`${logPrefix} - Added Transform - Stripping @inline decorators`);
  }

  // Compile with AssemblyScript compiler
  const ascStart = performance.now();
  const result = await ascMain(compilerFlags, {
    stdout,
    stderr,
    // Let AS read from filesystem for import resolution
    // WASM binary and source map are captured in memory via writeFile callback
    writeFile: (name: string, contents: string | Uint8Array, _baseDir: string) => {
      throwPoolErrorIfAborted(signal);

      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
        debug(`${logPrefix} - Captured binary in memory: "${name}"`);
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        debug(`${logPrefix} - Captured source map in memory: "${name}"`);
        sourceMap = contents;
      } else {
        debug(`${logPrefix} - WARNING - Captured Unexpected File: "${name}" at baseDir: "${_baseDir}"`);
      }
    },
    
    // Custom readFile enables in-tree resolution of bare pool assembly imports.
    // When a test file imports 'vitest-pool-assemblyscript/assembly', the AS compiler
    // resolves it to a node_modules path. This works when the package is installed,
    // but fails in-tree (the package isn't in its own node_modules). The fallback
    // redirects these to the local assembly/ directory when the normal path isn't found.
    readFile: async (filename, baseDir): Promise<string | null> => {
      const filePath = resolve(baseDir, filename);

      try {
        return await readFile(filePath, { encoding: 'utf-8' });
      } catch {
        // Fallback: when running in-tree, redirect pool assembly imports to local assembly/ dir
        if (filename.startsWith(POOL_ASSEMBLY_NODE_MODULES_PREFIX)) {
          const localSubpath = filename.substring(POOL_ASSEMBLY_NODE_MODULES_PREFIX.length);
          const localPath = resolve(baseDir, 'assembly', localSubpath);

          try {
            return await readFile(localPath, { encoding: 'utf-8' });
          } catch {
            return null;
          }
        }

        return null;
      }
    },
  });

  debug(`${logPrefix} - TIMING asc.main: ${(performance.now() - ascStart).toFixed(2)} ms`);

  if (result.error) {
    const errorMessage = stderrLines.length > 0
      ? `${result.error.message}\n\n${stderrLines.join('')}`
      : result.error.message;

    throw createPoolError(errorMessage, POOL_ERROR_NAMES.CompilationError, errorMessage);
  }

  if (!binary) {
    const errorMessage = stderrLines.length > 0
      ? `No WASM binary was generated\n\nAS Compiler output:\n${stderrLines.join('')}`
      : 'No WASM binary was generated';

    throw createPoolError(errorMessage, POOL_ERROR_NAMES.CompilationError);
  }

  if (!sourceMap) {
    throw createPoolError('Source map not captured from AssemblyScript Compiler', POOL_ERROR_NAMES.CompilationError);
  }

  const cleanBinary: Uint8Array = binary;
  const wasmSourceMap: string = sourceMap;

  debug(`${logPrefix} - Compilation successful, clean binary size: ${cleanBinary.length} bytes`);
  debug(`${logPrefix} - Source map generated, size: ${wasmSourceMap.length * 2} bytes`);
  
  if (DEBUG_WRITE_FILES) {
    // Write source map to project maps directory for debugging
    const dir = './debug';
    const sourceMapFileName = `${basename(filename, '.ts')}.as.ts.map`;
    const sourceMapPath = `${dir}/${sourceMapFileName}`;

    // Create directory if it doesn't exist
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // Directory already exists or creation failed, continue
    }

    // Format as well-formed JSON
    const formattedSourceMap = JSON.stringify(JSON.parse(wasmSourceMap), null, 2);

    writeFile(sourceMapPath, formattedSourceMap, { encoding: 'utf8' });
    debug(`${logPrefix} - Wrote source map to: "${sourceMapPath}"`);

    // Also write WASM binary for inspection
    const wasmPath = sourceMapPath.replace('.map', '.wasm');
    writeFile(wasmPath, cleanBinary);
    debug(`${logPrefix} - Wrote WASM binary to: "${wasmPath}"`);
  }

  // Instrument binary for coverage if requested
  if (options.shouldInstrument) {
    throwPoolErrorIfAborted(signal);

    const instrumentStart = performance.now();
    const wasmBuffer = Buffer.from(cleanBinary);
    const sourceMapBuffer = Buffer.from(wasmSourceMap);

    const instrumentResult = instrumentForCoverage(wasmBuffer, sourceMapBuffer, options.instrumentationOptions!, logModule, logLabel);
    const instCount = instrumentResult.debugInfo.instrumentedFunctionCount;

    const instrumentEnd = performance.now();
    debug(`${logPrefix} - TIMING Instrumented ${instCount} functions: ${(performance.now() - instrumentStart).toFixed(2)} ms`);

    return {
      binary: instrumentResult.instrumentedWasm,
      sourceMap: instrumentResult.sourceMap,
      debugInfo: instrumentResult.debugInfo,
      isInstrumented: true,
      compileTiming: instrumentEnd - compileStart,
    };
  }

  // No instrumentation requested
  return {
    binary: cleanBinary,
    sourceMap: wasmSourceMap,
    isInstrumented: false,
    compileTiming: performance.now() - compileStart,
  };
}
