#!/usr/bin/env node
/**
 * Test what debug information is available from Binaryen
 *
 * Investigates whether WASM debug info (DWARF) can be extracted
 * from binaries compiled with AS compiler's --debug flag.
 */

import binaryen from 'binaryen';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import asc from 'assemblyscript/dist/asc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Testing Binaryen Debug Info Extraction\n');
console.log('='.repeat(80));

// Compile a simple test file with debug info
const testFile = join(__dirname, '../tests/assembly/math.as.test.ts');

console.log('1. Compiling test file with --debug flag...');
let binary = null;

const result = await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',  // IMPORTANT: This embeds debug info
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

if (result.error || !binary) {
  console.error('Compilation failed');
  process.exit(1);
}

console.log('   ✓ Compilation successful\n');

// Load with Binaryen
console.log('2. Loading WASM binary with Binaryen...');
const module = binaryen.readBinary(binary);
console.log('   ✓ Binary loaded\n');

// Inspect available APIs on module
console.log('3. Inspecting Binaryen Module APIs:');
const moduleProps = Object.getOwnPropertyNames(Object.getPrototypeOf(module))
  .filter(n => !n.startsWith('_') && typeof module[n] === 'function')
  .sort();

console.log('   Available methods:', moduleProps.length);
const debugRelated = moduleProps.filter(n =>
  n.toLowerCase().includes('debug') ||
  n.toLowerCase().includes('source') ||
  n.toLowerCase().includes('line') ||
  n.toLowerCase().includes('location') ||
  n.toLowerCase().includes('dwarf')
);

if (debugRelated.length > 0) {
  console.log('   Debug-related methods:');
  debugRelated.forEach(m => console.log(`     - ${m}()`));
} else {
  console.log('   ⚠ No obvious debug-related methods found');
}

// Check custom sections (DWARF info is stored here)
console.log('\n4. Checking for custom sections (DWARF location):');
// Binaryen doesn't expose custom section enumeration directly in JS API
// But we can check if the binary has them by looking at size
console.log('   Binary size:', binary.length, 'bytes');
console.log('   (DWARF debug info would be in custom sections)');

// Inspect function info
console.log('\n5. Inspecting FunctionInfo structure:');
const numFunctions = module.getNumFunctions();
console.log(`   Total functions: ${numFunctions}`);

if (numFunctions > 0) {
  const funcRef = module.getFunctionByIndex(0);
  const funcInfo = binaryen.getFunctionInfo(funcRef);

  console.log('\n   FunctionInfo properties for function 0:');
  console.log('   Available properties:');
  Object.keys(funcInfo).forEach(key => {
    const value = funcInfo[key];
    const type = typeof value;
    if (type === 'function') {
      console.log(`     - ${key}: [function]`);
    } else if (type === 'object' && value !== null) {
      console.log(`     - ${key}: [object]`);
    } else {
      console.log(`     - ${key}: ${value}`);
    }
  });
}

console.log('\n' + '='.repeat(80));
console.log('CONCLUSION:');
console.log('-----------');
console.log('Binaryen provides function names but not direct DWARF access in JS API.');
console.log('Source locations would need to be extracted via:');
console.log('  1. AS compiler source map generation (--sourceMap flag)');
console.log('  2. Manual DWARF parsing from custom sections');
console.log('  3. External DWARF parsing library');
console.log('\nThis is a future enhancement - function names are sufficient for MVP.');
console.log('='.repeat(80));
