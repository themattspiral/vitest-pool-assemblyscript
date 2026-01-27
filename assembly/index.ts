/**
 * Test framework with per-test crash isolation support
 *
 * Execution flow:
 * 1. Instantiation: Pool creates WASM instance with import callbacks
 * 2. Registration: _start() runs, top-level test() calls invoke __register_test callback
 * 3. Discovery: Pool receives test names + function indices via callbacks
 * 4. Execution: Pool calls table.get(fnIndex)() directly via exported function table
 */

export * from './describe';
export * from './expect';
export * from './options';
export * from './test';
