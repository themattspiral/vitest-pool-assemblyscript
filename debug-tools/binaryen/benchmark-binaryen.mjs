/**
 * Benchmark Binaryen instrumentation overhead
 */

import { compileAssemblyScript } from '../src/compiler.ts';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const testFiles = [
  'tests/assembly/assertions.as.test.ts',
  'tests/assembly/crash-isolation.as.test.ts',
  'tests/assembly/math.as.test.ts',
  'tests/assembly/strings.as.test.ts',
];

console.log('Benchmarking Binaryen instrumentation overhead\n');
console.log('='.repeat(70));

const results = [];

for (const testFile of testFiles) {
  const filePath = resolve(testFile);
  const source = readFileSync(filePath, 'utf8');

  console.log(`\nFile: ${testFile}`);

  // Warmup run
  await compileAssemblyScript(source, filePath);

  // Benchmark runs
  const runs = 5;
  const times = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const result = await compileAssemblyScript(source, filePath);
    const end = performance.now();

    if (result.error) {
      console.error(`  Error: ${result.error.message}`);
      break;
    }

    times.push(end - start);
  }

  if (times.length === runs) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`  Runs: ${runs}`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);

    results.push({
      file: testFile,
      avg,
      min,
      max,
    });
  }
}

console.log('\n' + '='.repeat(70));
console.log('\nSummary:');
console.log('--------');

const overallAvg = results.reduce((a, b) => a + b.avg, 0) / results.length;
const overallMin = Math.min(...results.map(r => r.min));
const overallMax = Math.max(...results.map(r => r.max));

console.log(`Overall average: ${overallAvg.toFixed(2)}ms`);
console.log(`Overall min: ${overallMin.toFixed(2)}ms`);
console.log(`Overall max: ${overallMax.toFixed(2)}ms`);

if (overallMax < 100) {
  console.log('\n✅ SUCCESS: All files compiled in <100ms (success criterion met)');
} else {
  console.log('\n⚠️  WARNING: Some files took >100ms to compile');
}
