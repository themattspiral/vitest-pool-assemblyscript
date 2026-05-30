import { describe, test, expect, beforeAll } from 'vitest';
import {
  type ParsedCliOutput, type MetaRunResults,
  loadParsedCliOutput, loadMetaRunResults, 
  requireErrorBlock, requireTestFile, TEST_FILE_PREFIX,
  TestFileResult,
} from '../helpers/shared.js';

const FIXTURE_FILE = `pool-errors/void-type-inference.meta.test.ts`;
const FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${FIXTURE_FILE}`;

// File-level failure - the FAIL header repeats the
// file path with a bracketed suffix: "filepath [ filepath ]"
const ERROR_BLOCK_KEY = `${FIXTURE_PATH} [ ${FIXTURE_PATH} ]`;

function extractStackFrames(
  parsedCli: ParsedCliOutput,
  fullTestPath: string,
): string[] {
  const block = requireErrorBlock(parsedCli, fullTestPath);
  return block.split('\n').filter(l => l.startsWith(' ❯ '));
}

let parsedCli: ParsedCliOutput;
let metaRunResults: MetaRunResults;
let file: TestFileResult;
let errorBlock: string;

beforeAll(async () => {
  metaRunResults = await loadMetaRunResults();
  parsedCli = await loadParsedCliOutput();
  file = requireTestFile(metaRunResults, FIXTURE_FILE);
  errorBlock = requireErrorBlock(parsedCli, ERROR_BLOCK_KEY);
});

describe('void type inference error handling', () => {
  test('function signature mismatch error', () => {
    expect(file.status).toBe('failed');

    expect(errorBlock).toContain('PoolSyntaxError: WASM function signature type mismatch during test collection');

    const frames = extractStackFrames(parsedCli, ERROR_BLOCK_KEY);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]).toBe(
      ` ❯ void-type-inference.meta.test ${FIXTURE_PATH}:6:1`
    );
  });
});
