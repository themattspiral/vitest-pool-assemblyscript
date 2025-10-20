#!/usr/bin/env node
/**
 * Test Binaryen API to understand available methods
 */

import binaryen from 'binaryen';

// Create a minimal valid WASM module
const wasmHeader = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // \0asm
  0x01, 0x00, 0x00, 0x00, // version 1
]);

console.log('Testing Binaryen API...\n');

// Test readBinary
const module = binaryen.readBinary(wasmHeader);
console.log('Module created:', module);
console.log('\nModule type:', typeof module);
console.log('\nModule constructor:', module.constructor.name);

// List all methods
const proto = Object.getPrototypeOf(module);
const methods = Object.getOwnPropertyNames(proto)
  .filter(m => typeof module[m] === 'function')
  .filter(m => !m.startsWith('_'))
  .sort();

console.log('\nAvailable methods:');
methods.forEach(m => console.log(`  - ${m}`));

// Check for export-related methods
console.log('\nExport-related methods:');
const exportMethods = methods.filter(m => m.toLowerCase().includes('export'));
exportMethods.forEach(m => console.log(`  - ${m}`));

// Try to get export info another way
console.log('\nTrying getNumExports():');
try {
  const numExports = module.getNumExports();
  console.log('  Number of exports:', numExports);
} catch (e) {
  console.log('  Error:', e.message);
}

// Check what the module object looks like
console.log('\nModule own properties:');
Object.keys(module).forEach(k => {
  console.log(`  ${k}: ${typeof module[k]}`);
});
