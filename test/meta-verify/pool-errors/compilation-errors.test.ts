import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput,
  requireTestFile, requireErrorBlock, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const COMPILATION_ERROR_FILE = 'pool-errors/compilation-error.meta.test.ts';
const FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${COMPILATION_ERROR_FILE}`;

// Compilation errors are file-level failures — the FAIL header repeats the
// file path with a bracketed suffix: "filepath [ filepath ]"
const ERROR_BLOCK_KEY = `${FIXTURE_PATH} [ ${FIXTURE_PATH} ]`;

describe('compilation error verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;
  let file: TestFileResult;
  let errorBlock: string;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();
    file = requireTestFile(metaRunResults, COMPILATION_ERROR_FILE);
    errorBlock = requireErrorBlock(parsedCliOutput, ERROR_BLOCK_KEY);
  });

  describe('file-level results', () => {
    test('file status is failed', () => {
      expect(file.status).toBe('failed');
    });
  });

  describe('CLI error output', () => {
    test('error type is CompilationError', () => {
      expect(errorBlock).toContain('CompilationError');
    });

    test('error message includes compile error count', () => {
      expect(errorBlock).toContain('1 compile error(s)');
    });

    test('AS compiler error code is present', () => {
      expect(errorBlock).toContain('ERROR TS2304');
    });

    test('AS compiler error description is present', () => {
      expect(errorBlock).toContain("Cannot find name 'doesNotExist'");
    });

    test('AS compiler error references the source file', () => {
      expect(errorBlock).toContain('compilation-error.meta.test.ts');
    });
  });
});
