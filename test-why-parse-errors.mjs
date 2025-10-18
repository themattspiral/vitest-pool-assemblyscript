#!/usr/bin/env node

/**
 * Understand why we're getting parse errors
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}
`;

console.log('Test 1: Using compileString with string source\n');

let result1 = await asc.compileString(source, {
  optimizeLevel: 0,
  runtime: 'stub',
});

console.log('Error:', result1.error);
console.log('Has stderr:', !!result1.stderr);

// Convert stderr to string
if (result1.stderr && typeof result1.stderr.toString === 'function') {
  console.log('\nStderr output:');
  console.log(result1.stderr.toString());
}

if (result1.stdout && typeof result1.stdout.toString === 'function') {
  console.log('\nStdout output:');
  console.log(result1.stdout.toString());
}

console.log('\n\nTest 2: Check what happens with properly named file\n');

let result2 = await asc.compileString({
  'module.ts': source
}, {
  optimizeLevel: 0,
  runtime: 'stub',
});

console.log('Error:', result2.error);

if (result2.stderr && typeof result2.stderr.toString === 'function') {
  console.log('\nStderr output:');
  console.log(result2.stderr.toString());
}

if (result2.stdout && typeof result2.stdout.toString === 'function') {
  console.log('\nStdout output:');
  console.log(result2.stdout.toString());
}
