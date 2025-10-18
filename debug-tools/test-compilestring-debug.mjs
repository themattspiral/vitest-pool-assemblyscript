#!/usr/bin/env node

/**
 * Debug why compileString() fails with parse errors
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}
`;

console.log('Testing asc.compileString()...\n');
console.log('Source:');
console.log(source);
console.log('\n');

const stdout = [];
const stderr = [];
let binary = null;

const result = await asc.compileString(source, {
  stdout: (text) => {
    stdout.push(text);
  },
  stderr: (text) => {
    stderr.push(text);
  },
  writeFile: (name, contents) => {
    console.log(`writeFile called: ${name}, size: ${contents.length}`);
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  optimizeLevel: 0,
  runtime: 'stub',
  binaryFile: 'output.wasm',
});

console.log('=== RESULT ===');
console.log('Keys:', Object.keys(result));
console.log('error:', result.error);

if (stdout.length > 0) {
  console.log('\nStdout:');
  console.log(stdout.join(''));
}

if (stderr.length > 0) {
  console.log('\nStderr:');
  console.log(stderr.join(''));
}

console.log('\nBinary generated:', !!binary);
console.log('Binary size:', binary?.length || 0);

// Also check if there's a 'binary' property on result
console.log('\nresult.binary exists:', !!result.binary);
console.log('result.text exists:', !!result.text);

// Now try with the source in an object
console.log('\n\n=== Testing with source as object ===\n');

const stdout2 = [];
const stderr2 = [];
let binary2 = null;

const result2 = await asc.compileString({
  'input.ts': source
}, {
  stdout: (text) => {
    stdout2.push(text);
  },
  stderr: (text) => {
    stderr2.push(text);
  },
  writeFile: (name, contents) => {
    console.log(`writeFile called: ${name}, size: ${contents.length}`);
    if (name.endsWith('.wasm')) {
      binary2 = contents;
    }
  },
  optimizeLevel: 0,
  runtime: 'stub',
  binaryFile: 'output.wasm',
});

console.log('Keys:', Object.keys(result2));
console.log('error:', result2.error);

if (stdout2.length > 0) {
  console.log('\nStdout:');
  console.log(stdout2.join(''));
}

if (stderr2.length > 0) {
  console.log('\nStderr:');
  console.log(stderr2.join(''));
}

console.log('\nBinary generated:', !!binary2);
console.log('Binary size:', binary2?.length || 0);
console.log('result2.binary exists:', !!result2.binary);
console.log('result2.text exists:', !!result2.text);
