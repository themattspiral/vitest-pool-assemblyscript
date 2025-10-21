#!/usr/bin/env node
/**
 * APPROACH 3: Separate Binaries
 *
 * Compile TWICE:
 * 1. Clean binary (no instrumentation) - for test EXECUTION with accurate errors
 * 2. Instrumented binary - for COVERAGE collection only
 *
 * This ensures:
 * - Test execution uses clean binary → source maps work perfectly
 * - Coverage data collected from instrumented binary → accurate coverage
 * - NO conflict between coverage and error locations!
 */

import asc from 'assemblyscript/dist/asc.js';
import binaryen from 'binaryen';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SourceMapConsumer } from 'source-map';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, '../tests/assembly/crash-isolation.as.test.ts');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║     APPROACH 3: Separate Binaries for Tests vs Coverage      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// COMPILE 1: Clean binary for test execution
// ============================================================================
console.log('[Phase 1] Compile CLEAN binary for test execution...');

let cleanBinary = null;
let cleanSourceMap = null;

await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--sourceMap',
  '--exportStart', '_start',
  '--exportTable',
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) cleanBinary = contents;
    if (name.endsWith('.wasm.map')) cleanSourceMap = contents;
  },
});

console.log(`  ✓ Clean binary: ${cleanBinary.length} bytes`);
console.log(`  ✓ Source map: ${cleanSourceMap.length} bytes\n`);

// ============================================================================
// COMPILE 2: Instrumented binary for coverage collection
// ============================================================================
console.log('[Phase 2] Compile INSTRUMENTED binary for coverage...');

let coverageBinary = null;

await asc.main([
  testFile,
  '--outFile', 'output.wasm',
  '--optimizeLevel', '0',
  '--runtime', 'stub',
  '--importMemory',
  '--debug',
  '--exportStart', '_start',
  '--exportTable',
  // Add transform for coverage metadata extraction
  '--transform', './src/transforms/extract-function-metadata.mjs',
], {
  writeFile: (name, contents) => {
    if (name.endsWith('.wasm')) coverageBinary = contents;
  },
});

// Instrument with Binaryen
binaryen.setDebugInfo(true);
const module = binaryen.readBinary(coverageBinary);

const params = binaryen.createType([binaryen.i32, binaryen.i32]);
module.addFunctionImport('__coverage_trace', 'env', '__coverage_trace', params, binaryen.none);

let coverageFuncCount = 0;
for (let i = 0; i < module.getNumFunctions(); i++) {
  const funcRef = module.getFunctionByIndex(i);
  const funcInfo = binaryen.getFunctionInfo(funcRef);

  if (funcInfo.module || !funcInfo.body ||
      funcInfo.name.startsWith('__') ||
      funcInfo.name.startsWith('~')) continue;

  const trace = module.call('__coverage_trace', [
    module.i32.const(coverageFuncCount++),
    module.i32.const(0),
  ], binaryen.none);

  const newBody = module.block(null, [trace, funcInfo.body], funcInfo.results);
  module.removeFunction(funcInfo.name);
  module.addFunction(funcInfo.name, funcInfo.params, funcInfo.results, funcInfo.vars, newBody);
}

const currentFeatures = module.getFeatures();
module.setFeatures(currentFeatures | binaryen.Features.BulkMemoryOpt);
module.validate();

const instrumentedBinary = module.emitBinary();
module.dispose();

console.log(`  ✓ Instrumented binary: ${instrumentedBinary.length} bytes`);
console.log(`  ✓ Instrumented ${coverageFuncCount} functions\n`);

// ============================================================================
// TEST 1: Execute clean binary (accurate error locations)
// ============================================================================
console.log('[Test 1] Execute tests with CLEAN binary...');
console.log('  (This will have accurate error locations)\n');

let cleanErrorLocation = 'unknown';
let cleanCapturedStack = null;

const cleanModule = await WebAssembly.compile(cleanBinary);
const cleanMemory = new WebAssembly.Memory({ initial: 1 });

const cleanImports = {
  env: {
    memory: cleanMemory,
    __register_test() {},
    __assertion_pass() {},
    __assertion_fail() {},
    abort() {
      const error = new Error('abort');
      const originalPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = (_err, stack) => {
        cleanCapturedStack = stack;
        return '';
      };
      error.stack;
      Error.prepareStackTrace = originalPrepare;
      throw error;
    },
  },
};

const cleanInstance = new WebAssembly.Instance(cleanModule, cleanImports);
cleanInstance.exports._start();

// Run failing test
for (let idx = 0; idx < 20; idx++) {
  try {
    const fn = cleanInstance.exports.table?.get(idx);
    if (fn && typeof fn === 'function') {
      try {
        fn();
      } catch (e) {
        if (cleanCapturedStack) break;
      }
    }
  } catch (e) {}
}

// Map error location
if (cleanCapturedStack && cleanSourceMap) {
  const wasmFrames = cleanCapturedStack.filter(cs => {
    const fileName = cs.getFileName();
    return fileName && fileName.startsWith('wasm');
  });

  if (wasmFrames.length > 0) {
    const frame = wasmFrames[wasmFrames.length - 1];
    const watLine = frame.getLineNumber();
    const watColumn = frame.getColumnNumber();

    const sourceMapObj = JSON.parse(cleanSourceMap);
    const consumer = await new SourceMapConsumer(sourceMapObj);

    const original = consumer.originalPositionFor({
      line: watLine,
      column: watColumn
    });

    consumer.destroy();

    if (original.source && original.line) {
      cleanErrorLocation = `${original.source}:${original.line}:${original.column}`;
    }
  }
}

console.log(`  Test error location: ${cleanErrorLocation}`);
console.log(`  ${cleanErrorLocation.includes(':13:') ? '✓ CORRECT!' : '✗ Wrong'}\n`);

// ============================================================================
// TEST 2: Collect coverage with INSTRUMENTED binary
// ============================================================================
console.log('[Test 2] Collect coverage with INSTRUMENTED binary...');
console.log('  (This will collect coverage data, ignore errors)\n');

const coverageData = new Map();

const covModule = await WebAssembly.compile(instrumentedBinary);
const covMemory = new WebAssembly.Memory({ initial: 1 });

const covImports = {
  env: {
    memory: covMemory,
    __coverage_trace(funcIdx, blockIdx) {
      // Collect coverage!
      const key = `${funcIdx}:${blockIdx}`;
      coverageData.set(key, (coverageData.get(key) || 0) + 1);
    },
    __register_test() {},
    __assertion_pass() {},
    __assertion_fail() {},
    abort() {
      throw new Error('abort');
    },
  },
};

const covInstance = new WebAssembly.Instance(covModule, covImports);
covInstance.exports._start();

// Run ALL tests to collect coverage
for (let idx = 0; idx < 20; idx++) {
  try {
    const fn = covInstance.exports.table?.get(idx);
    if (fn && typeof fn === 'function') {
      try {
        fn();
      } catch (e) {
        // Ignore errors - we're just collecting coverage
      }
    }
  } catch (e) {}
}

console.log(`  ✓ Coverage collected: ${coverageData.size} unique blocks traced`);
console.log(`  Sample coverage data:`);
[...coverageData.entries()].slice(0, 5).forEach(([key, count]) => {
  console.log(`    Block ${key}: hit ${count} times`);
});

// ============================================================================
// RESULTS
// ============================================================================
console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  RESULTS: Approach 3 - Separate Binaries                     ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('✓ Test Execution (clean binary):');
console.log(`    Error location: ${cleanErrorLocation}`);
console.log(`    Accurate: ${cleanErrorLocation.includes(':13:') ? 'YES ✓' : 'NO ✗'}`);
console.log('');
console.log('✓ Coverage Collection (instrumented binary):');
console.log(`    Blocks traced: ${coverageData.size}`);
console.log(`    Data collected: YES ✓`);
console.log('');

if (cleanErrorLocation.includes(':13:') && coverageData.size > 0) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    ✓✓✓ SUCCESS ✓✓✓                           ║');
  console.log('║                                                               ║');
  console.log('║  BOTH requirements satisfied:                                 ║');
  console.log('║    1. ✓ Accurate error locations (line 13 = line 13)         ║');
  console.log('║    2. ✓ Coverage data collected                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('IMPLEMENTATION APPROACH:');
  console.log('  1. Compile ONCE without coverage (for test execution)');
  console.log('  2. Keep the clean binary + source map for error mapping');
  console.log('  3. Separately, compile WITH coverage (for coverage collection)');
  console.log('  4. Run tests on CLEAN binary (accurate errors)');
  console.log('  5. Run coverage binary in parallel/separate (collect data)');
  console.log('  6. Combine results');
  console.log('');
  console.log('OVERHEAD:');
  console.log('  - Compile twice (doubles compile time)');
  console.log('  - Execute twice (doubles execution time)');
  console.log('  - BUT: Both requirements met with NO compromises!');
} else {
  console.log('✗ Approach failed - investigate further');
}
