import type { Suite, Test } from '@vitest/runner/types';
import type { SerializedDiffOptions } from '@vitest/utils/diff';
import type { RawSourceMap } from 'source-map';

import type {
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  PoolErrorName,
} from '../types/types.js';
import {
  AS_POOL_ERROR_FLAG,
  POOL_ERROR_NAMES,
  TEST_ERROR_NAMES
} from '../types/constants.js';
import { getYellowString } from './test-error-formatting.js';
import { extractCallStack } from '../wasm-executor/source-maps.js';
import { enhanceTestError } from '../wasm-executor/wasm-errors.js';

export function abortWASMExecutionOnSuccess(): AssemblyScriptPoolError {
  return {
    [AS_POOL_ERROR_FLAG]: true,
    name: POOL_ERROR_NAMES.WASMExecutionAbortSuccess,
    testError: {} as AssemblyScriptTestError,
    originalErrorMayContainJS: false,
    originalErrorRawStack: [],
    applyStackToTestErrorCause: false
  };
}

export function abortWASMExecution(
  testError: AssemblyScriptTestError,
  errorForStack?: Error,
): AssemblyScriptPoolError {
  return {
    [AS_POOL_ERROR_FLAG]: true,
    name: POOL_ERROR_NAMES.WASMExecutionAbortError,
    testError,
    originalErrorMayContainJS: false,
    originalErrorRawStack: errorForStack ? extractCallStack(errorForStack) : [],
    applyStackToTestErrorCause: false
  };
}

export function wrapPoolError(
  name: PoolErrorName,
  originalError: any,
  originalErrorMayContainJS: boolean = false,
): AssemblyScriptPoolError {
  let originalErrorName: string | undefined;
  let originalErrorMessage: string;
  let originalErrorRawStack: NodeJS.CallSite[];

  if (originalError && originalError instanceof Error) {
    originalErrorName = originalError.name;
    originalErrorMessage = originalError.message;
    originalErrorRawStack = extractCallStack(originalError);
  } else if (originalError) {
    originalErrorMessage = String(originalError);
    originalErrorRawStack = [];
  } else {
    originalErrorMessage = 'Unknown Error';
    originalErrorRawStack = [];
  }

  const namePrefix = originalErrorName ? `${originalErrorName}: ` : '';
  const testError: AssemblyScriptTestError = {
    name,
    message: `${namePrefix}${originalErrorMessage}`
  };

  return {
    [AS_POOL_ERROR_FLAG]: true,
    name,
    message: 'Wrapped error',
    originalErrorRawStack,
    originalErrorMayContainJS,
    testError,
    applyStackToTestErrorCause: false
  };
}

export function createPoolError(
  name: PoolErrorName,
  message: string,
  originalError?: any,
  originalErrorMayContainJS: boolean = true,
): AssemblyScriptPoolError {
  if (originalError && originalError[AS_POOL_ERROR_FLAG]) {
    return originalError;
  }

  let originalErrorRawStack: NodeJS.CallSite[] = [];
  let applyStackToTestErrorCause: boolean = false;
  const testError: AssemblyScriptTestError = {
    name,
    message
  };

  if (originalError && originalError instanceof Error) {
    testError.cause = {
      name: originalError.name,
      message: `${originalError.message}`
    };
    originalErrorRawStack = extractCallStack(originalError);
    applyStackToTestErrorCause = true;
  } else if (originalError) {
    testError.cause = {
      name: POOL_ERROR_NAMES.PoolError,
      message: String(originalError)
    }
  }

  return {
    [AS_POOL_ERROR_FLAG]: true,
    name,
    message,
    originalErrorRawStack,
    originalErrorMayContainJS,
    testError,
    applyStackToTestErrorCause
  };
}

export function createTestTimeoutError(
  test: Test
): AssemblyScriptTestError {
  const message = `Test timed out after ${test.timeout}ms`;
  const err: AssemblyScriptTestError = {
    name: POOL_ERROR_NAMES.WASMExecutionTimeoutError,
    message,
    stack: `${test.id}_${message}`,
    diff: getYellowString(` Test Timeout Exceeded (${test.timeout}ms)`)
  };
  return err;
}

export function createTestExpectedToFailError(test: Test): AssemblyScriptTestError {
  const message = `Test is expected to fail, but all assertion(s) passed`;
  const err: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.AssertionError,
    message,
    stack: `${test.id}_${message}`,
    diff: getYellowString(` Expected to fail, but all assertion(s) passed`)
  };
  return err;
}

function isAbortErrorString(item: any): boolean {
  return item === POOL_ERROR_NAMES.PoolRunAbortedError || item === 'AbortError';
}

export function isAbortError(error: any): boolean {
  return isAbortErrorString(error) 
    || isAbortErrorString(error?.name)
    || error?.message === 'Terminating worker thread';
}

export function getExpectedMessageOrAny(expectedMsgStr?: string): string {
  return expectedMsgStr ? `"${expectedMsgStr}"` : '<any>';
}

export async function buildEnhancedFileError(
  error: any,
  task: Test | Suite,
  sourceMap: RawSourceMap | undefined,
  logPrefix: string,
  projectRoot: string,
  unexpectedContext: string,
  diffOptions?: SerializedDiffOptions,
): Promise<AssemblyScriptTestError> {
  let testError: AssemblyScriptTestError;
  let stack: NodeJS.CallSite[];
  let applyStackToTestErrorCause: boolean;
  let allowStackJS: boolean;

  if (error && error[AS_POOL_ERROR_FLAG]) {
    const wrapper = error as AssemblyScriptPoolError;
    testError = wrapper.testError;
    stack = wrapper.originalErrorRawStack;
    applyStackToTestErrorCause = wrapper.applyStackToTestErrorCause;
    allowStackJS = wrapper.originalErrorMayContainJS;
  } else if (error instanceof Error) {
    testError = {
      name: POOL_ERROR_NAMES.PoolError,
      message: `${error.name}: ${error.message}`
    };
    stack = extractCallStack(error);
    allowStackJS = true;
    applyStackToTestErrorCause = false;
  } else {
    testError = {
      name: POOL_ERROR_NAMES.PoolError,
      message: `Unexpected error (${unexpectedContext}): ${String(error)}`
    };
    stack = extractCallStack(new Error());
    allowStackJS = true;
    applyStackToTestErrorCause = false;
  }

  await enhanceTestError(
    testError,
    task,
    sourceMap,
    logPrefix,
    allowStackJS,
    projectRoot,
    applyStackToTestErrorCause,
    stack,
    diffOptions
  );

  return testError;
}
