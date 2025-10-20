/**
 * Benchmark Binaryen instrumentation overhead ONLY
 *
 * Measures the difference between:
 * 1. AS compilation alone
 * 2. AS compilation + Binaryen instrumentation
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import asc from 'assemblyscript/dist/asc.js';
import { basename } from 'path';
import { BinaryenTestExecutionInjector } from '../src/binaryen/test-execution.ts';

const testFiles = [
  'tests/assembly/assertions.as.test.ts',
  'tests/assembly/crash-isolation.as.test.ts',
  'tests/assembly/math.as.test.ts',
  'tests/assembly/strings.as.test.ts',
];

console.log('Benchmarking Binaryen instrumentation overhead ONLY');
console.log('(Measuring time difference: with instrumentation - without)');
console.log('='.repeat(70));

const results = [];

for (const testFile of testFiles) {
  const filePath = resolve(testFile);
  const entryFile = filePath;
  const outputFile = basename(filePath).replace(/\.ts$/, '.wasm');

  console.log(`\nFile: ${testFile}`);

  // First, compile with AS to get a baseline binary
  let baselineBinary = null;
  const compileFile = async () => {
    let binary = null;
    const result = await asc.main([
      entryFile,
      '--outFile', outputFile,
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

  // Warmup
  baselineBinary = await compileFile();

  // Benchmark: AS compilation only (5 runs)
  const ascTimes = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    baselineBinary = await compileFile();
    const end = performance.now();
    ascTimes.push(end - start);
  }

  // Benchmark: AS compilation + Binaryen injection (5 runs)
  const fullTimes = [];
  const binaryenTimes = [];
  const injector = new BinaryenTestExecutionInjector();

  for (let i = 0; i < 5; i++) {
    // Compile with AS
    const ascStart = performance.now();
    const binary = await compileFile();
    const ascEnd = performance.now();

    // Inject with Binaryen
    const binaryenStart = performance.now();
    injector.inject(binary);
    const binaryenEnd = performance.now();

    fullTimes.push(ascEnd - ascStart);
    binaryenTimes.push(binaryenEnd - binaryenStart);
  }

  // Calculate statistics
  const avgAsc = ascTimes.reduce((a, b) => a + b, 0) / ascTimes.length;
  const avgBinaryen = binaryenTimes.reduce((a, b) => a + b, 0) / binaryenTimes.length;
  const minBinaryen = Math.min(...binaryenTimes);
  const maxBinaryen = Math.max(...binaryenTimes);

  console.log(`  AS compilation only (avg): ${avgAsc.toFixed(2)}ms`);
  console.log(`  Binaryen overhead (avg): ${avgBinaryen.toFixed(2)}ms`);
  console.log(`  Binaryen overhead (min): ${minBinaryen.toFixed(2)}ms`);
  console.log(`  Binaryen overhead (max): ${maxBinaryen.toFixed(2)}ms`);
  console.log(`  Overhead percentage: ${((avgBinaryen / avgAsc) * 100).toFixed(1)}%`);

  results.push({
    file: testFile,
    avgAsc,
    avgBinaryen,
    minBinaryen,
    maxBinaryen,
  });
}

console.log('\n' + '='.repeat(70));
console.log('\nSummary:');
console.log('--------');

const overallAvgBinaryen = results.reduce((a, b) => a + b.avgBinaryen, 0) / results.length;
const overallMinBinaryen = Math.min(...results.map(r => r.minBinaryen));
const overallMaxBinaryen = Math.max(...results.map(r => r.maxBinaryen));

console.log(`Binaryen overhead (average): ${overallAvgBinaryen.toFixed(2)}ms`);
console.log(`Binaryen overhead (min): ${overallMinBinaryen.toFixed(2)}ms`);
console.log(`Binaryen overhead (max): ${overallMaxBinaryen.toFixed(2)}ms`);

if (overallMaxBinaryen < 100) {
  console.log('\n✅ SUCCESS: All files had Binaryen overhead <100ms');
  console.log('   (Success criterion met)');
} else {
  console.log('\n⚠️  WARNING: Some files had Binaryen overhead >100ms');
}
