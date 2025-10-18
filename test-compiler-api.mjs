#!/usr/bin/env node

/**
 * Standalone test script to verify AssemblyScript compiler API
 * This helps us understand how to properly use asc.main() or asc.compileString()
 */

import asc from 'assemblyscript/dist/asc.js';

console.log('=== Testing AssemblyScript Compiler API ===\n');

// Simple AS source code
const simpleSource = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}
`;

console.log('Source code:');
console.log(simpleSource);
console.log('\n--- Test 1: Using asc.main() with stdin ---\n');

try {
  const stdoutLines = [];
  const stderrLines = [];
  let binary = null;

  // Create stream-like objects for stdout/stderr
  const stdout = {
    write: (text) => {
      stdoutLines.push(text);
      return true;
    }
  };

  const stderr = {
    write: (text) => {
      stderrLines.push(text);
      return true;
    }
  };

  // Note: --stdin is not a real option, this test will fail
  // but we're keeping it to demonstrate stdin doesn't work
  const exitCode = await asc.main([
    '--outFile', 'output.wasm',
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--debug',
  ], {
    stdin: simpleSource,
    stdout,
    stderr,
    writeFile: (name, contents) => {
      console.log(`✓ writeFile called: ${name}, size: ${contents.length} bytes`);
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    readFile: () => null,
    listFiles: () => [],
  });

  console.log(`Exit code: ${exitCode}`);
  console.log(`Binary generated: ${!!binary}`);
  console.log(`Binary size: ${binary?.length || 0} bytes`);

  if (stdoutLines.length > 0) {
    console.log('\nStdout:');
    console.log(stdoutLines.join(''));
  }

  if (stderrLines.length > 0) {
    console.log('\nStderr:');
    console.log(stderrLines.join(''));
  }

  if (exitCode === 0 && binary) {
    console.log('\n✓ Test 1 PASSED: stdin approach works!\n');
  } else {
    console.log('\n✗ Test 1 FAILED: stdin approach did not work\n');
  }
} catch (error) {
  console.error('✗ Test 1 ERROR:', error);
}

console.log('\n--- Test 2: Using asc.compileString() ---\n');

try {
  const stdout = [];
  const stderr = [];
  let binary = null;

  const result = await asc.compileString(simpleSource, {
    stdout: (text) => {
      stdout.push(text);
    },
    stderr: (text) => {
      stderr.push(text);
    },
    writeFile: (name, contents) => {
      console.log(`✓ writeFile called: ${name}, size: ${contents.length} bytes`);
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    optimizeLevel: 0,
    runtime: 'stub',
    binaryFile: 'output.wasm',
  });

  console.log('Result keys:', Object.keys(result));
  console.log(`Error: ${result.error}`);
  console.log(`Binary generated: ${!!binary}`);
  console.log(`Binary size: ${binary?.length || 0} bytes`);

  if (stdout.length > 0) {
    console.log('\nStdout:');
    console.log(stdout.join(''));
  }

  if (stderr.length > 0) {
    console.log('\nStderr:');
    console.log(stderr.join(''));
  }

  if (!result.error && binary) {
    console.log('\n✓ Test 2 PASSED: compileString approach works!\n');
  } else {
    console.log('\n✗ Test 2 FAILED: compileString approach did not work\n');
  }
} catch (error) {
  console.error('✗ Test 2 ERROR:', error);
}

console.log('\n--- Test 3: Using temp file approach ---\n');

import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

try {
  // Create temp directory
  const tempDir = './temp-test';
  mkdirSync(tempDir, { recursive: true });

  const tempFile = join(tempDir, 'test.ts');
  const outFile = join(tempDir, 'output.wasm');

  // Write source to temp file
  writeFileSync(tempFile, simpleSource, 'utf8');
  console.log(`✓ Wrote source to ${tempFile}`);

  const stdoutLines = [];
  const stderrLines = [];
  let binary = null;

  const stdout = {
    write: (text) => {
      stdoutLines.push(text);
      return true;
    }
  };

  const stderr = {
    write: (text) => {
      stderrLines.push(text);
      return true;
    }
  };

  const exitCode = await asc.main([
    tempFile,
    '--outFile', outFile,
    '--optimizeLevel', '0',
    '--runtime', 'stub',
    '--debug',
  ], {
    stdout,
    stderr,
    readFile: (filename) => {
      if (filename === tempFile) {
        return simpleSource;
      }
      return null;
    },
    writeFile: (name, contents) => {
      console.log(`✓ writeFile called: ${name}, size: ${contents.length} bytes`);
      if (name.endsWith('.wasm')) {
        binary = contents;
      }
    },
    listFiles: () => [],
  });

  console.log(`Exit code: ${exitCode} (type: ${typeof exitCode})`);
  console.log(`Binary captured: ${!!binary}`);
  console.log(`Binary size: ${binary?.length || 0} bytes`);

  if (stdoutLines.length > 0) {
    console.log('\nStdout:');
    console.log(stdoutLines.join(''));
  }

  if (stderrLines.length > 0) {
    console.log('\nStderr:');
    console.log(stderrLines.join(''));
  }

  // Cleanup
  try {
    unlinkSync(tempFile);
    unlinkSync(outFile);
  } catch (e) {
    // Ignore cleanup errors
  }

  // Check if compilation succeeded (binary was generated)
  if (binary && binary.length > 0) {
    console.log('\n✅ Test 3 PASSED: temp file approach works!\n');
  } else {
    console.log('\n✗ Test 3 FAILED: temp file approach did not work\n');
  }
} catch (error) {
  console.error('✗ Test 3 ERROR:', error);
}

console.log('\n=== Summary ===');
console.log('Check which approach(es) worked above.');
console.log('This will inform how we implement the Vitest plugin.\n');
