/**
 * Reproduction script demonstrating source map bug
 *
 * This script proves that Binaryen modification breaks source map accuracy.
 * Expected: Error points to line 13 (where assertion fails)
 * Actual: Error points to wrong line due to Binaryen modification
 */

import asc from 'assemblyscript/dist/asc.js';
import { BinaryenTestExecutionInjector } from '../src/binaryen/test-execution.ts';
import { extractCallStack, createWebAssemblyCallSite } from '../src/utils/source-maps.ts';

const TEST_FILE = '~/code/vitest-pool-assemblyscript/tests/assembly/crash-isolation.as.test.ts';

async function compileWithBinaryen() {
  console.log('\n=== REPRODUCTION: Compiling with Binaryen modification ===\n');

  let binary = null;
  let sourceMap = null;

  // Compile AS
  const result = await asc.main([
    TEST_FILE,
    '--outFile', 'output.wasm',
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--importMemory',
    '--debug',
    '--sourceMap',
    '--exportStart', '_start',
  ], {
    stdout: { write: () => true },
    stderr: { write: () => true },
    writeFile: (name, contents, _baseDir) => {
      if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
        binary = contents;
      } else if (name.endsWith('.wasm.map') && typeof contents === 'string') {
        sourceMap = contents;
      }
    },
  });

  if (result.error || !binary || !sourceMap) {
    throw new Error('Compilation failed');
  }

  console.log('✓ AS compilation successful');
  console.log(`  Binary size: ${binary.length} bytes`);
  console.log(`  Source map size: ${sourceMap.length} bytes`);

  // Apply Binaryen injection (THIS IS WHERE THE BUG OCCURS)
  const injector = new BinaryenTestExecutionInjector();
  const instrumentedBinary = injector.inject(binary);

  console.log(`\n✓ Binaryen injection complete`);
  console.log(`  Modified binary size: ${instrumentedBinary.length} bytes`);
  console.log(`  Source map NOT regenerated (using original AS source map)`);

  return { binary: instrumentedBinary, sourceMap };
}

async function executeAndCaptureError(binary, sourceMap) {
  console.log('\n=== Executing test that fails on line 13 ===\n');

  const sourceMapJson = JSON.parse(sourceMap);
  const tests = [];

  // Create WASM instance
  const memory = new WebAssembly.Memory({ initial: 1 });
  const module = await WebAssembly.compile(binary);
  const instance = await WebAssembly.instantiate(module, {
    env: {
      memory,
      abort: (msgPtr, filePtr, line, column) => {
        throw new Error(`Abort at ${line}:${column}`);
      },
      __register_test: (namePtr, nameLen, fnIndex) => {
        // AS strings are UTF-16LE, length is in characters (multiply by 2 for bytes)
        const buffer = new Uint8Array(memory.buffer, namePtr, nameLen * 2);
        const name = new TextDecoder('utf-16le').decode(buffer);
        tests.push({ name, fnIndex });
        console.log(`  Registered test: "${name}" at function index ${fnIndex}`);
      },
      __assertion_pass: () => {},
      __assertion_fail: (msgPtr, msgLen) => {
        // AS strings are UTF-16LE, length is in characters (multiply by 2 for bytes)
        const buffer = new Uint8Array(memory.buffer, msgPtr, msgLen * 2);
        const message = new TextDecoder('utf-16le').decode(buffer);
        throw new Error(message);
      },
    }
  });

  // Initialize - this registers tests
  console.log('Calling _start() to register tests:');
  instance.exports._start();

  // Find the "second test crashes" test
  const targetTest = tests.find(t => t.name === 'second test crashes');
  if (!targetTest) {
    console.log('ERROR: Could not find "second test crashes" test!');
    console.log('Available tests:', tests.map(t => t.name));
    return;
  }

  console.log(`\nExecuting test "${targetTest.name}" at function index ${targetTest.fnIndex}...`);
  console.log('This test has assert(false, ...) on line 13\n');

  try {
    instance.exports.__execute_function(targetTest.fnIndex);
    console.log('ERROR: Test should have thrown but did not!');
  } catch (error) {
    console.log(`\n✓ Test threw as expected: ${error.message}`);

    // Extract and map stack trace
    const callStack = extractCallStack(error);
    console.log(`\nV8 call stack (${callStack.length} frames):`);

    for (let i = 0; i < callStack.length; i++) {
      const callSite = callStack[i];
      const fileName = callSite.getFileName();
      const watLine = callSite.getLineNumber();
      const watColumn = callSite.getColumnNumber();
      const funcName = callSite.getFunctionName() || 'unknown';

      console.log(`  [${i}] ${funcName} at ${fileName}:${watLine}:${watColumn}`);

      // Map WASM frames to source
      if (fileName && fileName.startsWith('wasm')) {
        const mapped = await createWebAssemblyCallSite(callSite, sourceMapJson);
        if (mapped && !mapped.fileName.startsWith('wasm')) {
          console.log(`      → Mapped to: ${mapped.fileName}:${mapped.lineNumber}:${mapped.columnNumber}`);

          // Check if this is the test function frame (not assertion internals)
          if (mapped.fileName.includes('crash-isolation') && mapped.lineNumber !== 13) {
            console.log(`\n${'='.repeat(70)}`);
            console.log('BUG DEMONSTRATION:');
            console.log(`${'='.repeat(70)}`);
            console.log(`Expected line: 13 (where assert(false, ...) is)`);
            console.log(`Actual line:   ${mapped.lineNumber} (WRONG! Off by ${mapped.lineNumber - 13} lines)`);
            console.log(`\nThis is because:`);
            console.log(`1. AS compiler generated source map for original WASM binary`);
            console.log(`2. Binaryen modified the WASM binary (added __execute_function)`);
            console.log(`3. Source map was NOT updated to reflect Binaryen changes`);
            console.log(`4. Line number mappings are now shifted by the injected code`);
            console.log(`${'='.repeat(70)}\n`);
          }
        }
      }
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  SOURCE MAP BUG REPRODUCTION                                       ║');
  console.log('║  Demonstrating that Binaryen modification breaks source maps       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const { binary, sourceMap } = await compileWithBinaryen();
  await executeAndCaptureError(binary, sourceMap);

  console.log('\n✓ Reproduction complete\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
