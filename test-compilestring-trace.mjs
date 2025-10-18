#!/usr/bin/env node

/**
 * Trace what compileString is doing internally
 */

import asc from 'assemblyscript/dist/asc.js';

const source = `
export function add(a: i32, b: i32): i32 {
  return a + b;
}
`;

console.log('Testing asc.compileString() with traced callbacks...\n');

const stdout = [];
const stderr = [];
let binary = null;

// Patch compileString to trace what it's doing
const originalCompileString = asc.compileString;
asc.compileString = async function(sources, options) {
  console.log('[TRACE] compileString called');
  console.log('[TRACE] sources type:', typeof sources);
  if (typeof sources === 'object') {
    console.log('[TRACE] sources keys:', Object.keys(sources));
  }
  console.log('[TRACE] options:', options);

  // Wrap the options to trace readFile calls
  const wrappedOptions = {
    ...options,
    readFile: (filename) => {
      console.log(`[TRACE] readFile called for: "${filename}"`);
      const result = options.readFile?.(filename);
      console.log(`[TRACE] readFile returned:`, result ? `${result.length} chars` : 'null');
      return result;
    },
    writeFile: (name, contents) => {
      console.log(`[TRACE] writeFile called: "${name}", size: ${contents.length}`);
      return options.writeFile?.(name, contents);
    },
    stdout: (text) => {
      console.log(`[TRACE] stdout:`, text);
      return options.stdout?.(text);
    },
    stderr: (text) => {
      console.log(`[TRACE] stderr:`, text);
      return options.stderr?.(text);
    },
  };

  return originalCompileString.call(this, sources, wrappedOptions);
};

const result = await asc.compileString(source, {
  readFile: (filename) => {
    // This shouldn't be called for compileString
    console.log('[USER] readFile called (UNEXPECTED):', filename);
    return null;
  },
  stdout: (text) => {
    stdout.push(text);
  },
  stderr: (text) => {
    stderr.push(text);
  },
  writeFile: (name, contents) => {
    console.log('[USER] writeFile called:', name);
    if (name.endsWith('.wasm')) {
      binary = contents;
    }
  },
  optimizeLevel: 0,
  runtime: 'stub',
});

console.log('\n=== RESULT ===');
console.log('error:', result.error);
console.log('Binary generated:', !!binary || !!result.binary);

if (stderr.length > 0) {
  console.log('\nStderr:');
  console.log(stderr.join(''));
}
