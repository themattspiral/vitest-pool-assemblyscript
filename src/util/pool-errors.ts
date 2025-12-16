import { AssemblyScriptPoolError, AssemblyScriptTestError, PoolErrorName } from '../types/types.js';
import { ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID, POOL_ERROR_NAMES } from '../types/constants.js';

export function createPoolError(
  message: string,
  name: PoolErrorName,
  stack?: string,
  cause?: any,
): AssemblyScriptPoolError {
  return { name, message, stack, cause, __type: ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID };
}

export function throwPoolErrorIfAborted(signal?: AbortSignal) {
  if (!signal || !signal.aborted) {
    return;
  }

  throw createPoolError(signal.reason, POOL_ERROR_NAMES.PoolRunAborted);
}

export function isAbortErrorString(item: any): boolean {
  return item === POOL_ERROR_NAMES.PoolRunAborted || item === 'AbortError';
}

export function createPoolErrorFromError(context: string, contextErrorName: PoolErrorName, error: unknown): AssemblyScriptPoolError {
  const isErrorAbortString = isAbortErrorString(error);

  if (isErrorAbortString) {
    const msg = `${contextErrorName}: ${context} - Aborted, Unknown Cause`;
    return createPoolError(msg, POOL_ERROR_NAMES.PoolRunAborted);
  }

  if ((error as any)?.__type === ASSEMBLYSCRIPT_POOL_ERROR_TYPE_ID) {
    return error as AssemblyScriptPoolError;
  }

  if (error instanceof Error) {
    const isAbortError = isAbortErrorString(error.name);
    const asErr = createPoolError(
      `${context} - ${error.name}: ${error.message}`,
      isAbortError ? POOL_ERROR_NAMES.PoolRunAborted : contextErrorName,
      error.stack
    );
    return asErr;
  }

  const errorMsg = String(error);
  return createPoolError(`${context} - ${errorMsg}`, contextErrorName);
}

export function getTestErrorForPoolError(error: AssemblyScriptPoolError): AssemblyScriptTestError {
  const anyCause: any = error?.cause;
  return {
    name: error.name ?? anyCause.name,
    message: error.message ?? anyCause.message,
    stack: error.stack,
    cause: anyCause ? getTestErrorForPoolError(anyCause as AssemblyScriptPoolError) : undefined
  };
}
