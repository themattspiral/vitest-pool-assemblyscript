import { resolve } from 'node:path';
import { readFile } from 'fs/promises';

// test with compiled version because asc strip-inline transform needs transpilation
import {
  compileAssemblyScript,
  AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
  AS_POOL_WASM_IMPORTS_MODULE_NAME,
  ASSEMBLYSCRIPT_LIB_PREFIX,
  INTERNAL_FUNCTION_NAME_SUBSTRING,
  POOL_INTERNAL_PATHS,
} from '../../../../dist/index-internal.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..');

export async function compileAndExtractTestFixture(fixture) {
  const compilePromise =  compileAssemblyScript(
    fixture.path,
    {
      shouldInstrument: true,
      stripInline: true,
      projectRoot: PROJECT_ROOT,
      extraFlags: ['--enable', 'simd'],
      instrumentationOptions: {
        projectRoot: PROJECT_ROOT,
        relativeExcludedFiles: [fixture.relPath].concat(POOL_INTERNAL_PATHS),
        excludedLibraryFilePrefix: ASSEMBLYSCRIPT_LIB_PREFIX,
        excludedInternalFunctionSubstring: INTERNAL_FUNCTION_NAME_SUBSTRING,
        coverageMemoryModule: AS_POOL_WASM_IMPORTS_MODULE_NAME,
        coverageMemoryName: AS_POOL_WASM_COVERAGE_MEM_IMPORT_NAME,
      },
    },
    'test',
    fixture.relPath
  );
  
  const sourceCodePromise = readFile(fixture.path, 'utf-8');
  
  const [compilation, sourceCode] = await Promise.all([compilePromise, sourceCodePromise]);

  return {
    fixture,
    compilation,
    sourceLines: sourceCode.split('\n'),
  };
}
