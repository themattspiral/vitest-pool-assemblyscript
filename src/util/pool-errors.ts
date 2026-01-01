import type {
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  DiscoveredTest,
  PoolErrorName,
  TestErrorName
} from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID, POOL_ERROR_NAMES, TEST_ERROR_NAMES } from '../types/constants.js';
import { getYellowString } from './test-error-formatting.js';

export function createPoolError(
  message: string,
  name: PoolErrorName,
  stack?: string,
  cause?: any,
): AssemblyScriptPoolError {
  return { name, message, stack, cause, __type: ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID };
}

export function createTestTimeoutError(
  test: DiscoveredTest
): AssemblyScriptTestError {
  const message = `Test timed out (threshold ${test.options.timeout}ms)`;
  const err: AssemblyScriptTestError = {
    name: POOL_ERROR_NAMES.WASMExecutionTimeoutError,
    message,
    stack: message,
    diff: getYellowString(` Test Timeout Exceeded (${test.options.timeout}ms)`)
  };
  return err;
}

export function createTestExpectedToFailError(
  _test: DiscoveredTest
): AssemblyScriptTestError {
  const message = `Test is expected to fail, but all assertions passed`;
  const err: AssemblyScriptTestError = {
    name: TEST_ERROR_NAMES.AssertionError,
    message,
    stack: message,
    diff: getYellowString(` Expected to fail, but all assertions passed`)
  };
  return err;
}

export function throwPoolErrorIfAborted(signal?: AbortSignal): void {
  if (!signal || !signal.aborted) {
    return;
  }

  throw createPoolError(signal.reason, POOL_ERROR_NAMES.PoolRunAbortedError);
}

export function isAbortErrorString(item: any): boolean {
  return item === POOL_ERROR_NAMES.PoolRunAbortedError || item === 'AbortError';
}

export function isAbortError(error: any): boolean {
  return isAbortErrorString(error) 
    || isAbortErrorString(error?.name)
    || error?.message === 'Terminating worker thread';
}

export function createPoolErrorFromAnyError(context: string, contextErrorName: PoolErrorName, error: any): AssemblyScriptPoolError {
  const isErrorAbortString = isAbortErrorString(error);
  if (isErrorAbortString) {
    const msg = `${contextErrorName}: ${context} - Aborted, Unknown Cause`;
    return createPoolError(msg, POOL_ERROR_NAMES.PoolRunAbortedError);
  }

  if (error?.__type === ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID) {
    return error as AssemblyScriptPoolError;
  }

  if (error instanceof Error) {
    const isAbortError = isAbortErrorString(error.name);
    const asErr = createPoolError(
      `${context} - ${error.name}: ${error.message}`,
      isAbortError ? POOL_ERROR_NAMES.PoolRunAbortedError : contextErrorName,
      error.stack,
      error.cause
    );
    return asErr;
  }

  const errorMsg = String(error);
  return createPoolError(`${context} - ${errorMsg}`, contextErrorName);
}

export function getTestErrorFromPoolError(error: AssemblyScriptPoolError): AssemblyScriptTestError {
  const anyCause: any = error?.cause;
  const message = error.message ?? anyCause.message ?? 'Unknown error';
  return {
    name: error.name ?? anyCause.name ?? POOL_ERROR_NAMES.PoolError,
    message,
    stack: anyCause?.stack ?? error.stack ?? message,
    stacks: anyCause?.stacks,
    cause: getTestErrorFromAnyError(anyCause?.cause)
  };
}

export function getTestErrorFromAnyError(
  error: any,
  context: string = '',
  fallbackName: TestErrorName | PoolErrorName = POOL_ERROR_NAMES.PoolError
): AssemblyScriptTestError | undefined {
  if (!error) {
    return undefined;
  }

  const message = `${context ?? ''}${error?.message ?? ''}`;
  return {
    name: error?.name ?? fallbackName,
    message,
    stack: error?.stack ?? message,
    stacks: error?.stacks,
    cause: getTestErrorFromAnyError(error?.cause)
  };
}
