/**
 * Debug script to inspect Vitest context
 */
import type { Vitest } from 'vitest/node';
import createAssemblyScriptPool from './src/pool.js';

// Create a minimal ctx to inspect available methods
const fakeCtx = {
  config: {
    root: process.cwd(),
  },
  // Add a console logger
  logger: console,
  state: {
    clearFiles: () => {},
  }
} as unknown as Vitest;

console.log('Available properties on ctx:');
console.log(Object.keys(fakeCtx));

// Try to find the right reporting method
console.log('\nChecking for reporting methods:');
console.log('_reportFileTask:', typeof (fakeCtx as any)._reportFileTask);
console.log('reportFileTask:', typeof (fakeCtx as any).reportFileTask);
console.log('state:', typeof fakeCtx.state);
