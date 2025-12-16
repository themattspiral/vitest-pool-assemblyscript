/**
 * vitest-pool-assemblyscript
 *
 * AssemblyScript testing with Vitest - Simple, fast, familiar, AS-native, with full coverage output
 *
 * Package entry point - exports the pool factory for Vitest configuration
 */

export { default } from './pool/index.js';

// Internal Pool Testing
export type { CompileResult, ExecuteTestResult as TestResult, AssemblyScriptPoolOptions } from './types.js';
export { compileAssemblyScript } from './compiler/index.js';
