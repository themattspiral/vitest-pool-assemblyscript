import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { WasmImportsFactory } from '../types/types.js';
import { debug } from '../util/debug.js';
import { AS_POOL_ERROR_TYPE_FLAG } from '../types/constants.js';

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
    debug(`[${logModule}] TIMING Imported user WasmImportsFactory in ${(performance.now() - start).toFixed(2)} ms`);

    if (typeof createWasmImports !== 'function') {
      throw new Error(
        `User config for \`wasmImportsFactor\` must be the path to a module with a default export matching () => WebAssembly.Imports `
          + `- Imported: "${typeof createWasmImports}": ${String(createWasmImports)}`
      );
    } else {
      return createWasmImports;
    }
  } catch (error) {
    if ((error as any)[AS_POOL_ERROR_TYPE_FLAG]) {
      throw error;
    }
    
    throw new Error(
      `Could not load user WasmImportsFactory from "${safeUrl}".`
      + ` Ensure that your module path is relative to the project root (location of shallowest vitest config),`
      + ` and that it has a default export matching () => WebAssembly.Imports`,
      { cause: error }
    );
  }
};
