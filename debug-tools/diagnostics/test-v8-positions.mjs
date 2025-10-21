#!/usr/bin/env node
/**
 * Test what positions V8 actually provides in stack traces
 *
 * This directly instantiates WASM and triggers an error to see
 * what V8 reports in Error.prepareStackTrace
 */

import asc from 'assemblyscript/dist/asc.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('=== COMPILING TEST FILE ===');

let binary = null;
let sourceMapStr = null;

const result = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',
  '--exportStart', '_start',
  '--textFile', 'output.wat',  // ADD: Generate WAT text file
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
      binary = contents;
    } else if (name.endsWith('.wasm.map')) {
      sourceMapStr = contents;
    } else if (name.endsWith('.wat')) {
      // Save WAT file for inspection
      writeFileSync('/tmp/debug.wat', contents);
      console.log('Saved WAT file to /tmp/debug.wat');

      // Check if WAT is single-line or multi-line
      const lines = contents.toString().split('\n');
      console.log(`WAT file has ${lines.length} lines`);
      console.log(`First line length: ${lines[0]?.length || 0} chars`);
      console.log(`Last line length: ${lines[lines.length - 1]?.length || 0} chars`);
    }
  },
});

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log('\n=== INSTANTIATING WASM ===');

// Create memory
const memory = new WebAssembly.Memory({ initial: 1 });

// Helper to decode string from WASM memory
function decodeString(ptr, len) {
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}

// Track which test we're running
let testsPassed = 0;
let testsFailed = 0;

// Create imports
const imports = {
  env: {
    memory,

    __register_test(namePtr, nameLen, fnIndex) {
      const name = decodeString(namePtr, nameLen);
      console.log(`Registered test: "${name}" at function index ${fnIndex}`);
    },

    __assertion_pass() {
      // No-op
    },

    __assertion_fail(msgPtr, msgLen) {
      const msg = decodeString(msgPtr, msgLen);
      console.log(`Assertion failed: ${msg}`);
    },

    abort(msgPtr, filePtr, line, column) {
      const msg = decodeString(msgPtr, 100);  // Approximate length

      console.log('\n=== ABORT TRIGGERED ===');
      console.log('Message:', msg);

      // Capture V8 stack trace
      const error = new Error(msg);

      let callStack = [];
      const original = Error.prepareStackTrace;
      Error.prepareStackTrace = (err, stack) => {
        callStack = stack;
        return '';
      };

      // Trigger stack capture
      error.stack;

      Error.prepareStackTrace = original;

      console.log('\n=== V8 CALL STACK ===');
      callStack.forEach((site, i) => {
        const fileName = site.getFileName();
        const line = site.getLineNumber();
        const col = site.getColumnNumber();
        const funcName = site.getFunctionName();

        console.log(`Frame ${i}:`);
        console.log(`  File: ${fileName}`);
        console.log(`  Line: ${line}`);
        console.log(`  Column: ${col}`);
        console.log(`  Function: ${funcName}`);

        if (fileName && fileName.startsWith('wasm')) {
          console.log(`  -> WASM frame at (${line}, ${col})`);
        }
      });

      throw new Error('abort');
    }
  }
};

// Compile and instantiate
const module = await WebAssembly.compile(binary);
const instance = new WebAssembly.Instance(module, imports);

console.log('\n=== RUNNING _start ===');
try {
  instance.exports._start();
} catch (e) {
  console.log('\nCaught error from _start (expected - tests trigger aborts)');
}

console.log('\n=== EXECUTING SPECIFIC TEST (second test at index 2) ===');
console.log('This test should fail on line 13 of the source file');
console.log('Source line 13: assert(false, "this assertion fails and causes abort");');

try {
  // Execute the second test which should abort
  instance.exports.__execute_function(2);
} catch (e) {
  console.log('\nCaught error (expected)');
}

console.log('\n=== DONE ===');
