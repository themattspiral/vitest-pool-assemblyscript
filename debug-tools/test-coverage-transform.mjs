/**
 * Test the coverage instrumentation transform
 *
 * This script:
 * 1. Compiles coverage.as.test.ts with the coverage transform
 * 2. Verifies the debug info is generated correctly
 * 3. Instantiates the WASM with __coverage_trace import
 * 4. Calls functions and collects traces
 * 5. Verifies traces map to correct source lines
 */

import asc from 'assemblyscript/dist/asc.js';
import { readFile } from 'fs/promises';
import { CoverageTransform } from './src/coverage-transform.ts';

// Collect coverage traces during execution
const traces = [];

async function main() {
  console.log('=== Testing Coverage Instrumentation Transform ===\n');

  // Step 1: Read the test file
  const testFile = 'tests/coverage.as.test.ts';
  const source = await readFile(testFile, 'utf-8');
  console.log('✓ Read test file:', testFile);

  // Step 2: Create the coverage transform
  const coverageTransform = new CoverageTransform();
  console.log('✓ Created coverage transform\n');

  // Step 3: Compile with the transform
  console.log('Compiling with coverage transform...');
  let binary = null;
  const stdout = {
    write: (text) => {
      console.log('[AS stdout]', text);
      return true;
    }
  };
  const stderr = {
    write: (text) => {
      console.error('[AS stderr]', text);
      return true;
    }
  };

  const result = await asc.main([
    testFile,
    '--outFile', 'output.wasm',
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--debug',
    '--exportRuntime',
  ], {
    stdout,
    stderr,
    transforms: [coverageTransform],
    readFile: (filename) => {
      console.log('[readFile]', filename);
      if (filename === testFile) {
        return source;
      }
      return null;
    },
    writeFile: (name, contents) => {
      console.log('[writeFile]', name, 'size:', contents.length);
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    listFiles: () => [],
  });

  if (result.error) {
    console.error('\n✗ Compilation failed:', result.error.message);
    process.exit(1);
  }

  if (!binary) {
    console.error('\n✗ No WASM binary generated');
    process.exit(1);
  }

  console.log('✓ Compilation successful, binary size:', binary.length, 'bytes\n');

  // Step 4: Get debug info from transform
  const debugInfo = coverageTransform.getDebugInfo();
  console.log('Debug Info:');
  console.log('  Files:', debugInfo.files);
  console.log('  Functions:', debugInfo.functions.map(f =>
    `${f.name} (idx=${debugInfo.functions.indexOf(f)}, lines ${f.startLine}-${f.endLine})`
  ).join('\n    '));
  console.log();

  // Step 5: Instantiate WASM with coverage trace import
  console.log('Instantiating WASM with trace import...');
  const module = await WebAssembly.compile(binary);
  const instance = await WebAssembly.instantiate(module, {
    env: {
      __coverage_trace: (funcIdx, blockIdx) => {
        traces.push([funcIdx, blockIdx]);
        const funcInfo = debugInfo.functions[funcIdx];
        console.log(`  [trace] funcIdx=${funcIdx} blockIdx=${blockIdx} -> ${funcInfo?.name || 'unknown'}`);
      },
      abort(msgPtr, filePtr, line, column) {
        console.error(`Abort at ${filePtr}:${line}:${column}`);
        throw new Error('AssemblyScript abort called');
      },
    },
  });
  console.log('✓ WASM instantiated\n');

  // Step 6: Call functions and collect traces
  console.log('Calling functions to collect traces:');
  const result1 = instance.exports.add(2, 3);
  console.log(`  add(2, 3) = ${result1}`);

  const result2 = instance.exports.multiply(4, 5);
  console.log(`  multiply(4, 5) = ${result2}`);

  const result3 = instance.exports.subtract(10, 3);
  console.log(`  subtract(10, 3) = ${result3}`);

  const result4 = instance.exports.divide(20, 4);
  console.log(`  divide(20, 4) = ${result4}`);
  console.log();

  // Step 7: Call runTests which calls all functions
  console.log('Calling runTests():');
  instance.exports.runTests();
  console.log();

  // Step 8: Verify traces
  console.log('=== Trace Summary ===');
  console.log(`Total traces collected: ${traces.length}`);
  console.log('\nTraces:');
  for (const [funcIdx, blockIdx] of traces) {
    const funcInfo = debugInfo.functions[funcIdx];
    if (funcInfo) {
      console.log(`  [${funcIdx}, ${blockIdx}] -> ${funcInfo.name} at ${debugInfo.files[funcInfo.fileIdx]}:${funcInfo.startLine}-${funcInfo.endLine}`);
    } else {
      console.log(`  [${funcIdx}, ${blockIdx}] -> UNKNOWN FUNCTION`);
    }
  }

  // Verify we got the expected traces
  const expectedTraces = [
    'add', 'multiply', 'subtract', 'divide', // Direct calls
    'runTests', 'add', 'multiply', 'subtract', 'divide' // runTests calls
  ];

  const actualFunctionNames = traces.map(([funcIdx]) => debugInfo.functions[funcIdx]?.name);

  console.log('\n=== Verification ===');
  console.log('Expected function calls:', expectedTraces);
  console.log('Actual function calls:', actualFunctionNames);

  if (JSON.stringify(expectedTraces) === JSON.stringify(actualFunctionNames)) {
    console.log('\n✓ All traces match expected! Coverage instrumentation works correctly.');
  } else {
    console.log('\n✗ Trace mismatch!');
    console.log('Expected:', expectedTraces);
    console.log('Actual:', actualFunctionNames);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
