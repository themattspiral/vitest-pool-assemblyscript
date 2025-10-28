#!/usr/bin/env node

/**
 * POC: Verify that TWO SEQUENTIAL QUEUES achieve the desired behavior:
 * 1. Clean compilations are sequential (for V8 warmup)
 * 2. Coverage compilations are sequential (for V8 warmup)
 * 3. Clean and coverage queues are INDEPENDENT (for pipeline parallelism)
 */

import { performance } from 'node:perf_hooks';

async function simulateCompile(file, options, duration) {
  await new Promise(resolve => setTimeout(resolve, duration));
  return { file, coverage: options.coverage };
}

// TWO SEPARATE QUEUES
let cleanQueue = Promise.resolve();
let coverageQueue = Promise.resolve();

async function queueCleanCompilation(testFile, duration) {
  const currentCompilation = cleanQueue.then(async () => {
    console.log(`[${performance.now().toFixed(2)}ms] Starting clean compile: ${testFile}`);
    await simulateCompile(testFile, { coverage: false }, duration);
    console.log(`[${performance.now().toFixed(2)}ms] Finished clean compile: ${testFile}`);
    return { testFile };
  });

  cleanQueue = currentCompilation;  // ← Updates CLEAN queue only
  return currentCompilation;
}

async function queueCoverageCompilation(testFile, duration) {
  const currentCompilation = coverageQueue.then(async () => {
    console.log(`[${performance.now().toFixed(2)}ms] Starting coverage compile: ${testFile}`);
    await simulateCompile(testFile, { coverage: true }, duration);
    console.log(`[${performance.now().toFixed(2)}ms] Finished coverage compile: ${testFile}`);
    return { testFile };
  });

  coverageQueue = currentCompilation;  // ← Updates COVERAGE queue only
  return currentCompilation;
}

async function processFile(testFile, cleanDuration, coverageDuration) {
  console.log(`\n[${performance.now().toFixed(2)}ms] === Processing ${testFile} ===`);

  // Queue clean compilation
  const cachedPromise = queueCleanCompilation(testFile, cleanDuration);

  // Queue coverage compilation immediately (separate queue)
  const coveragePromise = queueCoverageCompilation(testFile, coverageDuration);

  // Await clean
  const cached = await cachedPromise;
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Clean binary ready, starting discovery`);

  // Discovery
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Discovery phase (simulated 10ms)`);
  await new Promise(resolve => setTimeout(resolve, 10));

  // Tests
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Test execution phase (simulated 20ms)`);
  await new Promise(resolve => setTimeout(resolve, 20));

  // Await coverage
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Awaiting coverage binary`);
  await coveragePromise;
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Coverage binary ready`);

  // Coverage tests
  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: Coverage tests (simulated 15ms)`);
  await new Promise(resolve => setTimeout(resolve, 15));

  console.log(`[${performance.now().toFixed(2)}ms] ${testFile}: COMPLETE`);
}

async function main() {
  console.log('=== Testing TWO SEQUENTIAL QUEUES ===\n');
  console.log('Expected behavior:');
  console.log('- Clean compilations execute sequentially: clean1 → clean2 → clean3');
  console.log('- Coverage compilations execute sequentially: cov1 → cov2 → cov3');
  console.log('- File2 clean should START before File1 coverage FINISHES');
  console.log('- Both queues progress independently\n');
  console.log('=== ACTUAL EXECUTION ===\n');

  const startTime = performance.now();

  const files = [
    { name: 'File1', cleanDuration: 350, coverageDuration: 180 },
    { name: 'File2', cleanDuration: 120, coverageDuration: 150 },
    { name: 'File3', cleanDuration: 120, coverageDuration: 160 },
  ];

  await Promise.all(files.map(f => processFile(f.name, f.cleanDuration, f.coverageDuration)));

  const totalTime = performance.now() - startTime;
  console.log(`\n=== TOTAL TIME: ${totalTime.toFixed(2)}ms ===\n`);

  console.log('=== ANALYSIS ===\n');
  console.log('Critical questions:');
  console.log('1. Are clean compilations sequential? (clean1 → clean2 → clean3)');
  console.log('2. Are coverage compilations sequential? (cov1 → cov2 → cov3)');
  console.log('3. Does File2 clean START before File1 coverage FINISHES?');
  console.log('4. Can both queues progress at the same time?');
  console.log('\nIf all answers are YES, then two queues achieve the goal.');
}

main().catch(console.error);
