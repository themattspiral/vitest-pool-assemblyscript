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
import { decodeAbortInfo } from './wasm-memory.js';
import { createWasmConsole } from './wasm-console.js';
import { debug } from '../util/debug.js';
import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptTestError,
  AssemblyScriptTestOptions,
  DiscoveredTests,
  ExecuteTestResultRef,
  TestErrorName
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';

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
  handleLog: AssemblyScriptConsoleLogHandler,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // called by test() to register test names and function indices
      __register_test(
        namePtr: number,
        fnIndex: number,
        timeout: number,
        retry: number,
        skip: number,
        only: number,
        fails: number,
      ) {
        const testName = liftString(memory, namePtr) ?? 'unknown test';

        // unique id for the test within the binary, allowing for duplicated test names
        const id = `${testName}_${fnIndex}`;

        const options = { ...defaultTestOptions };
        if (timeout >= 0) {
          options.timeout = timeout;
        }
        if (retry >= 0) {
          options.retry = retry;
        }
        if (skip >= 0) {
          options.skip = skip === 0 ? false : true;
        }
        if (only >= 0) {
          options.only = only === 0 ? false : true;
        }
        if (fails >= 0) {
          options.fails = fails === 0 ? false : true;
        }

        // create DiscoveredTest
        mutableTestsCollection[id] = {
          fnIndex,
          id,
          name: testName,
          options,
          isResolvedToRun: !options.skip
        };
        
        debug(`[Executor] Registered test: "${testName}" with fnIndex ${fnIndex} | timeout: ${options.timeout}ms`
          + ` | retry: ${options.retry} | skip: ${options.skip} | only: ${options.only} | fails: ${options.fails}`
        );
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

      trace(msgPtr: number, n: number, a0: any, a1: any, a2: any, a3: any) {
        const msg = liftString(memory, msgPtr);

        console.trace(`WASM Trace${n !== undefined ? ` (${String(n)})` : ''}:${msg ? ` ${msg}` : ''}`, a0, a1, a2, a3);
      },

      ...createWasmConsole(memory, handleLog),
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
  handleLog: AssemblyScriptConsoleLogHandler,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // Test registration callback (no-op during execution)
      __register_test() {},

      // Assertion tracking
      __assertion_pass() {
        if (mutableTestResultRef.value) {
          mutableTestResultRef.value.assertionsPassed++;
        }
      },
      __assertion_fail(msgPtr: number, typeNamePtr: number, valuesProvided: boolean, expected?: any, actual?: any) {
        if (mutableTestResultRef.value) {
          mutableTestResultRef.value.assertionsFailed++;
          
          const assertionValueType = liftString(memory, typeNamePtr);

          if (valuesProvided) {
            mutableTestResultRef.value.valuesProvided = true;

            // coerce to appropriate JS type based on AS type, for nicer diff formatting
            if (assertionValueType === 'bool') {
              mutableTestResultRef.value.expected = Boolean(expected);
              mutableTestResultRef.value.actual = Boolean(actual);
            } else {
              mutableTestResultRef.value.expected = expected;
              mutableTestResultRef.value.actual = actual;
            }
          }

          const errorMsg = liftString(memory, msgPtr);
          
          const valuesMsg = valuesProvided ? ` | Value Type: ${assertionValueType}`
            + ` | Expected: \`${expected !== undefined ? expected : ''}\` | Actual: \`${actual !== undefined ? actual : ''}\``
            : '';
          debug(`[Executor] Assertion failed: ${errorMsg}${valuesMsg}`);
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

      trace(msgPtr: number, n: number, a0: any, a1: any, a2: any, a3: any) {
        const msg = liftString(memory, msgPtr);

        console.trace(`WASM Trace${n !== undefined ? ` (${String(n)})` : ''}:${msg ? ` ${msg}` : ''}`, a0, a1, a2, a3);
      },

      ...createWasmConsole(memory, handleLog),
    },
  };
}
