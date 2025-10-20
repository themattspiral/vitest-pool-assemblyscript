#!/usr/bin/env node
/**
 * Test Binaryen validation with different feature flag configurations
 *
 * This script compiles a test file and tries validation with different
 * feature flag settings to understand the bulk-memory validation issue.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use tsx to load TypeScript files
const tsx = await import('tsx/esm/api');
const { compileAssemblyScript } = await tsx.tsImport('../src/compiler.ts', import.meta.url);

import { readFileSync } from 'fs';
import binaryen from 'binaryen';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test with strings.as.test.ts since it triggered the validation error in Phase 1c
const testFile = join(__dirname, '../tests/assembly/strings.as.test.ts');
const testSource = readFileSync(testFile, 'utf-8');

console.log('Testing Binaryen validation with feature flags\n');
console.log('Test file:', testFile);
console.log('='.repeat(80));

// Compile the test file
console.log('\n1. Compiling with AS compiler...');
const result = await compileAssemblyScript(testSource, testFile);

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log('   ✓ Compilation successful');
console.log('   Binary size:', result.binary.length, 'bytes');

// Read the binary with Binaryen
console.log('\n2. Reading binary with Binaryen...');
const module = binaryen.readBinary(result.binary);
console.log('   ✓ Binary loaded');

// Check current features
console.log('\n3. Checking current module features...');
const currentFeatures = module.getFeatures();
console.log('   Current features value:', currentFeatures);

// List of feature flags to test
const featuresToTest = [
  { name: 'MVP', value: binaryen.Features.MVP },
  { name: 'BulkMemory', value: binaryen.Features.BulkMemory },
  { name: 'BulkMemoryOpt', value: binaryen.Features.BulkMemoryOpt },
  { name: 'All', value: binaryen.Features.All },
];

console.log('\n   Available features:');
featuresToTest.forEach(({ name, value }) => {
  const enabled = (currentFeatures & value) !== 0;
  console.log(`   - ${name.padEnd(20)} = ${value.toString().padStart(10)} ${enabled ? '✓ ENABLED' : ''}`);
});

// Test validation with current features
console.log('\n4. Testing validation with CURRENT features...');
try {
  const valid = module.validate();
  if (valid) {
    console.log('   ✓ Validation PASSED with current features');
  } else {
    console.log('   ✗ Validation FAILED with current features');
  }
} catch (err) {
  console.log('   ✗ Validation threw error:', err.message);
}

// Test validation with BulkMemory explicitly enabled
console.log('\n5. Testing validation with BulkMemory explicitly enabled...');
const module2 = binaryen.readBinary(result.binary);
module2.setFeatures(binaryen.Features.BulkMemory | currentFeatures);
try {
  const valid = module2.validate();
  if (valid) {
    console.log('   ✓ Validation PASSED with BulkMemory enabled');
  } else {
    console.log('   ✗ Validation FAILED with BulkMemory enabled');
  }
} catch (err) {
  console.log('   ✗ Validation threw error:', err.message);
}

// Test validation with BulkMemoryOpt explicitly enabled
console.log('\n6. Testing validation with BulkMemoryOpt explicitly enabled...');
const module3 = binaryen.readBinary(result.binary);
module3.setFeatures(binaryen.Features.BulkMemoryOpt | currentFeatures);
try {
  const valid = module3.validate();
  if (valid) {
    console.log('   ✓ Validation PASSED with BulkMemoryOpt enabled');
  } else {
    console.log('   ✗ Validation FAILED with BulkMemoryOpt enabled');
  }
} catch (err) {
  console.log('   ✗ Validation threw error:', err.message);
}

// Test validation with ALL features
console.log('\n7. Testing validation with ALL features enabled...');
const module4 = binaryen.readBinary(result.binary);
module4.setFeatures(binaryen.Features.All);
try {
  const valid = module4.validate();
  if (valid) {
    console.log('   ✓ Validation PASSED with All features');
  } else {
    console.log('   ✗ Validation FAILED with All features');
  }
} catch (err) {
  console.log('   ✗ Validation threw error:', err.message);
}

console.log('\n' + '='.repeat(80));
console.log('CONCLUSION:');
console.log('The validation issue can be resolved by:');
console.log('1. Reading current features from AS-compiled module');
console.log('2. Ensuring bulk-memory features are enabled via setFeatures()');
console.log('3. Testing which combination works for validation');
console.log('='.repeat(80));
