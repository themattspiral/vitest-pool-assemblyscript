/**
 * WASM Import Object Creators
 *
 * This module provides functions for creating WebAssembly import objects
 * for different execution phases:
 * - Test discovery (registration phase)
 * - Test execution (clean binary)
 * - Coverage collection (instrumented binary)
 */

import { extractCallStack } from './source-maps.js';
import { decodeString, decodeAbortInfo } from './wasm-memory.js';
import { debug } from '../util/debug.js';
import type {
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  DiscoveredTests,
  ExecuteTestResultRef,
  TestErrorName
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';


/**
 * Create import object for test discovery
 *
 * When the binary is instrumented (has coverage memory import), we must provide a coverage memory
 * that matches the import definitions even though we're not collecting coverage during discovery.
 *
 * @param memory - WebAssembly memory instance
 * @param mutableTestsCollection - Collection of registered tests (mutated by __register_test callback)
 * @param coverageMemory - Optional coverage memory (required if binary is instrumented)
 * @returns WebAssembly import object
 */
export function createDiscoveryImports(
  memory: WebAssembly.Memory,
  mutableTestsCollection: DiscoveredTests,
  defaultTestOptions: AssemblyScriptTestOptions,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // called by test() to register test names and function indices
      __register_test(namePtr: number, nameLen: number, fnIndex: number) {
        const testName = decodeString(memory, namePtr, nameLen);

        // unique id for the test within the binary, allowing for duplicated test names
        const id = `${testName}_${fnIndex}`;

        // create DiscoveredTest
        mutableTestsCollection[id] = {
          fnIndex,
          id,
          name: testName,
          options: defaultTestOptions  // TODO use user-provided per-test options
        };
        
        debug(`[Executor] Registered test: "${testName}" with fnIndex ${fnIndex}`);
      },

      // stubs during discovery
      __assertion_pass() {},
      __assertion_fail() {},

      // handle runtime aborts, which are always unexpected during discovery
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`[Executor] Unexpected abort during test discovery: ${msgAtLoc}`);

        // Create error to capture V8 stack trace and extract V8 call stack before throwing.
        // This gives us WAT line:column positions that can be mapped to AS source
        const capturedError = new Error(message);
        const rawCallStack = extractCallStack(capturedError);

        // Send the test error that we will report to vitest in the PoolError's `cause` field.
        // The rawCallStack will be mapped & parsed by the executor before reporting.
        const testError: AssemblyScriptTestError = {
          message: msgAtLoc,
          name: TEST_ERROR_NAMES.WASMRuntimeError,
          rawCallStack
        };

        const poolError = createPoolError(
          msgAtLoc,
          POOL_ERROR_NAMES.WASMExecutionAbortError,
          undefined,  // stack
          testError   // cause 
        );

        throw poolError;
      },

      trace(_msg: any, n: any, a0: any, a1: any, a2: any, a3: any) {
        console.log(`WASM trace${n !== undefined ? ` (${String(n)})` : ''}:`, a0, a1, a2, a3);
      }
    },
  };
}

/**
 * Create import object for test execution
 *
 * Used during test execution to capture test results / assertions, and to handle
 * runtime aborts as expected cases for test execution by capturing the error on the test result.
 *
 * @param memory - WebAssembly memory instance
 * @param mutableTestResultRef - Mutable reference to current test result (updated by imports)
 * @param coverageMemory - Optional coverage memory for instrumented binaries
 * @returns WebAssembly import object
 */
export function createTestExecutionImports(
  memory: WebAssembly.Memory,
  mutableTestResultRef: ExecuteTestResultRef,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // Test registration callback (no-op during execution)
      __register_test(_namePtr: number, _nameLen: number, _fnIndex: number) {},

      // Assertion tracking
      __assertion_pass() {
        if (mutableTestResultRef.value) {
          mutableTestResultRef.value.assertionsPassed++;
        }
      },
      __assertion_fail<T>(msgPtr: number, msgLen: number, expected?: T, actual?: T) {
        if (mutableTestResultRef.value) {
          mutableTestResultRef.value.assertionsFailed++;
          mutableTestResultRef.value.expected = expected;
          mutableTestResultRef.value.actual = actual;
          const errorMsg = decodeString(memory, msgPtr, msgLen);
          debug(`[Executor] Assertion failed: "${errorMsg}" | Expected: \`${expected !== undefined ? expected : ''}\` | Actual: \`${actual !== undefined ? actual : ''}\``);
        }
      },

      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`[Executor] Handling test execution abort: ${msgAtLoc}`);

        let errorName: TestErrorName = TEST_ERROR_NAMES.WASMRuntimeError;
        let isAssertionFailure: boolean = false;

        if (mutableTestResultRef.value) {
          // set test result to failed
          mutableTestResultRef.value.passed = false;
          
          // determine if this was an assertion failure
          if (mutableTestResultRef.value.assertionsFailed > 0) {
            isAssertionFailure = true;
            errorName = TEST_ERROR_NAMES.AssertionError;
          }

          // Create error to capture V8 stack trace and extract V8 call stack before throwing.
          // This gives us WAT line:column positions that can be mapped to AS source
          const capturedError = new Error(message);
          mutableTestResultRef.value.rawCallStack = extractCallStack(capturedError);
          
          // Set error to report to vitest on the test result.
          // Stack gets updated when executor enhances/source-maps the error.
          const testError: AssemblyScriptTestError = {
            name: errorName,
            message: message
          };
          mutableTestResultRef.value.error = testError;

          // set actual and expected values as strings, if provided
          if (isAssertionFailure) {
            mutableTestResultRef.value.error.expected = mutableTestResultRef.value.expected !== undefined
              ? String(mutableTestResultRef.value.expected) : undefined;
            mutableTestResultRef.value.error.actual = mutableTestResultRef.value.actual !== undefined
              ? String(mutableTestResultRef.value.actual) : undefined;
          }

          debug('[Executor] Captured raw V8 call stack with', mutableTestResultRef.value.rawCallStack.length, 'frames');
        }

        // Must throw here to halt WASM execution on an assert() failure for this test.
        // This will be caught by the executor and reported as an appropriate test error
        // using the testResultRef.value.error value set above.
        throw createPoolError(
          `AssemblyScript abort() import called during test execution for ${mutableTestResultRef.value?.name}`,
          POOL_ERROR_NAMES.WASMExecutionAbortError,
        );
      },

      trace(_msg: any, n: any, a0: any, a1: any, a2: any, a3: any) {
        console.log(`WASM trace${n !== undefined  ? ` (${String(n)})` : ''}:`, a0, a1, a2, a3);
      }
    },
  };
}
