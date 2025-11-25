/**
 * Helper to compile AssemblyScript fixtures on demand
 *
 * Compiles AS files in-memory and returns binary + source map as Buffers
 * (based on vitest-pool-assemblyscript's compiler.ts)
 */

import asc from 'assemblyscript/asc';
import { resolve, basename, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

export interface CompileOptions {
  /** Enable debug info (default: true) */
  debug?: boolean;
  /** Optimization level: 0-3, s, z (default: 0) */
  optimize?: string | number;
  /** Enable source map (default: true) */
  sourceMap?: boolean;
  /** Write files to disk (for debugging, default: false) */
  writeFiles?: boolean;
  /** Output directory for written files (default: test/fixtures) */
  outDir?: string;
  /** Additional compiler options */
  extra?: string[];
}

export interface CompileResult {
  /** Compiled WASM binary */
  binary: Buffer;
  /** Source map JSON string (if sourceMap option enabled) */
  sourceMap?: Buffer;
  /** stdout from compiler */
  stdout: string;
  /** stderr from compiler */
  stderr: string;
  /** Whether compilation succeeded */
  success: boolean;
  /** Paths to written files (if writeFiles enabled) */
  writtenFiles?: {
    wasm?: string;
    sourceMap?: string;
  };
}

/**
 * Compile an AssemblyScript file to WASM in-memory
 *
 * @param entryPath - Path to the AS entry file
 * @param options - Compilation options
 * @returns Compilation result with binary and source map
 */
export async function compileFixture(
  entryPath: string,
  options: CompileOptions = { writeFiles: false }
): Promise<CompileResult> {
  const {
    debug = true,
    optimize = 0,
    sourceMap = true,
    writeFiles = false,
    outDir = resolve(dirname(entryPath), '../fixtures'),
    extra = [],
  } = options;

  const absolutePath = resolve(entryPath);
  const outputName = basename(entryPath, '.ts');

  // Build compiler arguments
  const args: string[] = [
    absolutePath,
    '--outFile', `${outputName}.wasm`,
    '--optimizeLevel', String(optimize),
  ];

  if (debug) {
    args.push('--debug');
  }

  if (sourceMap) {
    args.push('--sourceMap');
  }

  // Add any extra options
  args.push(...extra);

  // Capture output
  let binary: Uint8Array | undefined;
  let sourceMapText: string | undefined;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  // Create stdout/stderr handlers with write method (following pool pattern)
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

  // Run compiler (following pool's writeFile signature)
  const result = await asc.main(args, {
    stdout,
    stderr,
    writeFile: (name: string, contents: string | Uint8Array, _baseDir: string) => {
      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        sourceMapText = contents;
      }
    },
  });

  const success = result.error === null && binary !== undefined;

  // Optionally write files to disk for debugging
  const writtenFiles: { wasm?: string; sourceMap?: string } = {};
  if (writeFiles && binary) {
    try {
      mkdirSync(outDir, { recursive: true });

      const wasmPath = resolve(outDir, `${outputName}.wasm`);
      writeFileSync(wasmPath, binary);
      writtenFiles.wasm = wasmPath;

      if (sourceMapText) {
        const mapPath = resolve(outDir, `${outputName}.wasm.map`);
        writeFileSync(mapPath, sourceMapText, 'utf-8');
        writtenFiles.sourceMap = mapPath;
      }
    } catch (err) {
      stderrLines.push(`Warning: Failed to write files: ${err}`);
    }
  }

  return {
    binary: binary ? Buffer.from(binary) : Buffer.alloc(0),
    sourceMap: sourceMapText ? Buffer.from(sourceMapText, 'utf-8') : undefined,
    stdout: stdoutLines.join(''),
    stderr: stderrLines.join(''),
    success,
    writtenFiles: writeFiles ? writtenFiles : undefined,
  };
}

/**
 * Compile with intentionally broken/invalid options for error testing
 */
export async function compileInvalidFixture(
  entryPath: string,
  corruptionType: 'truncate-wasm' | 'corrupt-sourcemap' | 'no-debug' | 'empty-wasm'
): Promise<CompileResult> {
  // First compile normally
  const result = await compileFixture(entryPath, {
    debug: corruptionType !== 'no-debug',
    sourceMap: corruptionType !== 'corrupt-sourcemap',
  });

  if (!result.success) {
    return result;
  }

  // Apply corruption
  switch (corruptionType) {
    case 'truncate-wasm':
      // Truncate WASM binary to make it invalid
      result.binary = result.binary.subarray(0, Math.floor(result.binary.length / 2));
      break;

    case 'corrupt-sourcemap':
      // Create invalid JSON for source map
      result.sourceMap = Buffer.from('{ invalid json }', 'utf-8');
      break;

    case 'no-debug':
      // Already compiled without debug flag
      break;

    case 'empty-wasm':
      // Replace with empty buffer
      result.binary = Buffer.alloc(0);
      break;
  }

  return result;
}
