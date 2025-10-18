import { Plugin } from 'vitest/config';
import asc from 'assemblyscript/dist/asc.js';
import { readFile } from 'fs/promises';
import { basename } from 'path';

export interface AssemblyScriptPluginOptions {
  include?: string[];
  exclude?: string[];
}

/**
 * Minimal Vitest plugin for AssemblyScript - Phase 0 POC
 *
 * This plugin:
 * 1. Detects .as.test.ts files
 * 2. Compiles them to WASM using AssemblyScript compiler
 * 3. Generates a JS wrapper that executes the WASM
 * 4. Reports results back to Vitest
 */
export default function assemblyScriptPlugin(
  options: AssemblyScriptPluginOptions = {}
): Plugin {
  const include = options.include ?? ['**/*.as.test.ts'];
  const exclude = options.exclude ?? ['**/node_modules/**'];

  return {
    name: 'vitest-assemblyscript-poc',

    // Configure Vitest to recognize AS test files
    config() {
      return {
        test: {
          include,
          exclude,
        },
      };
    },

    // Transform AS test files into executable JS
    async transform(code, id) {
      // Only process .as.test.ts files
      if (!id.match(/\.as\.test\.ts$/)) {
        return null;
      }

      console.log(`[AS Plugin] Compiling: ${id}`);

      try {
        // Read source from disk to avoid Vitest's type stripping
        // The 'code' parameter has already been processed and types removed
        const originalSource = await readFile(id, 'utf-8');

        // Compile AS to WASM
        const { binary, stdout, stderr, error } = await compileAssemblyScript(originalSource, id);

        if (error) {
          // Print stdout to see the actual parse errors
          if (stdout.length > 0) {
            console.error('[AS Plugin] stdout:', stdout.join('\n'));
          }
          throw new Error(`AssemblyScript compilation failed: ${error}`);
        }

        if (stderr.length > 0) {
          console.error('[AS Plugin] Compilation errors:', stderr.toString());
          throw new Error(`AssemblyScript compilation failed: ${stderr.toString()}`);
        }

        if (!binary) {
          throw new Error('No WASM binary was generated');
        }

        // Generate JS wrapper that executes the WASM
        const jsWrapper = generateJSWrapper(binary, id);

        return {
          code: jsWrapper,
          map: null, // TODO: Source maps in later phase
        };
      } catch (error) {
        console.error('[AS Plugin] Transform error:', error);
        throw error;
      }
    },
  };
}

/**
 * Compile AssemblyScript source to WASM binary using pure in-memory approach
 *
 * The AS compiler supports in-memory compilation via the readFile/writeFile callbacks.
 * No temp files are needed - we provide the source via readFile and capture output via writeFile.
 */
async function compileAssemblyScript(
  source: string,
  filename: string
): Promise<any> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | null = null;

  // Use the original filename as the virtual entry point
  // The compiler will call readFile for this filename
  const entryFile = basename(filename);
  const outputFile = entryFile.replace(/\.ts$/, '.wasm');

  console.log('[AS Plugin] Compiling (in-memory):', entryFile);

  // Create stream-like objects for stdout/stderr
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

  // Compile using asc.main with virtual files
  // CRITICAL: asc.main() returns an object {error, stdout, stderr, stats}, NOT an exit code
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
      console.log('[AS Plugin] readFile called for:', readFilename);
      // Return source for our entry file
      if (readFilename === entryFile) {
        console.log('[AS Plugin] Returning source for:', readFilename);
        return source;
      }
      // Return null for other files (like asconfig.json, imports, etc.)
      return null;
    },
    writeFile: (name: string, contents: Uint8Array) => {
      console.log('[AS Plugin] writeFile called:', name, 'size:', contents.length);
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    listFiles: () => [],
  });

  console.log('[AS Plugin] Compilation result:', {
    hasError: !!result.error,
    hasStdout: stdoutLines.length > 0,
    hasStderr: stderrLines.length > 0,
    hasBinary: !!binary,
    binarySize: binary?.length,
  });

  // Check for compilation errors
  if (result.error) {
    if (stdoutLines.length > 0) {
      console.error('[AS Plugin] stdout:', stdoutLines.join(''));
    }
    if (stderrLines.length > 0) {
      console.error('[AS Plugin] stderr:', stderrLines.join(''));
    }
    return {
      binary: null,
      stdout: stdoutLines,
      stderr: stderrLines,
      error: result.error,
    };
  }

  if (!binary) {
    if (stdoutLines.length > 0) {
      console.error('[AS Plugin] stdout:', stdoutLines.join(''));
    }
    if (stderrLines.length > 0) {
      console.error('[AS Plugin] stderr:', stderrLines.join(''));
    }
    return {
      binary: null,
      stdout: stdoutLines,
      stderr: stderrLines,
      error: new Error('No WASM binary was generated'),
    };
  }

  return {
    binary,
    stdout: stdoutLines,
    stderr: stderrLines,
    error: null,
  };
}

/**
 * Generate JavaScript wrapper that instantiates and executes WASM
 */
function generateJSWrapper(binary: Uint8Array, filename: string): string {
  // Convert binary to base64 for embedding
  const binaryArray = Array.from(binary);

  return `
import { describe, test, expect } from 'vitest';

// Embedded WASM binary
const wasmBinary = new Uint8Array([${binaryArray.join(',')}]);

describe('AssemblyScript Test: ${filename}', () => {
  let wasmModule;
  let testResults = [];

  test('compile and instantiate WASM', async () => {
    // Instantiate WASM module
    const module = await WebAssembly.compile(wasmBinary);

    const instance = await WebAssembly.instantiate(module, {
      env: {
        abort(msgPtr, filePtr, line, column) {
          console.error(\`Abort at \${filePtr}:\${line}:\${column}\`);
          throw new Error('AssemblyScript abort called');
        },
        // Test framework imports
        __test_register(namePtr, nameLenPtr) {
          // In real implementation, extract test name from WASM memory
          testResults.push({ name: 'test', status: 'pending' });
        },
        __test_pass() {
          if (testResults.length > 0) {
            testResults[testResults.length - 1].status = 'passed';
          }
        },
        __test_fail(msgPtr, msgLen) {
          if (testResults.length > 0) {
            testResults[testResults.length - 1].status = 'failed';
          }
        },
      },
    });

    wasmModule = instance;
    expect(wasmModule).toBeDefined();
  });

  test('execute WASM tests', () => {
    // For POC: just verify we can call exported functions
    expect(wasmModule.exports).toBeDefined();

    // Call some exported functions to verify they work
    // In Phase 1, we'll have proper test discovery and execution
    const exports = wasmModule.exports;

    // Just verify functions exist and are callable
    if (typeof exports.add === 'function') {
      const result = exports.add(2, 3);
      expect(result).toBe(5);
    }

    if (typeof exports.multiply === 'function') {
      const result = exports.multiply(4, 5);
      expect(result).toBe(20);
    }

    if (typeof exports.subtract === 'function') {
      const result = exports.subtract(10, 3);
      expect(result).toBe(7);
    }

    if (typeof exports.divide === 'function') {
      const result = exports.divide(20, 4);
      expect(result).toBe(5);
    }
  });
});
`;
}
