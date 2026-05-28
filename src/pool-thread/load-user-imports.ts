import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { WasmImportsFactory } from '../types/types.js';
import { debug } from '../util/debug.js';
import { AS_POOL_ERROR_TYPE_FLAG, POOL_ERROR_NAMES } from '../types/constants.js';
import { createPoolError } from '../util/pool-errors.js';

export async function loadUserWasmImportsFactory(
  relativePath: string | undefined,
  projectRoot: string,
  logModule: string,
): Promise<WasmImportsFactory | undefined> {
  if (!relativePath) {
    return undefined;
  }

  const path = resolve(projectRoot, relativePath);
  const safeUrl = pathToFileURL(path).href;

  try {
    const start = performance.now();
    const createWasmImports = (await import(safeUrl)).default;
    debug(`[${logModule}] Imported user WasmImportsFactory "${safeUrl}" | TIMING ${(performance.now() - start).toFixed(2)} ms`);

    if (typeof createWasmImports !== 'function') {
      const msg = `Could not load user WasmImportsFactory from "${safeUrl}".`
        + ` Ensure that your module has a default export matching () => WebAssembly.Imports`
        + ` \nImported: "${typeof createWasmImports}": ${String(createWasmImports)}`;
      
      throw createPoolError(POOL_ERROR_NAMES.WASMExecutionHarnessError, msg);
    } else {
      return createWasmImports;
    }
  } catch (error) {
    if ((error as any)[AS_POOL_ERROR_TYPE_FLAG]) {
      throw error;
    }

    const msg = `Could not load user WasmImportsFactory from "${safeUrl}".`
      + ` Ensure that your module path is relative to the project root`
      + ` (location of shallowest vitest config), and that it has a`
      + ` default export matching () => WebAssembly.Imports`;
    throw createPoolError(
      POOL_ERROR_NAMES.WASMExecutionHarnessError,
      msg,
      error,
      true
    );
  }
};
