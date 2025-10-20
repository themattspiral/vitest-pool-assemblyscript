#!/usr/bin/env node
/**
 * Benchmark Binaryen coverage instrumentation overhead
 *
 * Compares:
 * 1. AS compilation alone (baseline)
 * 2. AS compilation + Binaryen coverage instrumentation
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use tsx to load TypeScript files
const tsx = await import('tsx/esm/api');
const { BinaryenCoverageInstrumenter } = await tsx.tsImport('../src/binaryen/coverage-instrumentation.ts', import.meta.url);

import { readFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import asc from 'assemblyscript/dist/asc.js';
import { basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find all test files
const testDir = join(__dirname, '../tests/assembly');
const allFiles = readdirSync(testDir);
const testFiles = allFiles
  .filter(f => f.endsWith('.as.test.ts'))
  .map(f => join(testDir, f));

console.log('Benchmarking Binaryen Coverage Instrumentation Overhead');
console.log('(Measuring time difference: with coverage - without)');
console.log('='.repeat(70));
console.log(`Testing ${testFiles.length} files`);
console.log('='.repeat(70));

const results = [];

for (const testFile of testFiles) {
  const shortName = basename(testFile);

  console.log(`\n${shortName}`);

  // Compile function
  const compileFile = async () => {
    let binary = null;
    const result = await asc.main([
      testFile,
      '--outFile', 'output.wasm',
      '--optimizeLevel', '0',
      '--runtime', 'stub',
      '--importMemory',
      '--debug',
      '--exportStart', '_start',
    ], {
      stdout: { write: () => true },
      stderr: { write: () => true },
      writeFile: (name, contents, _baseDir) => {
        if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
          binary = contents;
        }
      },
    });

    if (result.error || !binary) {
      throw new Error('Compilation failed');
    }

    return binary;
  };

  // Warmup phase (3 iterations to warm up JIT)
  console.log('  Warming up JIT...');
  let baselineBinary = null;
  const instrumenter = new BinaryenCoverageInstrumenter();

  for (let i = 0; i < 3; i++) {
    baselineBinary = await compileFile();
    instrumenter.instrument(baselineBinary);
  }

  console.log('  Running benchmark...');

  // Benchmark: AS compilation only (10 runs for better average)
  const ascTimes = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    baselineBinary = await compileFile();
    const end = performance.now();
    ascTimes.push(end - start);
  }

  // Benchmark: Coverage instrumentation only (10 runs)
  const coverageTimes = [];

  for (let i = 0; i < 10; i++) {
    // Use the baseline binary from last compilation
    const start = performance.now();
    const { binary, debugInfo } = instrumenter.instrument(baselineBinary);
    const end = performance.now();
    coverageTimes.push(end - start);
  }

  // Calculate statistics
  const avgAsc = ascTimes.reduce((a, b) => a + b, 0) / ascTimes.length;
  const avgCoverage = coverageTimes.reduce((a, b) => a + b, 0) / coverageTimes.length;
  const minCoverage = Math.min(...coverageTimes);
  const maxCoverage = Math.max(...coverageTimes);
  const percentOverhead = (avgCoverage / avgAsc) * 100;

  console.log(`  AS compilation (avg): ${avgAsc.toFixed(2)}ms`);
  console.log(`  Coverage overhead (avg): ${avgCoverage.toFixed(2)}ms`);
  console.log(`  Coverage overhead (min): ${minCoverage.toFixed(2)}ms`);
  console.log(`  Coverage overhead (max): ${maxCoverage.toFixed(2)}ms`);
  console.log(`  Overhead percentage: ${percentOverhead.toFixed(1)}%`);

  results.push({
    file: shortName,
    avgAsc,
    avgCoverage,
    minCoverage,
    maxCoverage,
    percentOverhead,
  });
}

console.log('\n' + '='.repeat(70));
console.log('\nSUMMARY:');
console.log('--------');

const overallAvgCoverage = results.reduce((a, b) => a + b.avgCoverage, 0) / results.length;
const overallMinCoverage = Math.min(...results.map(r => r.minCoverage));
const overallMaxCoverage = Math.max(...results.map(r => r.maxCoverage));
const overallAvgPercent = results.reduce((a, b) => a + b.percentOverhead, 0) / results.length;

console.log(`Coverage overhead (average): ${overallAvgCoverage.toFixed(2)}ms`);
console.log(`Coverage overhead (min): ${overallMinCoverage.toFixed(2)}ms`);
console.log(`Coverage overhead (max): ${overallMaxCoverage.toFixed(2)}ms`);
console.log(`Average overhead percentage: ${overallAvgPercent.toFixed(1)}%`);

const SUCCESS_THRESHOLD = 20; // ms per file (from plan)
if (overallMaxCoverage < SUCCESS_THRESHOLD) {
  console.log(`\n✅ SUCCESS: All files had coverage overhead <${SUCCESS_THRESHOLD}ms`);
  console.log('   (Success criterion met from Phase 1d plan)');
} else {
  console.log(`\n⚠️  WARNING: Some files had coverage overhead >${SUCCESS_THRESHOLD}ms`);
}

console.log('='.repeat(70));
