import type {
  AssemblyScriptPoolError,
  AssemblyScriptTestError,
  DiscoveredTest,
  PoolErrorName,
  TestErrorName
} from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID, POOL_ERROR_NAMES } from '../types/constants.js';
import { getTimeoutString } from './test-error-formatting.js';

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
  const err: AssemblyScriptTestError = {
    name: POOL_ERROR_NAMES.WASMExecutionTimeoutError,
    message: `Test "${test.name}" timed out (threshold ${test.options.timeout}ms)`,
    diff: getTimeoutString(test.options.timeout)
  };
  return err;
}

export function throwPoolErrorIfAborted(signal?: AbortSignal) {
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
  return {
    name: error.name ?? anyCause.name ?? POOL_ERROR_NAMES.PoolError,
    message: error.message ?? anyCause.message ?? 'Unknown error',
    stack: anyCause?.stack ?? error.stack,
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

  return {
    name: error?.name ?? fallbackName,
    message: `${context ?? ''}${error?.message ?? ''}`,
    stack: error?.stack,
    stacks: error?.stacks,
    cause: getTestErrorFromAnyError(error?.cause)
  };
}
