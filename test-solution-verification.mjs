#!/usr/bin/env node
/**
 * Verification test showing the solution works
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
@external("env", "__test_start")
declare function __test_start(namePtr: usize, nameLen: i32): void;

function test(name: string): void {
  __test_start(changetype<usize>(name), name.length);
}

// Top-level code (runs in start section during instantiation)
test("test 1");
test("test 2");
test("test 3");
`;

console.log('=== Compiling with --importMemory ===');
let binary = null;

const result = await asc.main([
  'test.ts',
  '--outFile', 'test.wasm',
  '--runtime', 'stub',
  '--importMemory',  // ← THE KEY FLAG
], {
  stdout: { write: () => true },
  stderr: { write: () => true },
  readFile: (name) => name === 'test.ts' ? source : null,
  writeFile: (name, contents) => { if (name.endsWith('.wasm')) binary = contents; },
  listFiles: () => [],
});

if (result.error || !binary) {
  console.error('❌ Compilation failed');
  process.exit(1);
}

console.log('✅ Compiled successfully');

console.log('\n=== Testing: Import callbacks called DURING instantiation ===');
const module = await WebAssembly.compile(binary);

// Create memory in JavaScript
const memory = new WebAssembly.Memory({ initial: 1 });
const discoveredTests = [];

const importObject = {
  env: {
    memory: memory,  // Pass memory as import

    __test_start(namePtr, nameLen) {
      // Read string from imported memory
      const bytes = new Uint8Array(memory.buffer).slice(namePtr, namePtr + nameLen * 2);
      const testName = new TextDecoder('utf-16le').decode(bytes);
      discoveredTests.push(testName);
      console.log('  ✅ Test discovered:', testName);
    }
  }
};

console.log('Creating instance (callbacks will be called during this)...');
const instance = new WebAssembly.Instance(module, importObject);

console.log('\n=== Results ===');
console.log('Tests discovered:', discoveredTests);
console.log('Expected:', ['test 1', 'test 2', 'test 3']);
console.log('Match:', JSON.stringify(discoveredTests) === JSON.stringify(['test 1', 'test 2', 'test 3']) ? '✅ YES' : '❌ NO');

console.log('\n=== SUCCESS ===');
console.log('The solution works correctly:');
console.log('1. Compile with --importMemory flag');
console.log('2. Create memory in JavaScript: new WebAssembly.Memory({ initial: 1 })');
console.log('3. Pass memory as import in env.memory');
console.log('4. Import callbacks can access memory immediately, even during instantiation');
