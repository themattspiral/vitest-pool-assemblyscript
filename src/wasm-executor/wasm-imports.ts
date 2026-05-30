import type { File, Suite, Test } from '@vitest/runner/types';

import type {
  AssemblyScriptConsoleLogHandler,
  AssemblyScriptSuiteTaskMeta,
  AssemblyScriptTestError,
  AssemblyScriptTestTaskMeta,
  FailedAssertion,
  WasmImportsFactory,
} from '../types/types.js';
import {
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME,
  POOL_ERROR_NAMES,
  TEST_ERROR_NAMES
} from '../types/constants.js';
import { debug } from '../util/debug.js';
import { abortWASMExecution, abortWASMExecutionOnSuccess, createPoolError, getExpectedMessageOrAny } from '../util/pool-errors.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';
import { decodeAbortInfo } from './wasm-memory.js';
import { createWasmConsole } from './wasm-console.js';
import { mergeAssemblyScriptTestOptions } from './collect-options.js';
import { createSuiteTask, createTestTask, failTestAssertionError, failTestRuntimeError } from '../util/vitest-tasks.js';

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
      const msg = `Could not create user WasmImportsFactory.`
        + ` Ensure that your module has a default export matching () => WebAssembly.Imports`;
      throw createPoolError(
        POOL_ERROR_NAMES.WASMUserImportsError,
        msg,
        error,
        true
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

        const testError: AssemblyScriptTestError = {
          message,
          name: TEST_ERROR_NAMES.WASMRuntimeError,
        };

        throw abortWASMExecution(testError, new Error());
      },
    },

    [AS_POOL_WASM_IMPORTS_MODULE_NAME]: {

      ...(coverageMemory ? { [AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME]: coverageMemory } : {}),

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
  let lastFailedAssertion: FailedAssertion | undefined;
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

            // abort without failing the test
            throw abortWASMExecutionOnSuccess();
          } else {
            const expected = getExpectedMessageOrAny(expectedErrorMsgStr);

            // error message mismatch
            failureMessage = `expected function to throw error ${expected}, but received error "${message}"`;

            lastFailedAssertion = {
              message: failureMessage,
              actualTypeName: 'string',
              expectedTypeName: 'string',
              valuesProvided: true,
              actual: message,
              expected: expectedErrorMsgStr
            };

            const errStr = `Thrown error does not match expected | Expected: ${expected} | Actual: "${message}"`;
            debug(`${logPrefix} - Assertion failed: ${errStr}`);
          }
        }

        const testError = lastFailedAssertion
          ? failTestAssertionError(test, lastFailedAssertion)
          : failTestRuntimeError(test, '', failureMessage);

        throw abortWASMExecution(testError, new Error());
      },
    },

    [AS_POOL_WASM_IMPORTS_MODULE_NAME]: {
      
      ...(coverageMemory ? { [AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME]: coverageMemory } : {}),

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
        
        lastFailedAssertion = {
          actualTypeName,
          expectedTypeName,
          message: errorMsg,
          valuesProvided: Boolean(valuesProvided)
        };

        (test.meta as AssemblyScriptTestTaskMeta).assertionsFailed.push(lastFailedAssertion);
        
        if (valuesProvided && actualPtr && expectedPtr) {
          lastFailedAssertion.actual = liftString(memory, actualPtr);
          lastFailedAssertion.expected = liftString(memory, expectedPtr);
          valuesMsg = ` | Actual Type: ${actualTypeName} | Expected Type: ${expectedTypeName}`
            + ` | Actual Value: \`${lastFailedAssertion.actual}\` | Expected Value: \`${lastFailedAssertion.expected}\``;
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
              POOL_ERROR_NAMES.WASMExecutionHarnessError,
              `Could not access function (fnPtr ${fnIndex}) which is expected to throw in test "${test.name}"`,
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
            POOL_ERROR_NAMES.WASMExecutionHarnessError,
            `Could not access WASM function table to call function expected to throw`,
          );
        }
      },

      __end_expect_throw() {
        if (isExpectingError) {
          const errStr = `Expected thrown error but got none | Expected: "${expectedErrorMsgStr}"`;
          debug(`${logPrefix} - Assertion failed: ${errStr}`);
          
          const failureMessage = `function did not throw, but was expected to throw error: ${getExpectedMessageOrAny(expectedErrorMsgStr)}`;
          const testError = failTestAssertionError(test, {
            message: failureMessage,
            actualTypeName: 'undefined',
            expectedTypeName: 'string',
            valuesProvided: true,
            actual: undefined,
            expected: expectedErrorMsgStr
          });

          // Must throw here to halt WASM execution on an assertion or runtime failure for this test.
          // This will be caught by the executor and reported as an appropriate test error
          throw abortWASMExecution(testError);
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
