/**
 * Benchmark WASM Instantiation Overhead
 *
 * Tests the performance of different isolation strategies:
 * 1. Shared instance (all tests use same WASM instance)
 * 2. Per-test instance (each test gets fresh WASM instance)
 *
 * Measures:
 * - Time per instantiation
 * - Memory overhead
 * - Total time for N tests
 */

import asc from "assemblyscript/dist/asc.js";
import { performance } from "node:perf_hooks";

// Realistic test source code with actual test work
const testSource = `
// Simulate actual production code being tested
export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}

export function fibonacci(n: i32): i32 {
  if (n <= 1) return n;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

// More realistic computation - prime checking
export function isPrime(n: i32): bool {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 == 0 || n % 3 == 0) return false;

  let i = 5;
  while (i * i <= n) {
    if (n % i == 0 || n % (i + 2) == 0) return false;
    i += 6;
  }
  return true;
}

// String operations (common in tests)
export function reverseString(str: string): string {
  let result = "";
  for (let i = str.length - 1; i >= 0; i--) {
    result += str.charAt(i);
  }
  return result;
}

// Array operations
export function sumArray(arr: i32[]): i32 {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}
`;

// Compile AS to WASM binary (once)
async function compileToBinary() {
  let binary = null;

  const stdout = { write: () => {} };
  const stderr = { write: (msg) => console.error(msg) };

  const result = await asc.main(
    [
      "test.ts",
      "--outFile", "output.wasm",
      "--optimize",
      "--runtime", "stub",
      "--exportRuntime",
    ],
    {
      stdout,
      stderr,
      readFile: (filename) => {
        if (filename === "test.ts") return testSource;
        return null;
      },
      writeFile: (filename, contents) => {
        if (filename === "output.wasm") {
          binary = contents;
        }
      },
      listFiles: () => [],
    }
  );

  if (result.error) {
    throw new Error(`Compilation failed: ${result.error.message}`);
  }

  return binary;
}

// Minimal imports required by AS runtime
const wasmImports = {
  env: {
    abort: (msg, file, line, col) => {
      throw new Error(`Abort called at ${file}:${line}:${col}`);
    }
  }
};

// Measure instantiation time
async function measureInstantiationTime(binary, count) {
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    await WebAssembly.instantiate(binary, wasmImports);
  }

  const end = performance.now();
  const total = end - start;
  const average = total / count;

  return { total, average, count };
}

// Simulate running N tests with shared instance
async function benchmarkSharedInstance(binary, testCount) {
  const startTotal = performance.now();

  // Instantiate once
  const startInstantiate = performance.now();
  const instance = await WebAssembly.instantiate(binary, wasmImports);
  const instantiateTime = performance.now() - startInstantiate;

  // Run N tests with realistic work
  const startTests = performance.now();
  for (let i = 0; i < testCount; i++) {
    // Simulate realistic test execution - multiple assertions per test
    instance.instance.exports.add(i, i + 1);
    instance.instance.exports.multiply(i, 2);
    instance.instance.exports.fibonacci(20);  // More iterations
    instance.instance.exports.isPrime(97);     // Prime checking
    instance.instance.exports.isPrime(100);    // Non-prime

    // String operations (allocate memory)
    const strPtr = instance.instance.exports.__new(10, 1); // Allocate string
    instance.instance.exports.reverseString(strPtr);
  }
  const testsTime = performance.now() - startTests;

  const totalTime = performance.now() - startTotal;

  return {
    strategy: 'shared',
    testCount,
    instantiateTime,
    testsTime,
    totalTime,
    avgTimePerTest: testsTime / testCount,
  };
}

// Simulate running N tests with per-test instances
async function benchmarkPerTestInstance(binary, testCount) {
  const startTotal = performance.now();

  let totalInstantiateTime = 0;
  const startTests = performance.now();

  for (let i = 0; i < testCount; i++) {
    // Instantiate fresh for each test
    const startInstantiate = performance.now();
    const instance = await WebAssembly.instantiate(binary, wasmImports);
    totalInstantiateTime += performance.now() - startInstantiate;

    // Simulate realistic test execution - multiple assertions per test
    instance.instance.exports.add(i, i + 1);
    instance.instance.exports.multiply(i, 2);
    instance.instance.exports.fibonacci(20);  // More iterations
    instance.instance.exports.isPrime(97);     // Prime checking
    instance.instance.exports.isPrime(100);    // Non-prime

    // String operations (allocate memory)
    const strPtr = instance.instance.exports.__new(10, 1); // Allocate string
    instance.instance.exports.reverseString(strPtr);
  }

  const testsTime = performance.now() - startTests;
  const totalTime = performance.now() - startTotal;
  const actualTestWork = testsTime - totalInstantiateTime;

  return {
    strategy: 'per-test',
    testCount,
    instantiateTime: totalInstantiateTime,
    testsTime,
    totalTime,
    avgTimePerTest: testsTime / testCount,
    avgInstantiatePerTest: totalInstantiateTime / testCount,
    actualTestWork,
    avgTestWorkPerTest: actualTestWork / testCount,
  };
}

// Measure memory overhead
async function measureMemoryOverhead(binary, instanceCount) {
  if (global.gc) {
    global.gc();
  }

  const startMem = process.memoryUsage();
  const instances = [];

  for (let i = 0; i < instanceCount; i++) {
    const instance = await WebAssembly.instantiate(binary, wasmImports);
    instances.push(instance);
  }

  if (global.gc) {
    global.gc();
  }

  const endMem = process.memoryUsage();
  const memDelta = {
    heapUsed: endMem.heapUsed - startMem.heapUsed,
    external: endMem.external - startMem.external,
    total: (endMem.heapUsed + endMem.external) - (startMem.heapUsed + startMem.external),
  };

  return {
    instanceCount,
    memoryDelta: memDelta,
    avgMemoryPerInstance: memDelta.total / instanceCount,
  };
}

// Run all benchmarks
async function runBenchmarks() {
  console.log("🔬 WASM Instantiation Benchmark\n");
  console.log("Compiling test WASM binary...");

  const binary = await compileToBinary();
  console.log(`✓ Compiled (${binary.length} bytes)\n`);

  // Raw instantiation benchmarks
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Raw Instantiation Performance");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const counts = [1, 10, 100, 1000];
  for (const count of counts) {
    const result = await measureInstantiationTime(binary, count);
    console.log(`${count} instantiations:`);
    console.log(`  Total: ${result.total.toFixed(2)}ms`);
    console.log(`  Average: ${result.average.toFixed(3)}ms per instantiation\n`);
  }

  // Test execution benchmarks
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🧪 Test Execution Comparison");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const testCounts = [10, 50, 100, 500];

  for (const testCount of testCounts) {
    console.log(`Running ${testCount} tests:\n`);

    const shared = await benchmarkSharedInstance(binary, testCount);
    console.log(`  Shared Instance:`);
    console.log(`    Instantiation: ${shared.instantiateTime.toFixed(2)}ms (once)`);
    console.log(`    Test work: ${shared.testsTime.toFixed(2)}ms (${shared.avgTimePerTest.toFixed(3)}ms per test)`);
    console.log(`    Total: ${shared.totalTime.toFixed(2)}ms\n`);

    const perTest = await benchmarkPerTestInstance(binary, testCount);
    console.log(`  Per-Test Instance:`);
    console.log(`    Instantiation: ${perTest.instantiateTime.toFixed(2)}ms (${perTest.avgInstantiatePerTest.toFixed(3)}ms per test)`);
    console.log(`    Test work: ${perTest.actualTestWork.toFixed(2)}ms (${perTest.avgTestWorkPerTest.toFixed(3)}ms per test)`);
    console.log(`    Total: ${perTest.totalTime.toFixed(2)}ms (${perTest.avgTimePerTest.toFixed(3)}ms per test)\n`);

    const absoluteOverhead = perTest.totalTime - shared.totalTime;
    const percentOverhead = (absoluteOverhead / shared.totalTime * 100);
    const instantiationPercent = (perTest.instantiateTime / perTest.totalTime * 100);

    console.log(`  📊 Analysis:`);
    console.log(`    Absolute overhead: ${absoluteOverhead.toFixed(2)}ms total (${(absoluteOverhead / testCount).toFixed(3)}ms per test)`);
    console.log(`    Percent overhead: ${percentOverhead.toFixed(1)}%`);
    console.log(`    Instantiation is ${instantiationPercent.toFixed(1)}% of per-test total time`);
    console.log(`    Test work is ${(100 - instantiationPercent).toFixed(1)}% of per-test total time\n`);
  }

  // Memory overhead benchmarks
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💾 Memory Overhead");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const instanceCounts = [1, 10, 100, 500];
  for (const count of instanceCounts) {
    const result = await measureMemoryOverhead(binary, count);
    console.log(`${count} instances:`);
    console.log(`  Total memory: ${(result.memoryDelta.total / 1024).toFixed(2)} KB`);
    console.log(`  Avg per instance: ${(result.avgMemoryPerInstance / 1024).toFixed(2)} KB\n`);
  }

  // Recommendations
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💡 Recommendations");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Calculate metrics across all test counts
  let totalAbsoluteOverhead = 0;
  let totalPercentOverhead = 0;
  let testCountTotal = 0;

  for (const testCount of testCounts) {
    const shared = await benchmarkSharedInstance(binary, testCount);
    const perTest = await benchmarkPerTestInstance(binary, testCount);
    const overhead = perTest.totalTime - shared.totalTime;
    totalAbsoluteOverhead += overhead;
    totalPercentOverhead += ((overhead / shared.totalTime) * 100);
    testCountTotal += testCount;
  }

  const avgPercentOverhead = totalPercentOverhead / testCounts.length;
  const avgAbsolutePerTest = totalAbsoluteOverhead / testCountTotal;

  console.log(`Average percent overhead: ${avgPercentOverhead.toFixed(1)}%`);
  console.log(`Average absolute overhead per test: ${avgAbsolutePerTest.toFixed(3)}ms\n`);

  if (avgAbsolutePerTest < 0.5) {
    console.log("✅ Per-test isolation is NEGLIGIBLE - USE AS DEFAULT");
    console.log("   Recommendation: Default to 'per-test' for maximum safety");
    console.log("   Rationale:");
    console.log(`     • Only ${avgAbsolutePerTest.toFixed(3)}ms overhead per test`);
    console.log("     • Perfect crash isolation (AS has no try/catch)");
    console.log("     • Tests are truly independent");
    console.log("     • Better developer experience\n");
    console.log("   Config:");
    console.log("     • isolation: 'per-test' (default)");
    console.log("     • isolation: 'shared' (opt-in for extreme performance)\n");
  } else if (avgAbsolutePerTest < 2.0) {
    console.log("⚠️  Per-test isolation has SMALL but measurable overhead");
    console.log("   Recommendation: Still viable as default for safety");
    console.log(`   Rationale: ${avgAbsolutePerTest.toFixed(3)}ms per test is acceptable for crash isolation\n`);
  } else {
    console.log("❌ Per-test isolation overhead is TOO HIGH");
    console.log("   Recommendation: Default to shared or per-file isolation");
    console.log(`   Rationale: ${avgAbsolutePerTest.toFixed(3)}ms per test adds up quickly\n`);
  }
}

// Run with error handling
runBenchmarks().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
