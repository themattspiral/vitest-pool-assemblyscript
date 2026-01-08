import { basename } from 'node:path';
import type { File, Suite, Test } from '@vitest/runner/types';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestTaskMeta,
  FailedAssertion,
} from '../types/types.js';
import { POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import { createPoolError } from '../util/pool-errors.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';
import { extractCallStack } from './source-maps.js';
import { decodeAbortInfo } from './wasm-memory.js';
import { createWasmConsole } from './wasm-console.js';
import { createSuiteTask, createTestTask, failTest } from '../util/vitest-tasks.js';
import { mergeAssemblyScriptTestOptions } from './collect-options.js';

/**
 * Create import object for test discovery
 */
export function createDiscoveryImports(
  memory: WebAssembly.Memory,
  file: File,
  handleLog: AssemblyScriptConsoleLogHandler,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  const base = basename(file.filepath);
  const suiteStack: Suite[] = [file];
  
  return {
    env: {
      memory,

      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // stubs during discovery
      __assertion_pass() {},
      __assertion_fail() {},

      __begin_register_suite(
        namePtr: number,
        timeout: number,
        retry: number,
        skip: number,
        only: number,
        fails: number,
      ) {
        const parentSuite = suiteStack[suiteStack.length - 1]!;
        const defaultTestOptions = (parentSuite.meta as AssemblyScriptSuiteTaskMeta).defaultTestOptions;
        const suiteName = liftString(memory, namePtr) ?? 'unknown suite';
        const options = mergeAssemblyScriptTestOptions(defaultTestOptions, timeout, retry, skip, only, fails);
        const suite = createSuiteTask(suiteName, file, parentSuite, options);
        suiteStack.push(suite);

        debug(
          `[Executor] ${base} - Registering Suite: "${suiteName}" | timeout: ${options.timeout}ms | retry: ${options.retry}`
          + ` | skip: ${options.skip} | only: ${options.only} | fails: ${options.fails} `
          + ` | parent: "${suite.suite?.name}" (parent idx: ${(suite.meta as AssemblyScriptSuiteTaskMeta).idxInParentTasks})`
        );
      },
      
      __end_register_suite(_namePtr: number) {
        const suite = suiteStack.pop();

        debug(
          `[Executor] ${base} - Registered ${suite?.tasks.length} tasks in Suite: "${suite?.name}" | mode: "${suite?.mode}"`
          + ` | parent: "${suite?.suite?.name}" (parent idx: ${(suite?.meta as AssemblyScriptSuiteTaskMeta)?.idxInParentTasks})`
        );
      },

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
        const parentSuite = suiteStack[suiteStack.length - 1]!;
        const defaultTestOptions = (parentSuite.meta as AssemblyScriptSuiteTaskMeta).defaultTestOptions;
        const testName = liftString(memory, namePtr) ?? 'unknown test';
        const options = mergeAssemblyScriptTestOptions(defaultTestOptions, timeout, retry, skip, only, fails);
        const test = createTestTask(testName, fnIndex, file, parentSuite, options);
        
        debug(`[Executor] ${base} - Registered test: "${testName}" | mode (pre-interp): "${test.mode}"`
          + ` | fnIndex ${fnIndex} | timeout: ${options.timeout}ms | retry: ${options.retry} | skip: ${options.skip}`
          + ` | only: ${options.only} | fails: ${options.fails} | suite: "${test.suite?.name}"`
          + ` (parent idx: ${(test.meta as AssemblyScriptTestTaskMeta).idxInParentTasks})`
        );
      },

      // handle runtime aborts, which are always unexpected during discovery
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`[Executor] ${base} - Unexpected abort during test discovery: ${msgAtLoc}`);

        // Create error to capture V8 stack trace and extract V8 call stack before throwing.
        // This gives us WAT line:column positions that can be mapped to AS source
        const rawCallStack = extractCallStack(new Error());

        // Send the test error that we will report to vitest in the PoolError's `cause` field.
        // The rawCallStack will be enahnced and deleted by the executor, with the parsed result
        // added to the reported test error.
        const testError: AssemblyScriptTestError = {
          message,
          name: TEST_ERROR_NAMES.WASMRuntimeError,
        };

        throw createPoolError(
          msgAtLoc,
          POOL_ERROR_NAMES.WASMExecutionAbortError,
          undefined,  // stack
          testError,  // cause
          rawCallStack
        );
      },

      ...createWasmConsole(memory, handleLog),
    },
  };
}

/**
 * Create import object for test execution
 *
 * Used during test execution to capture test results / assertions, and to handle
 * runtime aborts as expected cases for test execution by capturing the error on the test meta.
 */
export function createTestExecutionImports(
  memory: WebAssembly.Memory,
  test: Test,
  handleLog: AssemblyScriptConsoleLogHandler,
  coverageMemory?: WebAssembly.Memory
): WebAssembly.Imports {
  const context = `${basename(test.file.filepath)} - "${test.name}"`;

  return {
    env: {
      memory,
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // stubs during execution
      __register_test() {},
      __begin_register_suite() {},
      __end_register_suite() {},

      __assertion_pass() {
        (test.meta as AssemblyScriptTestTaskMeta).assertionsPassedCount++;
      },

      __assertion_fail(msgPtr: number, typeNamePtr: number, valuesProvided: boolean, expected?: any, actual?: any) {
        const errorMsg = liftString(memory, msgPtr);
        const assertionValueType = liftString(memory, typeNamePtr);
        
        const assertionFailure: FailedAssertion = {
          message: errorMsg,
          typeName: assertionValueType,
          valuesProvided
        };
        
        if (valuesProvided && test.result) {
          // coerce to appropriate JS type based on AS type, for nicer diff formatting
          if (assertionValueType === 'bool') {
            assertionFailure.expected = Boolean(expected);
            assertionFailure.actual = Boolean(actual);
          } else {
            assertionFailure.expected = expected;
            assertionFailure.actual = actual;
          }
        }
        
        (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push(assertionFailure);
        
        const valuesMsg = valuesProvided ? ` | Value Type: ${assertionValueType}`
          + ` | Expected: \`${expected !== undefined ? expected : ''}\` | Actual: \`${actual !== undefined ? actual : ''}\``
          : '';
        debug(`[Executor] ${context} - Assertion failed: ${errorMsg}${valuesMsg}`);
      },

      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`[Executor] ${context} - Handling test execution abort: ${msgAtLoc}`);

        // Create error to capture V8 stack trace and extract V8 call stack before throwing.
        // This gives us WAT line:column positions that can be mapped to AS source
        const capturedError = new Error();

        failTest(test, message, capturedError, 'Executor', context);

        // Must throw here to halt WASM execution on an assert() failure for this test.
        // This will be caught by the executor and reported as an appropriate test error
        // using test.meta.lastError value set above.
        throw createPoolError(
          `AssemblyScript abort() import called during test execution for ${test.name}`,
          POOL_ERROR_NAMES.WASMExecutionAbortError,
        );
      },

      ...createWasmConsole(memory, handleLog),
    },
  };
}
