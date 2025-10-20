#!/usr/bin/env node
/**
 * Test const-folding behavior directly with AS compiler
 * No transforms, no wrappers - just raw AS compilation
 */

import asc from 'assemblyscript/dist/asc.js';
import { writeFileSync } from 'fs';

// Create a minimal test that mimics const-fold-test.as.test.ts
const testCode = `
// Minimal reproduction - no test framework, just the assertion logic
export function testDirectExpression(): bool {
  // This is what the test does: assert(1 + 1 == 2, "direct expression")
  const condition: bool = 1 + 1 == 2;
  return condition;
}

export function testViaVariable(): bool {
  // This is what the second test does
  const result: i32 = 1 + 1;
  const condition: bool = result == 2;
  return condition;
}

// Test even simpler: just return the expression result
export function testDirect(): bool {
  return 1 + 1 == 2;
}
`;

console.log('Testing const-folding directly with AS compiler\n');
console.log('Test code:');
console.log(testCode);
console.log('\n' + '='.repeat(80));

// Write test file
writeFileSync('/tmp/const-fold-test.ts', testCode);

// Compile
let binary = null;
const result = await asc.main([
  '/tmp/const-fold-test.ts',
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--debug',
], {
  stdout: { write: (text) => { process.stdout.write(text); return true; } },
  stderr: { write: (text) => { process.stderr.write(text); return true; } },
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
      binary = contents;
    }
  },
});

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log('✓ Compilation successful\n');

// Instantiate and test
const instance = await WebAssembly.instantiate(binary, {
  env: {
    abort: (msg, file, line, col) => {
      console.log('ABORT called:', { msg, file, line, col });
    }
  }
});

console.log('Testing functions:');
console.log('------------------');

const result1 = instance.instance.exports.testDirectExpression();
console.log(`testDirectExpression(): ${result1} (expected: true)`);

const result2 = instance.instance.exports.testViaVariable();
console.log(`testViaVariable(): ${result2} (expected: true)`);

const result3 = instance.instance.exports.testDirect();
console.log(`testDirect(): ${result3} (expected: true)`);

console.log('\n' + '='.repeat(80));
if (result1 && result2 && result3) {
  console.log('✓ ALL TESTS PASS - No const-folding bug!');
  console.log('Conclusion: The bug was likely caused by our wrapper transform.');
} else {
  console.log('✗ CONST-FOLDING BUG CONFIRMED');
  console.log('Conclusion: This is a real AS compiler bug.');
  console.log(`Results: direct=${result1}, variable=${result2}, simple=${result3}`);
}
