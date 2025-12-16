import { AssemblyScriptPoolError, AssemblyScriptTestError, POOL_ERROR_NAMES } from '../types/types.js';

export function throwPoolErrorIfAborted(signal?: AbortSignal) {
  if (!signal || !signal.aborted) {
    return;
  }

  throw new AssemblyScriptPoolError(signal.reason, POOL_ERROR_NAMES.PoolRunAborted);
}

export function isAbortErrorString(item: any): boolean {
  return item === POOL_ERROR_NAMES.PoolRunAborted || item === 'AbortError';
}

export function createPoolError(context: string, error: unknown): AssemblyScriptPoolError {
  const isErrorAbortString = isAbortErrorString(error);

  if (isErrorAbortString) {
    const msg = `${context} - Aborted: Unknown Cause`;
    return new AssemblyScriptPoolError(msg, POOL_ERROR_NAMES.PoolRunAborted);
  }

  if (error instanceof AssemblyScriptPoolError) {
    return error;
  }

  if (error instanceof Error) {
    const isAbortError = isAbortErrorString(error.name);
    return new AssemblyScriptPoolError(
      `${context} - ${error.name}: ${error.message}`,
      isAbortError ? POOL_ERROR_NAMES.PoolRunAborted : POOL_ERROR_NAMES.PoolError,
      error.stack,
      error.cause
    );
  }

  const errorMsg = String(error);
  return new AssemblyScriptPoolError(`${context} - ${errorMsg}`, POOL_ERROR_NAMES.PoolError);
}

export function getTestError(error: AssemblyScriptPoolError): AssemblyScriptTestError {
  return {
    name: error.name ?? POOL_ERROR_NAMES.PoolError,
    message:  error.message,
    stack: error.stack,
    cause: error.cause instanceof Error ? getTestError(error.cause as AssemblyScriptPoolError) : undefined
  };
}
