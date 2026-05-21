import type { File, Suite, Test } from '@vitest/runner/types';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestTaskMeta,
  FailedAssertion,
  WasmImportsFactory,
} from '../types/types.js';
import { AS_POOL_WASM_IMPORTS_ENV, POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { debug } from '../util/debug.js';
import {
  createPoolError,
  createPoolErrorFromAnyError,
  getExpectedMessageOrAny
} from '../util/pool-errors.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';
import { extractCallStack } from './source-maps.js';
import { decodeAbortInfo } from './wasm-memory.js';
import { createWasmConsole } from './wasm-console.js';
import { mergeAssemblyScriptTestOptions } from './collect-options.js';
import { createSuiteTask, createTestTask, failTest } from '../util/vitest-tasks.js';

function createUserWasmImports(
  createWasmImports: WasmImportsFactory | undefined,
  memory: WebAssembly.Memory,
  module: WebAssembly.Module,
  logPrefix: string
) {
  let userEnvImports: WebAssembly.ModuleImports | undefined;
  let userCustomEnvImports: WebAssembly.Imports | undefined;

  if (createWasmImports) {
    try {
      const start = performance.now();
      const userImports: WebAssembly.Imports = createWasmImports({
        memory,
        module,
        utils: {
          liftString: (stringPtr: number) => liftString(memory, stringPtr)
        }
      });
      debug(`${logPrefix} Created user WASM imports for test execution in ${(performance.now() - start).toFixed(2)} ms`);

      userEnvImports = userImports?.env;
      
      if (userEnvImports) {
        userCustomEnvImports = { ...userImports };
        delete userCustomEnvImports.env;
      }
    } catch (error) {
      throw createPoolErrorFromAnyError(
        `Error creating user WASM Imports`,
        POOL_ERROR_NAMES.PoolConfigError,
        error
      );
    }
  }

  return { userEnvImports, userCustomEnvImports };
}

/**
 * Create import object for test discovery
 */
export function createDiscoveryImports(
  memory: WebAssembly.Memory,
  module: WebAssembly.Module,
  file: File,
  handleLog: AssemblyScriptConsoleLogHandler,
  logPrefix: string,
  coverageMemory?: WebAssembly.Memory,
  createWasmImports?: WasmImportsFactory,
): WebAssembly.Imports {
  const suiteStack: Suite[] = [file];

  const {
    userEnvImports,
    userCustomEnvImports
  } = createUserWasmImports(createWasmImports, memory, module, logPrefix);
  
  return {
    env: {
      // users can choose to hide these with their own
      ...createWasmConsole(memory, handleLog),

      // user imports for "env"
      ...(userEnvImports ?? {}),

      memory,

      // handle runtime aborts, which are always unexpected during discovery
      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`${logPrefix} - Unexpected abort during test discovery: ${msgAtLoc}`);

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
    },

    [AS_POOL_WASM_IMPORTS_ENV]: {

      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // stubs during discovery
      __assertion_pass() {},
      __assertion_fail() {},
      __expect_throw() {},
      __end_expect_throw() {},

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
          `${logPrefix} - Registering Suite "${suite.name}" | timeout: ${options.timeout} ms | retry: ${options.retry}`
          + ` | skip: ${options.skip} | only: ${options.only} | fails: ${options.fails} `
          + ` | parent: "${suite.suite?.name}" (parent idx: ${(suite.meta as AssemblyScriptSuiteTaskMeta).idxInParentTasks})`
        );
      },
      
      __end_register_suite(_namePtr: number) {
        const suite = suiteStack.pop();

        debug(
          `${logPrefix} - Registered Suite "${suite?.name}" | ${suite?.tasks.length} top-level tasks | mode: "${suite?.mode}"`
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
        
        debug(`${logPrefix} - Registered test "${test.name}" | mode (pre-interp): "${test.mode}"`
          + ` | fnIndex ${fnIndex} | timeout: ${options.timeout} ms | retry: ${options.retry} | skip: ${options.skip}`
          + ` | only: ${options.only} | fails: ${options.fails} | suite: "${test.suite?.name}"`
          + ` (parent idx: ${(test.meta as AssemblyScriptTestTaskMeta).idxInParentTasks})`
        );
      },
    },

    // user imports for any other environments they defined
    ...(userCustomEnvImports ?? {}),
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
  module: WebAssembly.Module,
  test: Test,
  handleLog: AssemblyScriptConsoleLogHandler,
  logPrefix: string,
  coverageMemory?: WebAssembly.Memory,
  createWasmImports?: WasmImportsFactory,
): { imports: WebAssembly.Imports; provideFunctionTable: (table: WebAssembly.Table) => void; } {
  // execution imports are created per-test, so these represent per-test state
  let isExpectingError: boolean = false;
  let expectedErrorMsgStr: string | undefined;
  let wasmFunctionTable: WebAssembly.Table | undefined;

  const {
    userEnvImports,
    userCustomEnvImports
  } = createUserWasmImports(createWasmImports, memory, module, logPrefix);

  const imports = {
    env: {
      // users can choose to hide these with their own
      ...createWasmConsole(memory, handleLog),

      // user imports for "env"
      ...(userEnvImports ?? {}),

      memory,

      abort(msgPtr: number, filePtr: number, line: number, column: number) {
        const { message, location } = decodeAbortInfo(memory, msgPtr, filePtr, line, column);
        const msgAtLoc = `${message}${location ? ` at ${location}` : ''}`;
        
        debug(`${logPrefix} - Handling test execution abort: ${msgAtLoc}`);

        let failureMessage = message;

        // handle expected aborts for thrown errors
        if (isExpectingError) {
          // TODO: decide if .includes is correct here or not
          if (!expectedErrorMsgStr || message.includes(expectedErrorMsgStr)) {
            // either no specifically expected error (any error), or error message matches
            (test.meta as AssemblyScriptTestTaskMeta).assertionsPassedCount++;
            
            debug(`${logPrefix} - Thrown error matches expected - assertion passes`);

            throw createPoolError(
              `AssemblyScript abort() import called for expected error throw in test "${test.name}"`,
              POOL_ERROR_NAMES.WASMExecutionAbortError
            );
          } else {
            const expected = getExpectedMessageOrAny(expectedErrorMsgStr);

            // error message mismatch
            failureMessage = `expected function to throw error ${expected}, but received error "${message}"`;

            (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push({
              message: failureMessage,
              actualTypeName: 'string',
              expectedTypeName: 'string',
              valuesProvided: true,
              actual: message,
              expected: expectedErrorMsgStr
            } satisfies FailedAssertion);

            const errStr = `Thrown error does not match expected | Expected: ${expected} | Actual: "${message}"`;
            debug(`${logPrefix} - Assertion failed: ${errStr}`);
          }
        }

        // Create error to capture V8 stack trace and extract V8 call stack before throwing.
        // This gives us WAT line:column positions that can be mapped to AS source
        const capturedError = new Error();

        failTest(test, failureMessage, capturedError, logPrefix);

        // Must throw here to halt WASM execution on an assertion or runtime failure for this test.
        // This will be caught by the executor and reported as an appropriate test error
        // using test.meta.lastError value set in failTest()
        throw createPoolError(
          `AssemblyScript abort() import called during test execution for ${test.name}`,
          POOL_ERROR_NAMES.WASMExecutionAbortError,
        );
      },
    },

    [AS_POOL_WASM_IMPORTS_ENV]: {
      
      ...(coverageMemory ? { __coverage_memory: coverageMemory } : {}),

      // stubs during execution
      __register_test() {},
      __begin_register_suite() {},
      __end_register_suite() {},

      __assertion_pass() {
        (test.meta as AssemblyScriptTestTaskMeta).assertionsPassedCount++;
      },

      __assertion_fail(msgPtr: number, actualTypeNamePtr: number, expectedTypeNamePtr: number, valuesProvided: boolean, actualPtr?: number, expectedPtr?: number) {
        const errorMsg = liftString(memory, msgPtr) ?? '';
        const actualTypeName = liftString(memory, actualTypeNamePtr) ?? '';
        const expectedTypeName = liftString(memory, expectedTypeNamePtr) ?? '';
        let valuesMsg = ' | No Values Provided';
        
        const assertionFailure: FailedAssertion = {
          actualTypeName,
          expectedTypeName,
          message: errorMsg,
          valuesProvided: Boolean(valuesProvided)
        };

        (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push(assertionFailure);
        
        if (valuesProvided && actualPtr && expectedPtr) {
          assertionFailure.actual = liftString(memory, actualPtr);
          assertionFailure.expected = liftString(memory, expectedPtr);
          valuesMsg = ` | Actual Type: ${actualTypeName} | Expected Type: ${expectedTypeName}`
            + ` | Actual Value: \`${assertionFailure.actual}\` | Expected Value: \`${assertionFailure.expected}\``;
        }
        
        debug(`${logPrefix} - Assertion failed: ${errorMsg}${valuesMsg}`);
      },

      __expect_throw(fnIndex: number, expectedErrorMsgPtr?: number) {
        isExpectingError = true;
        if (expectedErrorMsgPtr) {
          expectedErrorMsgStr = liftString(memory, expectedErrorMsgPtr);
        }

        debug(`${logPrefix} - Registered expected error throw: ${getExpectedMessageOrAny(expectedErrorMsgStr)}`);

        if (wasmFunctionTable && typeof wasmFunctionTable.get === 'function') {
          const fn = wasmFunctionTable.get(fnIndex);
          if (!fn) {
            throw createPoolError(
              `Could not access function (fnPtr ${fnIndex}) which is expected to throw in test "${test.name}"`,
              POOL_ERROR_NAMES.WASMExecutionHarnessError,
            );
          }

          // successful:
          //   - throws in WASM, calls abort handler
          //   - abort handler confirms error matches expected, does NOT fail test, halts execution with WASMExecutionAbortError
          //   - executor catches WASMExecutionAbortError as 'known' and proceeds to process & report passed test
          // failure (wrong error):
          //   - throws in WASM, calls abort handler
          //   - abort handler confirms error matches mismatch, failTest packages up an appropriate test error
          //   - abort handler halts execution with WASMExecutionAbortError containing test error
          //   - executor catches WASMExecutionAbortError as 'known' and proceeds to process & report test error
          // failure (no error):
          //   - does NOT throw in WASM
          //   - WASM continues executing and calls __end_expect_throw
          //   - __end_expect_throw sees it is STILL expecting an error, failTest packages up an appropriate test error
          //   - __end_expect_throw halts execution with WASMExecutionAbortError containing test error
          //   - executor catches WASMExecutionAbortError as 'known' and proceeds to process & report test error
          debug(`${logPrefix} - Calling function (idx ${fnIndex})`);
          fn();
        } else {
          throw createPoolError(
            `Could not access WASM function table to call function expected to throw in test "${test.name}"`,
            POOL_ERROR_NAMES.WASMExecutionHarnessError,
          );
        }
      },

      __end_expect_throw() {
        if (isExpectingError) {
          const failureMessage = `function did not throw, but was expected to throw error: ${getExpectedMessageOrAny(expectedErrorMsgStr)}`;

          (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push({
              message: failureMessage,
              actualTypeName: 'undefined',
              expectedTypeName: 'string',
              valuesProvided: true,
              actual: undefined,
              expected: expectedErrorMsgStr
            } satisfies FailedAssertion);

          const errStr = `Expected thrown error but got none | Expected: "${expectedErrorMsgStr}"`
          debug(`${logPrefix} - Assertion failed: ${errStr}`);

          failTest(test, failureMessage, new Error(), logPrefix);

          // Must throw here to halt WASM execution on an assertion or runtime failure for this test.
          // This will be caught by the executor and reported as an appropriate test error
          // using test.meta.lastError value set in failTest()
          throw createPoolError(
            `AssemblyScript __end_expect_throw() import called during test execution for ${test.name}`,
            POOL_ERROR_NAMES.WASMExecutionAbortError,
          );
        }
      },
    },

    // user imports for any other environments they defined
    ...(userCustomEnvImports ?? {}),
  };

  return {
    imports,
    provideFunctionTable:  (table: WebAssembly.Table) => {
      debug(`${logPrefix} - Got WASM function table | length: ${table.length}`);
      wasmFunctionTable = table;
    },
  };
}
