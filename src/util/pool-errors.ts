import type { Test } from '@vitest/runner/types';

import type {
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  PoolErrorName,
} from '../types/types.js';
import {
  AS_POOL_ERROR_WRAPPER_FLAG,
  POOL_ERROR_NAMES,
  TEST_ERROR_NAMES
} from '../types/constants.js';
import { getYellowString } from './test-error-formatting.js';
import { extractCallStack } from '../wasm-executor/source-maps.js';

export function abortWASMExecutionOnSuccess(): AssemblyScriptPoolError {
  return {
    [AS_POOL_ERROR_WRAPPER_FLAG]: true,
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
    [AS_POOL_ERROR_WRAPPER_FLAG]: true,
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
    [AS_POOL_ERROR_WRAPPER_FLAG]: true,
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
    [AS_POOL_ERROR_WRAPPER_FLAG]: true,
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
  const message = `Test is expected to fail, but all assertions passed`;
  const err: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.AssertionError,
    message,
    stack: `${test.id}_${message}`,
    diff: getYellowString(` Expected to fail, but all assertions passed`)
  };
  return err;
}

export function isAbortErrorString(item: any): boolean {
  return item === POOL_ERROR_NAMES.PoolRunAbortedError || item === 'AbortError';
}

export function isAbortError(error: any): boolean {
  return isAbortErrorString(error) 
    || isAbortErrorString(error?.name)
    || error?.message === 'Terminating worker thread';
}

export function getTestErrorFromAnyError(
  error: any,
): AssemblyScriptTestError {
  const message: string = error?.message ?? String(error);

  return {
    name: error?.name ?? POOL_ERROR_NAMES.PoolError,
    message,
    stack: error?.stack ?? message,
    stacks: error?.stacks,
    cause: error?.cause ? getTestErrorFromAnyError(error.cause) : undefined
  };
}

export function getExpectedMessageOrAny(expectedMsgStr?: string): string {
  return expectedMsgStr ? `"${expectedMsgStr}"` : '<any>';
}
