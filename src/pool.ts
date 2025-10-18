import type { ProcessPool, Vitest } from 'vitest/node';
import asc from 'assemblyscript/dist/asc.js';
import { readFile } from 'fs/promises';
import { basename } from 'path';

/**
 * AssemblyScript Pool for Vitest - Pool API POC
 *
 * This pool implements the ProcessPool interface to run AssemblyScript tests in WASM.
 *
 * Architecture:
 * - Vitest (Node.js) orchestrates test discovery and reporting
 * - Pool compiles AS → WASM and executes tests
 * - Results flow back to Vitest via vitest.state APIs
 */
export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  console.log('[AS Pool] Initializing AssemblyScript pool');

  return {
    name: 'vitest-pool-assemblyscript',

    /**
     * Discover tests without running them (for `vitest list`)
     * For POC, we'll implement this minimally
     */
    async collectTests(specs) {
      console.log('[AS Pool] collectTests called for', specs.length, 'specs');

      // For POC: just report that we found test files
      // In real implementation, we'd parse AS files to find describe/test blocks
      const files = specs.map(([project, file]) => {
        return {
          filepath: file,
          name: basename(file),
          type: 'suite' as const,
          id: file,
          mode: 'run' as const,
          tasks: [],
        };
      });

      // Report collected files to Vitest
      // Note: This API might need adjustment based on actual Vitest types
      console.log('[AS Pool] Collected', files.length, 'test files');
    },

    /**
     * Run tests in WASM runtime
     * This is the core method that executes tests
     */
    async runTests(specs, invalidates) {
      console.log('[AS Pool] runTests called for', specs.length, 'specs');
      console.log('[AS Pool] Invalidated files:', invalidates?.length ?? 0);

      // Process each test file
      for (const [project, testFile] of specs) {
        console.log('[AS Pool] Processing test file:', testFile);

        try {
          // 1. Compile AS → WASM
          const source = await readFile(testFile, 'utf-8');
          const { binary, error } = await compileAssemblyScript(source, testFile);

          if (error) {
            console.error('[AS Pool] Compilation failed:', error.message);
            // TODO: Report compilation error to Vitest
            // In real implementation: ctx.state.updateTasks([...])
            continue;
          }

          // 2. Execute WASM tests
          const results = await executeWasmTests(binary, testFile);

          console.log('[AS Pool] Test results:', {
            file: testFile,
            passed: results.passed,
            failed: results.failed,
          });

          // 3. Report results to Vitest
          // TODO: Use ctx.state.updateTasks() to report pass/fail
          // For POC, just logging

        } catch (error) {
          console.error('[AS Pool] Error processing', testFile, ':', error);
        }
      }

      console.log('[AS Pool] runTests completed');
    },

    /**
     * Cleanup when shutting down
     */
    async close() {
      console.log('[AS Pool] Closing pool');
    },
  };
}

/**
 * Compile AssemblyScript source to WASM binary
 * Reused from plugin.ts with minimal changes
 */
async function compileAssemblyScript(
  source: string,
  filename: string
): Promise<{ binary: Uint8Array | null; error: Error | null }> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | null = null;

  const entryFile = basename(filename);
  const outputFile = entryFile.replace(/\.ts$/, '.wasm');

  console.log('[AS Pool] Compiling:', entryFile);

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

  const result = await asc.main([
    entryFile,
    '--outFile', outputFile,
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--debug',
  ], {
    stdout,
    stderr,
    readFile: (readFilename: string) => {
      if (readFilename === entryFile) {
        return source;
      }
      return null;
    },
    writeFile: (name: string, contents: Uint8Array) => {
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    listFiles: () => [],
  });

  if (result.error) {
    return {
      binary: null,
      error: result.error,
    };
  }

  if (!binary) {
    return {
      binary: null,
      error: new Error('No WASM binary was generated'),
    };
  }

  console.log('[AS Pool] Compilation successful, binary size:', binary.length);

  return {
    binary,
    error: null,
  };
}

/**
 * Execute tests in WASM runtime and collect results
 */
async function executeWasmTests(
  binary: Uint8Array,
  filename: string
): Promise<{ passed: number; failed: number }> {
  console.log('[AS Pool] Executing WASM tests for:', filename);

  let passed = 0;
  let failed = 0;

  // Instantiate WASM
  const module = await WebAssembly.compile(binary);
  const instance = await WebAssembly.instantiate(module, {
    env: {
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        console.error(`[AS Pool] Abort at ${filePtr}:${line}:${column}`);
        failed++;
        throw new Error('AssemblyScript abort called');
      },
    },
  });

  // For POC: just call exported functions to verify they work
  const exports = instance.exports as any;

  // Test simple math functions if they exist
  if (typeof exports.add === 'function') {
    try {
      const result = exports.add(2, 3);
      if (result === 5) {
        passed++;
        console.log('[AS Pool] ✓ add(2, 3) = 5');
      } else {
        failed++;
        console.error('[AS Pool] ✗ add(2, 3) expected 5, got', result);
      }
    } catch (error) {
      failed++;
      console.error('[AS Pool] ✗ add() threw:', error);
    }
  }

  if (typeof exports.multiply === 'function') {
    try {
      const result = exports.multiply(4, 5);
      if (result === 20) {
        passed++;
        console.log('[AS Pool] ✓ multiply(4, 5) = 20');
      } else {
        failed++;
        console.error('[AS Pool] ✗ multiply(4, 5) expected 20, got', result);
      }
    } catch (error) {
      failed++;
      console.error('[AS Pool] ✗ multiply() threw:', error);
    }
  }

  return { passed, failed };
}
