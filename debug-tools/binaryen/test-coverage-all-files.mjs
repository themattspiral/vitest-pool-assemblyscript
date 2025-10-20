#!/usr/bin/env node
/**
 * Test Binaryen coverage instrumentation on ALL test files
 *
 * Validates that coverage instrumentation works correctly on all .as.test.ts files
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Use tsx to load TypeScript files
const tsx = await import('tsx/esm/api');
const { setDebug } = await tsx.tsImport('../src/utils/debug.mjs', import.meta.url);
const { BinaryenCoverageInstrumenter } = await tsx.tsImport('../src/binaryen/coverage-instrumentation.ts', import.meta.url);

// Disable debug output for cleaner results
setDebug(false);

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import asc from 'assemblyscript/dist/asc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find all test files
const testDir = join(__dirname, '../tests/assembly');
const allFiles = readdirSync(testDir);
const testFiles = allFiles.filter(f => f.endsWith('.as.test.ts'));

console.log('Testing Binaryen Coverage Instrumentation on All Files\n');
console.log('='.repeat(80));
console.log(`Found ${testFiles.length} test files`);
console.log('='.repeat(80));

let passCount = 0;
let failCount = 0;
const results = [];

for (const file of testFiles) {
  const testFile = join(testDir, file);
  const shortName = file;

  process.stdout.write(`\n${shortName}... `);

  try {
    // Step 1: Compile with AS compiler
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
      writeFile: (name, contents) => {
        if (name.endsWith('.wasm') && contents instanceof Uint8Array) {
          binary = contents;
        }
      },
    });

    if (result.error || !binary) {
      throw new Error(`AS compilation failed: ${result.error?.message || 'No binary generated'}`);
    }

    // Step 2: Instrument with Binaryen coverage
    const instrumenter = new BinaryenCoverageInstrumenter();
    const { binary: instrumentedBinary, debugInfo } = instrumenter.instrument(binary);

    // Step 3: Basic validation
    if (instrumentedBinary.length === 0) {
      throw new Error('Instrumented binary is empty');
    }

    if (debugInfo.functions.length === 0) {
      throw new Error('No functions instrumented (debug info empty)');
    }

    // Step 4: Try to instantiate (validates WASM is valid)
    const memory = new WebAssembly.Memory({ initial: 1 });
    const coverageData = new Map();

    const imports = {
      env: {
        memory,
        __coverage_trace: (funcIdx, blockIdx) => {
          const key = `${funcIdx}:${blockIdx}`;
          coverageData.set(key, (coverageData.get(key) || 0) + 1);
        },
        abort: () => {}, // Dummy abort
        __register_test: () => {},
        __assertion_pass: () => {},
        __assertion_fail: () => {},
      },
    };

    const instance = await WebAssembly.instantiate(instrumentedBinary, imports);

    // Step 5: Execute _start to trigger coverage
    if (instance.instance.exports._start) {
      instance.instance.exports._start();
    }

    // Success!
    console.log(`✓ PASS (${debugInfo.functions.length} functions, ${coverageData.size} traces)`);
    passCount++;
    results.push({
      file: shortName,
      status: 'PASS',
      functions: debugInfo.functions.length,
      traces: coverageData.size,
    });

  } catch (err) {
    console.log(`✗ FAIL`);
    console.log(`  Error: ${err.message}`);
    failCount++;
    results.push({
      file: shortName,
      status: 'FAIL',
      error: err.message,
    });
  }
}

console.log('\n' + '='.repeat(80));
console.log('SUMMARY:');
console.log('--------');
console.log(`Total: ${testFiles.length} files`);
console.log(`✓ Passed: ${passCount}`);
console.log(`✗ Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\nFailed files:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ${r.file}: ${r.error}`);
  });
}

console.log('='.repeat(80));

process.exit(failCount > 0 ? 1 : 0);
