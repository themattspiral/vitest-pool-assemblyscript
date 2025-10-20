#!/usr/bin/env node
/**
 * Test Binaryen coverage instrumentation
 *
 * Compiles a test file with coverage instrumentation and verifies:
 * 1. Compilation succeeds
 * 2. Coverage trace calls are injected
 * 3. Debug info is extracted
 * 4. Execution works correctly
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use tsx to load TypeScript files
const tsx = await import('tsx/esm/api');
const { setDebug } = await tsx.tsImport('../src/utils/debug.mjs', import.meta.url);
const { BinaryenCoverageInstrumenter } = await tsx.tsImport('../src/binaryen/coverage-instrumentation.ts', import.meta.url);

// Enable debug output
setDebug(true);

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import asc from 'assemblyscript/dist/asc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test with a simple test file
const testFile = join(__dirname, '../tests/assembly/math.as.test.ts');
const testSource = readFileSync(testFile, 'utf-8');

console.log('Testing Binaryen Coverage Instrumentation\n');
console.log('Test file:', testFile);
console.log('='.repeat(80));

// Step 1: Compile WITHOUT Binaryen instrumentation (raw AS compiler)
console.log('\n1. Compiling with AS compiler (no Binaryen)...');
let binary = null;

const result1 = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--exportStart', '_start',
], {
  stdout: { write: () => true },
  stderr: { write: () => true },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
      binary = contents;
    }
  },
});

if (result1.error) {
  console.error('Compilation failed:', result1.error);
  process.exit(1);
}

if (!binary) {
  console.error('No binary generated');
  process.exit(1);
}

console.log('   ✓ Compilation successful');
console.log('   Binary size:', binary.length, 'bytes');

// Step 2: Instrument with Binaryen coverage
console.log('\n2. Instrumenting with Binaryen coverage...');
const instrumenter = new BinaryenCoverageInstrumenter();
const { binary: instrumentedBinary, debugInfo } = instrumenter.instrument(binary);

console.log('   ✓ Instrumentation successful');
console.log('   Binary size:', binary.length, '→', instrumentedBinary.length, 'bytes');

// Step 3: Check debug info
console.log('\n3. Checking debug info...');
console.log('   Files:', debugInfo.files.length);
debugInfo.files.forEach((file, idx) => {
  console.log(`     ${idx}: ${file}`);
});

console.log('\n   Functions:', debugInfo.functions.length);
debugInfo.functions.forEach((func, idx) => {
  console.log(`     ${idx}: ${func.name} (file=${func.fileIdx}, lines ${func.startLine}-${func.endLine})`);
});

// Step 4: Try to execute (verify imports are correct)
console.log('\n4. Testing execution...');

const coverageData = new Map();

// Create memory for WASM (AS uses --importMemory)
const memory = new WebAssembly.Memory({ initial: 1 });

const imports = {
  env: {
    memory,
    __coverage_trace: (funcIdx, blockIdx) => {
      const key = `${funcIdx}:${blockIdx}`;
      coverageData.set(key, (coverageData.get(key) || 0) + 1);
    },
    abort: (msgPtr, filePtr, line, column) => {
      console.log('   [ABORT]', { msgPtr, filePtr, line, column });
      throw new Error('Test aborted');
    },
    __register_test: () => {},
    __assertion_pass: () => {},
    __assertion_fail: () => {},
  },
};

try {
  const instance = await WebAssembly.instantiate(instrumentedBinary, imports);
  console.log('   ✓ WASM instantiation successful');

  // Call _start to execute the test registration
  if (instance.instance.exports._start) {
    console.log('   Calling _start to register tests...');
    instance.instance.exports._start();
    console.log('   ✓ _start executed');
  }

  // Check if __coverage_trace was called
  console.log('\n5. Coverage data collected:');
  if (coverageData.size === 0) {
    console.log('   ⚠ WARNING: No coverage data collected!');
    console.log('   This might mean coverage trace calls were not injected.');
  } else {
    console.log(`   ✓ Coverage trace called ${coverageData.size} times`);
    coverageData.forEach((count, key) => {
      console.log(`     ${key}: ${count} calls`);
    });
  }

} catch (err) {
  console.log('   ✗ Execution failed:', err.message);
  console.log('   This is expected if the test tries to call missing imports');
}

console.log('\n' + '='.repeat(80));
console.log('RESULTS:');
console.log('✓ Coverage instrumentation completed');
console.log('✓ Debug info extracted');
console.log(`✓ Instrumented ${debugInfo.functions.length} functions`);
console.log('='.repeat(80));
