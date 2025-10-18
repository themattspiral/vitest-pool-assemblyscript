#!/usr/bin/env node
/**
 * Simple test to understand when import callbacks can access instance.exports.memory
 */

import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Compile a simple AS test file
import asc from 'assemblyscript/dist/asc.js';

const source = `
// Simple AS code that calls an import during execution
@external("env", "__test_callback")
declare function __test_callback(value: i32): void;

export function _start(): void {
  __test_callback(42);
}
`;

console.log('=== Compiling AssemblyScript ===');
let binary = null;

const result = await asc.main(['test.ts', '--outFile', 'test.wasm', '--runtime', 'stub'], {
  stdout: { write: () => true },
  stderr: { write: (msg) => { console.error('  ', msg); return true; } },
  readFile: (name) => name === 'test.ts' ? source : null,
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  listFiles: () => [],
});

if (result.error || !binary) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log('✓ Compiled successfully, binary size:', binary.length);

// Now test the three approaches
console.log('\n=== APPROACH 1: Variable set BEFORE instantiation (Current code) ===');
{
  const module = await WebAssembly.compile(binary);
  let instance = null;  // This is NULL during instantiation!

  const imports = {
    env: {
      __test_callback(value) {
        console.log('Callback called with value:', value);
        console.log('  instance is:', instance ? 'SET' : 'NULL ❌');
        if (instance) {
          console.log('  memory accessible:', !!instance.exports.memory);
        }
      }
    }
  };

  console.log('Before instantiation: instance =', instance);
  instance = new WebAssembly.Instance(module, imports);
  console.log('After instantiation: instance =', instance ? 'SET ✓' : 'NULL');

  // Call _start() explicitly
  console.log('Calling _start() explicitly...');
  instance.exports._start();
}

console.log('\n=== APPROACH 2: Pass memory as import (AssemblyScript can use this) ===');
{
  const module = await WebAssembly.compile(binary);
  const memory = new WebAssembly.Memory({ initial: 1 });

  const imports = {
    env: {
      memory: memory,  // Pass memory TO the WASM module
      __test_callback(value) {
        console.log('Callback called with value:', value);
        console.log('  Can access imported memory:', memory.buffer.byteLength, 'bytes ✓');
      }
    }
  };

  const instance = new WebAssembly.Instance(module, imports);
  console.log('After instantiation: instance created ✓');

  // Call _start() explicitly
  console.log('Calling _start() explicitly...');
  instance.exports._start();
}

console.log('\n=== APPROACH 3: Closure capture with getter ===');
{
  const module = await WebAssembly.compile(binary);
  let instance = null;

  const getInstance = () => instance;  // Getter function

  const imports = {
    env: {
      __test_callback(value) {
        console.log('Callback called with value:', value);
        const inst = getInstance();
        console.log('  getInstance() returns:', inst ? 'SET' : 'NULL');
        if (inst && inst.exports.memory) {
          console.log('  memory accessible:', inst.exports.memory.buffer.byteLength, 'bytes', inst ? '✓' : '❌');
        }
      }
    }
  };

  instance = new WebAssembly.Instance(module, imports);
  console.log('After instantiation: instance =', instance ? 'SET ✓' : 'NULL');

  // Call _start() explicitly
  console.log('Calling _start() explicitly...');
  instance.exports._start();
}

console.log('\n=== Analysis ===');
console.log('The key insight: Import callbacks CAN access memory if:');
console.log('  1. Memory is imported from JS (APPROACH 2) ✓');
console.log('  2. Callbacks are called AFTER instantiation completes (APPROACH 1 & 3) ✓');
console.log('  3. The variable is set BEFORE instantiation but accessed via closure later ✓');
console.log('');
console.log('The problem: If _start() runs DURING instantiation (start section),');
console.log('              then instance is null when callbacks execute.');
