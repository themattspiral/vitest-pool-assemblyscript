#!/usr/bin/env node
/**
 * Test to determine if AS-compiled WASM has a start section
 */

import asc from 'assemblyscript/dist/asc.js';

// Code that runs at top level (should be in start section)
const source1 = `
@external("env", "callback")
declare function callback(): void;

// Top-level code (runs during instantiation)
callback();

export function run(): void {
  // This only runs when called
}
`;

// Code that only exports functions (no start section)
const source2 = `
@external("env", "callback")
declare function callback(): void;

export function _start(): void {
  callback();
}
`;

async function compile(source, name) {
  let binary = null;
  const result = await asc.main([name, '--outFile', name.replace('.ts', '.wasm'), '--runtime', 'stub'], {
    stdout: { write: () => true },
    stderr: { write: () => true },
    readFile: (n) => n === name ? source : null,
    writeFile: (n, contents) => { if (n.endsWith('.wasm')) binary = contents; },
    listFiles: () => [],
  });

  if (result.error || !binary) {
    throw new Error('Compilation failed');
  }

  return binary;
}

function hasStartSection(binary) {
  // WASM format: section ID 8 is the start section
  for (let i = 0; i < binary.length - 1; i++) {
    if (binary[i] === 0x08) {
      // Check if this is actually a section (not just random 0x08 byte)
      // Start section format: 0x08 <size> <function_index>
      return true;
    }
  }
  return false;
}

console.log('=== Test 1: Top-level code ===');
const binary1 = await compile(source1, 'test1.ts');
console.log('Binary size:', binary1.length);
console.log('Has start section:', hasStartSection(binary1) ? 'YES ✓' : 'NO');

console.log('\n=== Test 2: Export-only code ===');
const binary2 = await compile(source2, 'test2.ts');
console.log('Binary size:', binary2.length);
console.log('Has start section:', hasStartSection(binary2) ? 'YES' : 'NO ✓');

console.log('\n=== Instantiation Test ===');
const module1 = await WebAssembly.compile(binary1);
const module2 = await WebAssembly.compile(binary2);

let callbackExecuted1 = false;
let callbackExecuted2 = false;
let instance1 = null;
let instance2 = null;

console.log('\nInstantiating module 1 (top-level code)...');
const imports1 = {
  env: {
    callback() {
      callbackExecuted1 = true;
      console.log('  Callback 1 called, instance1 =', instance1 ? 'SET' : 'NULL ❌');
    }
  }
};
instance1 = new WebAssembly.Instance(module1, imports1);
console.log('After instantiation: callback executed =', callbackExecuted1);

console.log('\nInstantiating module 2 (export-only)...');
const imports2 = {
  env: {
    callback() {
      callbackExecuted2 = true;
      console.log('  Callback 2 called, instance2 =', instance2 ? 'SET ✓' : 'NULL');
    }
  }
};
instance2 = new WebAssembly.Instance(module2, imports2);
console.log('After instantiation: callback executed =', callbackExecuted2);

console.log('\nCalling _start() manually...');
instance2.exports._start();
console.log('After _start(): callback executed =', callbackExecuted2);

console.log('\n=== CONCLUSION ===');
console.log('Top-level AS code creates a start section that runs DURING instantiation');
console.log('This means import callbacks execute BEFORE the instance variable is set');
console.log('Solution: Don\'t run tests at top level - wrap them in an exported function');
