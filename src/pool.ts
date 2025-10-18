import type { ProcessPool, Vitest } from 'vitest/node';
import { createFileTask } from '@vitest/runner/utils';
import type { RunnerTestCase, RunnerTestFile } from 'vitest';
import asc from 'assemblyscript/dist/asc.js';
import { readFile } from 'fs/promises';
import { basename } from 'path';

/**
 * AssemblyScript Pool for Vitest
 *
 * Execution-based Discovery with Caching:
 * 1. collectTests(): Compile → Execute to discover test names → Cache binary
 * 2. runTests(): Reuse cached binary → Execute with full reporting
 * 3. Invalidation: Clear cache for changed files
 *
 * This approach:
 * ✅ Supports ALL dynamic tests (loops, conditionals, template literals)
 * ✅ Fast vitest list (shows complete structure)
 * ✅ No double compilation (cached between collect → run)
 * ✅ Accurate (execution-based matches runtime behavior)
 */

// Cache compiled WASM binaries between collectTests() and runTests()
const compiledBinaryCache = new Map<string, Uint8Array>();

export default function createAssemblyScriptPool(ctx: Vitest): ProcessPool {
  console.log('[AS Pool] Initializing AssemblyScript pool');

  return {
    name: 'vitest-pool-assemblyscript',

    /**
     * Discover tests by compiling and executing WASM
     * Called for `vitest list` and before `runTests`
     */
    async collectTests(specs) {
      console.log('[AS Pool] collectTests called for', specs.length, 'specs');

      for (const [project, testFile] of specs) {
        console.log('[AS Pool] Collecting tests from:', testFile);

        try {
          // 1. Read source
          const source = await readFile(testFile, 'utf-8');

          // 2. Compile AS → WASM
          const { binary, error } = await compileAssemblyScript(source, testFile);

          if (error) {
            console.error('[AS Pool] Compilation failed:', error.message);
            // TODO: Report compilation error to Vitest
            continue;
          }

          // 3. Cache binary for runTests
          compiledBinaryCache.set(testFile, binary);
          console.log('[AS Pool] Cached binary for:', testFile);

          // 4. Execute WASM to discover test names
          const discoveredTests = await discoverTests(binary, testFile);
          console.log('[AS Pool] Discovered', discoveredTests.length, 'tests:', discoveredTests);

          // 5. Create file task structure
          const fileTask = createFileTask(
            testFile,
            project.config.root,
            project.getName(),
            'assemblyscript'
          );

          fileTask.mode = 'run';

          // 6. Add test tasks
          for (const testName of discoveredTests) {
            const testTask: RunnerTestCase = {
              type: 'test',
              name: testName,
              id: `${fileTask.id}_${testName}`,
              context: {} as any,
              suite: fileTask,
              mode: 'run',
              meta: {},
              annotations: [],
              timeout: 0,
              file: fileTask,
            };
            fileTask.tasks.push(testTask);
          }

          // 7. Report to Vitest
          ctx.state.collectFiles(project, [fileTask]);
          await ctx.report('onCollected', [fileTask]);
          console.log('[AS Pool] Reported file task for:', testFile);

        } catch (error) {
          console.error('[AS Pool] Error collecting tests from', testFile, ':', error);
        }
      }

      console.log('[AS Pool] collectTests completed');
    },

    /**
     * Run tests using cached binaries
     * Executes with full imports for real-time reporting
     */
    async runTests(specs, invalidates) {
      console.log('[AS Pool] runTests called for', specs.length, 'specs');
      console.log('[AS Pool] Invalidated files:', invalidates?.length ?? 0);

      // Clear cache for invalidated files
      if (invalidates) {
        for (const file of invalidates) {
          if (compiledBinaryCache.has(file)) {
            compiledBinaryCache.delete(file);
            console.log('[AS Pool] Cleared cache for:', file);
          }
        }
      }

      // Process each test file
      for (const [project, testFile] of specs) {
        console.log('[AS Pool] Running tests in:', testFile);

        try {
          // 1. Get cached binary or compile
          let binary = compiledBinaryCache.get(testFile);

          if (!binary) {
            console.log('[AS Pool] Binary not cached, compiling:', testFile);
            const source = await readFile(testFile, 'utf-8');
            const result = await compileAssemblyScript(source, testFile);

            if (result.error) {
              console.error('[AS Pool] Compilation failed:', result.error.message);
              continue;
            }

            binary = result.binary;
            compiledBinaryCache.set(testFile, binary);
          } else {
            console.log('[AS Pool] Using cached binary for:', testFile);
          }

          // 2. Execute tests with full reporting
          const results = await executeTests(binary, testFile);

          console.log('[AS Pool] Test execution results:', {
            file: testFile,
            tests: results.tests.length,
            passed: results.tests.filter(t => t.passed).length,
            failed: results.tests.filter(t => !t.passed).length,
          });

          // 3. Create file task with results
          const fileTask = createFileTask(
            testFile,
            project.config.root,
            project.getName(),
            'assemblyscript'
          );

          fileTask.mode = 'run';
          fileTask.result = {
            state: results.tests.every(t => t.passed) ? 'pass' : 'fail',
          };

          // 4. Add test results
          for (const testResult of results.tests) {
            const testTask: RunnerTestCase = {
              type: 'test',
              name: testResult.name,
              id: `${fileTask.id}_${testResult.name}`,
              context: {} as any,
              suite: fileTask,
              mode: 'run',
              meta: {},
              annotations: [],
              timeout: 0,
              file: fileTask,
              result: {
                state: testResult.passed ? 'pass' : 'fail',
                errors: testResult.error ? [testResult.error] : undefined,
              },
            };
            fileTask.tasks.push(testTask);
          }

          // 5. Report to Vitest
          ctx.state.collectFiles(project, [fileTask]);

          // Report individual task updates
          const taskPacks = fileTask.tasks.map(task => [
            task.id,
            { state: task.result?.state, errors: task.result?.errors }
          ]) as [string, Partial<{ state: string, errors: any[] }>][];
          await ctx.report('onTaskUpdate', taskPacks);

          console.log('[AS Pool] Reported test results for:', testFile);

        } catch (error) {
          console.error('[AS Pool] Error running tests in', testFile, ':', error);
        }
      }

      console.log('[AS Pool] runTests completed');
    },

    /**
     * Cleanup when shutting down
     */
    async close() {
      console.log('[AS Pool] Closing pool, clearing cache');
      compiledBinaryCache.clear();
    },
  };
}

/**
 * Compile AssemblyScript source to WASM binary
 */
async function compileAssemblyScript(
  source: string,
  filename: string
): Promise<{ binary: Uint8Array; error: null } | { binary: null; error: Error }> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let binary: Uint8Array | null = null;

  // Use full path as entry file so AS can resolve relative imports
  const entryFile = filename;
  const outputFile = basename(filename).replace(/\.ts$/, '.wasm');

  console.log('[AS Pool] Compiling:', basename(filename));

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
    '--importMemory',  // Import memory from JS instead of exporting from WASM
    '--debug',
    '--transform', './src/transforms/top-level-wrapper.mjs',  // Wrap top-level test calls
  ], {
    stdout,
    stderr,
    // Let AS read from filesystem so it can resolve imports
    // WASM binary is still captured in memory via writeFile callback
    writeFile: (name: string, contents: Uint8Array) => {
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
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
 * Discover tests by executing WASM in "discovery mode"
 * Collects test names without executing test bodies
 */
async function discoverTests(
  binary: Uint8Array,
  filename: string
): Promise<string[]> {
  const discoveredTests: string[] = [];

  // Compile module
  const module = await WebAssembly.compile(binary);

  // Create memory in JavaScript and pass it as import
  // This solves the chicken-and-egg problem: memory is accessible immediately,
  // even when imports are called during instantiation (start section)
  const memory = new WebAssembly.Memory({ initial: 1 });

  const importObject = {
    env: {
      memory: memory,  // Imported memory (matches --importMemory flag)

      // Test framework imports (discovery mode)
      __test_start(namePtr: number, nameLen: number) {
        // Access imported memory directly (available immediately)
        const bytes = new Uint8Array(memory.buffer).slice(namePtr, namePtr + nameLen * 2);
        const testName = new TextDecoder('utf-16le').decode(bytes);
        discoveredTests.push(testName);
        console.log('[AS Pool] Discovered test:', testName);
        // Don't execute test body - just collect name
      },
      __test_pass() {
        // No-op during discovery
      },
      __test_fail(msgPtr: number, msgLen: number) {
        // No-op during discovery
      },
      __assertion_pass() {
        // No-op during discovery
      },
      __assertion_fail(msgPtr: number, msgLen: number) {
        // No-op during discovery
      },

      // AS runtime imports
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        console.error(`[AS Pool] Abort during discovery at ${filePtr}:${line}:${column}`);
        throw new Error('AssemblyScript abort during test discovery');
      },
    },
  };

  // Instantiate with imported memory
  const instance = new WebAssembly.Instance(module, importObject);

  // Call exported __run_tests() function instead of relying on start section
  // (avoids AS compiler bugs with top-level code initialization)
  const exports = instance.exports as any;
  if (typeof exports.__run_tests === 'function') {
    exports.__run_tests();
  } else if (typeof exports._start === 'function') {
    // Fallback to _start for compatibility
    exports._start();
  }

  return discoveredTests;
}

/**
 * Execute tests with full reporting
 * Collects test results, assertion counts, and errors
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: Error;
  assertionsPassed: number;
  assertionsFailed: number;
}

interface ExecutionResults {
  tests: TestResult[];
}

async function executeTests(
  binary: Uint8Array,
  filename: string
): Promise<ExecutionResults> {
  const tests: TestResult[] = [];
  let currentTest: TestResult | null = null;

  // Compile module
  const module = await WebAssembly.compile(binary);

  // Create memory in JavaScript and pass it as import
  // This solves the chicken-and-egg problem: memory is accessible immediately,
  // even when imports are called during instantiation (start section)
  const memory = new WebAssembly.Memory({ initial: 1 });

  const importObject = {
    env: {
      memory: memory,  // Imported memory (matches --importMemory flag)

      // Test framework imports (full reporting mode)
      __test_start(namePtr: number, nameLen: number) {
        // Access imported memory directly (available immediately)
        const bytes = new Uint8Array(memory.buffer).slice(namePtr, namePtr + nameLen * 2);
        const testName = new TextDecoder('utf-16le').decode(bytes);
        console.log('[AS Pool] Test started:', testName);

        currentTest = {
          name: testName,
          passed: true, // Assume passed unless __test_fail is called
          assertionsPassed: 0,
          assertionsFailed: 0,
        };
      },

      __test_pass() {
        if (currentTest) {
          currentTest.passed = true;
          tests.push(currentTest);
          console.log('[AS Pool] Test passed:', currentTest.name);
          currentTest = null;
        }
      },

      __test_fail(msgPtr: number, msgLen: number) {
        if (currentTest) {
          const bytes = new Uint8Array(memory.buffer).slice(msgPtr, msgPtr + msgLen * 2);
          const errorMsg = new TextDecoder('utf-16le').decode(bytes);
          currentTest.passed = false;
          currentTest.error = new Error(errorMsg);
          tests.push(currentTest);
          console.log('[AS Pool] Test failed:', currentTest.name, errorMsg);
          currentTest = null;
        }
      },

      __assertion_pass() {
        if (currentTest) {
          currentTest.assertionsPassed++;
        }
      },

      __assertion_fail(msgPtr: number, msgLen: number) {
        if (currentTest) {
          currentTest.assertionsFailed++;
          const bytes = new Uint8Array(memory.buffer).slice(msgPtr, msgPtr + msgLen * 2);
          const errorMsg = new TextDecoder('utf-16le').decode(bytes);
          console.log('[AS Pool] Assertion failed:', errorMsg);
        }
      },

      // AS runtime imports
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        console.error(`[AS Pool] Abort at ${filePtr}:${line}:${column}`);
        if (currentTest) {
          currentTest.passed = false;
          currentTest.error = new Error(`AssemblyScript abort at ${filePtr}:${line}:${column}`);
          tests.push(currentTest);
          currentTest = null;
        }
        throw new Error('AssemblyScript abort called');
      },
    },
  };

  // Instantiate with imported memory
  const instance = new WebAssembly.Instance(module, importObject);

  // Execute tests - call exported __run_tests() function
  // (avoids AS compiler bugs with top-level code initialization)
  const exports = instance.exports as any;
  if (typeof exports.__run_tests === 'function') {
    try {
      exports.__run_tests();
    } catch (error) {
      console.error('[AS Pool] Error during test execution:', error);
      // Error already captured in currentTest
    }
  } else if (typeof exports._start === 'function') {
    // Fallback to _start for compatibility
    try {
      exports._start();
    } catch (error) {
      console.error('[AS Pool] Error during test execution:', error);
      // Error already captured in currentTest
    }
  }

  return { tests };
}

