/**
 * AssemblyScript Compiler
 *
 * Handles compilation of AssemblyScript source code to WASM binaries.
 * Manages compiler options, transforms, and in-memory compilation.
 */

import asc from 'assemblyscript/dist/asc.js';
import { basename } from 'path';
import type { CompileResult } from './types.js';
import { debug } from './utils/debug.mjs';

/**
 * Compile AssemblyScript source code to WASM binary
 *
 * Features:
 * - In-memory compilation (binary captured via writeFile callback)
 * - Filesystem reading enabled (for import resolution)
 * - Applies top-level-wrapper transform automatically
 * - Uses stub runtime and imported memory pattern
 *
 * @param source - AssemblyScript source code (unused, kept for potential future use)
 * @param filename - Full path to the source file (used as entry point)
 * @returns Compilation result with binary or error
 */
export async function compileAssemblyScript(
  source: string,
  filename: string
): Promise<CompileResult> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | null = null;

  // Use full path as entry file so AS compiler can resolve relative imports
  const entryFile = filename;
  const outputFile = basename(filename).replace(/\.ts$/, '.wasm');

  debug('[Compiler] Compiling:', basename(filename));

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

  // Compile with AssemblyScript compiler
  const result = await asc.main([
    entryFile,
    '--outFile', outputFile,
    '--optimizeLevel', '0',           // No optimization for easier debugging
    '--runtime', 'stub',              // Minimal runtime (no GC)
    '--importMemory',                 // Import memory from JS (enables imports during WASM start)
    '--debug',                        // Include debug info
    '--transform', './src/transforms/top-level-wrapper.mjs',  // Wrap tests + prevent tree-shaking
  ], {
    stdout,
    stderr,
    // Let AS read from filesystem for import resolution
    // WASM binary is captured in memory via writeFile callback
    writeFile: (name: string, contents: Uint8Array) => {
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
  });

  // Check for compilation errors
  if (result.error) {
    return {
      binary: null,
      error: result.error,
    };
  }

  // Verify binary was generated
  if (!binary) {
    return {
      binary: null,
      error: new Error('No WASM binary was generated'),
    };
  }

  debug('[Compiler] Compilation successful, binary size:', binary.length, 'bytes');

  return {
    binary,
    error: null,
  };
}
