#!/usr/bin/env node

/**
 * Test if binaryFile option causes issues
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}
`;

console.log('Test 1: compileString WITHOUT binaryFile option\n');

let result1 = await asc.compileString(source, {
  optimizeLevel: 0,
  runtime: 'stub',
});

console.log('Error:', result1.error);
console.log('Binary in result:', !!result1.binary);
console.log('Text in result:', !!result1.text);
console.log('Result keys:', Object.keys(result1));

console.log('\n\nTest 2: compileString WITH binaryFile option\n');

let result2 = await asc.compileString(source, {
  optimizeLevel: 0,
  runtime: 'stub',
  binaryFile: 'output.wasm',
});

console.log('Error:', result2.error);
console.log('Binary in result:', !!result2.binary);
console.log('Text in result:', !!result2.text);
console.log('Result keys:', Object.keys(result2));

if (result2.stderr && typeof result2.stderr.toString === 'function') {
  const stderrText = result2.stderr.toString();
  if (stderrText) {
    console.log('\nStderr output:');
    console.log(stderrText);
  }
}
