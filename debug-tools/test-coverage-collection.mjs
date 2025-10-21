#!/usr/bin/env node
/**
 * Debug tool to test coverage data collection
 *
 * Compiles a test file and runs it, then dumps the coverage data
 */

import { compileAssemblyScript } from '../src/compiler.js';
import { executeTests } from '../src/executor.js';

const testFile = process.argv[2] || 'tests/assembly/math.as.test.ts';

console.log('=== Coverage Collection Test ===\n');
console.log(`Test file: ${testFile}\n`);

// Compile with coverage instrumentation
console.log('Compiling with coverage instrumentation...');
const result = await compileAssemblyScript('', testFile, { coverage: true });

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

console.log(`✓ Compiled successfully (${result.binary.length} bytes)\n`);

// Execute tests and collect coverage
console.log('Executing tests with coverage collection...');
const executionResults = await executeTests(result.binary, result.sourceMap, testFile);

console.log(`✓ Executed ${executionResults.tests.length} tests\n`);

// Dump coverage data
console.log('=== Coverage Data ===\n');

for (const test of executionResults.tests) {
  console.log(`Test: ${test.name}`);
  console.log(`  Status: ${test.passed ? 'PASSED' : 'FAILED'}`);

  if (test.coverage) {
    console.log(`  Coverage:`);
    console.log(`    Functions covered: ${test.coverage.functions.size}`);
    console.log(`    Blocks covered: ${test.coverage.blocks.size}`);

    // Show function execution counts
    if (test.coverage.functions.size > 0) {
      console.log(`    Function execution counts:`);
      for (const [funcIdx, count] of test.coverage.functions.entries()) {
        console.log(`      Function ${funcIdx}: ${count} times`);
      }
    }

    // Show block execution counts
    if (test.coverage.blocks.size > 0 && test.coverage.blocks.size <= 20) {
      console.log(`    Block execution counts:`);
      for (const [blockKey, count] of test.coverage.blocks.entries()) {
        console.log(`      Block ${blockKey}: ${count} times`);
      }
    }
  } else {
    console.log(`  Coverage: none collected`);
  }

  console.log('');
}

console.log('=== Summary ===');
console.log(`Total tests: ${executionResults.tests.length}`);
console.log(`Passed: ${executionResults.tests.filter(t => t.passed).length}`);
console.log(`Failed: ${executionResults.tests.filter(t => !t.passed).length}`);

const testsWithCoverage = executionResults.tests.filter(t => t.coverage && t.coverage.functions.size > 0);
console.log(`Tests with coverage data: ${testsWithCoverage.length}`);
