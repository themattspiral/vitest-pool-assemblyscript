#!/usr/bin/env node

/**
 * Test to confirm what asc.main() actually returns
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}
`;

console.log('Testing what asc.main() returns...\n');

const stdout = [];
const stderr = [];
let binary = null;

const result = await asc.main([
  'test.ts',
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--debug',
], {
  stdout: {
    write: (text) => {
      stdout.push(text);
      return true;
    }
  },
  stderr: {
    write: (text) => {
      stderr.push(text);
      return true;
    }
  },
  readFile: (filename) => {
    if (filename === 'test.ts') {
      return source;
    }
    return null;
  },
  writeFile: (name, contents) => {
    console.log(`writeFile called: ${name}, size: ${contents.length}`);
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  listFiles: () => [],
});

console.log('\n=== RESULT ===');
console.log('Type:', typeof result);
console.log('Keys:', Object.keys(result));
console.log('error:', result.error);
console.log('Has stdout:', !!result.stdout);
console.log('Has stderr:', !!result.stderr);
console.log('Has stats:', !!result.stats);
console.log('\nBinary captured:', !!binary);
console.log('Binary size:', binary?.length || 0);

if (result.error) {
  console.log('\nERROR:', result.error);
  console.log('Stderr:', stderr.join(''));
}

console.log('\n=== CONCLUSION ===');
console.log('asc.main() returns an OBJECT, not an exit code!');
console.log('Check result.error to determine success/failure');
