#!/usr/bin/env node
/**
 * Test how to work with exports in Binaryen
 */

import binaryen from 'binaryen';
import { readFileSync } from 'fs';

// Load one of our test files
const wasmPath = './tests/assembly/math.as.test.ts';

// We need to compile it first - let's just use a minimal test
console.log('Creating test module with exports...\n');

const module = new binaryen.Module();

// Add a simple function
const funcType = module.addFunctionType('test_func', binaryen.none, binaryen.none);
const body = module.nop();
module.addFunction('testFunc', funcType, [], body);

// Export it
module.addFunctionExport('testFunc', 'testFunc');

// Check exports
console.log('Number of exports:', module.getNumExports());

for (let i = 0; i < module.getNumExports(); i++) {
  const exportInfo = module.getExportByIndex(i);
  console.log(`Export ${i}:`, exportInfo);
}

// Try getExport
console.log('\nTrying getExport("testFunc"):');
const exportInfo = module.getExport('testFunc');
console.log('Export info:', exportInfo);
console.log('Export info name:', exportInfo ? exportInfo.name : 'N/A');
console.log('Export info value:', exportInfo ? exportInfo.value : 'N/A');
console.log('Export info kind:', exportInfo ? exportInfo.kind : 'N/A');

module.dispose();
