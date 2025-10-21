#!/usr/bin/env node
/**
 * Debug tool to test LCOV report generation
 *
 * Compiles a test file with coverage, runs it, and generates LCOV output
 */

import { compileAssemblyScript } from '../src/compiler.js';
import { executeTests } from '../src/executor.js';
import { aggregateCoverage, generateLCOV } from '../src/coverage/lcov-reporter.js';

const testFile = process.argv[2] || 'tests/assembly/math.as.test.ts';

console.log('=== LCOV Generation Test ===\n');
console.log(`Test file: ${testFile}\n`);

// Compile with coverage instrumentation
console.log('Compiling with coverage instrumentation...');
const result = await compileAssemblyScript('', testFile, { coverage: true });

if (result.error) {
  console.error('Compilation failed:', result.error);
  process.exit(1);
}

if (!result.debugInfo) {
  console.error('No debug info generated!');
  process.exit(1);
}

console.log(`✓ Compiled successfully (${result.binary.length} bytes)`);
console.log(`✓ Debug info: ${result.debugInfo.functions.length} functions\n`);

// Execute tests and collect coverage
console.log('Executing tests with coverage collection...');
const executionResults = await executeTests(result.binary, result.sourceMap, testFile);

console.log(`✓ Executed ${executionResults.tests.length} tests\n`);

// Aggregate coverage data
const coverageData = executionResults.tests
  .filter(t => t.coverage)
  .map(t => t.coverage);

if (coverageData.length === 0) {
  console.error('No coverage data collected!');
  process.exit(1);
}

const aggregated = aggregateCoverage(coverageData);

console.log('=== Aggregated Coverage ===');
console.log(`Functions covered: ${aggregated.functions.size}`);
console.log(`Blocks covered: ${aggregated.blocks.size}\n`);

// Generate LCOV report
console.log('=== LCOV Report ===\n');
const lcov = generateLCOV(aggregated, result.debugInfo, testFile);
console.log(lcov);

console.log('=== Summary ===');
console.log(`Total tests: ${executionResults.tests.length}`);
console.log(`Passed: ${executionResults.tests.filter(t => t.passed).length}`);
console.log(`Failed: ${executionResults.tests.filter(t => !t.passed).length}`);
console.log(`\nLCOV report generated successfully (${lcov.length} bytes)`);
