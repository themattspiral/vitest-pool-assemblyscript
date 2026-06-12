import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput,
  requireTestFile, requireTest, countByStatus,
  requireErrorBlock, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

// Verifies the non-isolated batch scenario (as-pool-meta-no-isolate project):
// isolate: false + maxWorkers: 1 makes vitest send all three fixture files to a
// single PoolWorker in ONE 'run' message. A timeout in one file of the batch must
// abort the correct thread dispatch, and the resumed run must complete every file.
//
// Dispatch order within the batch is sequencer-dependent, so assertions here are
// order-independent: each file's presence in the JSON results with correct per-test
// states is the core signal (the pre-fix failure mode was a hung run where the
// timed-out file's thread was never terminated and remaining dispatches starved).

const PASS_A_FILE = 'runner-behavior/batch-pass-a.meta-no-isolate.test.ts';
const PASS_B_FILE = 'runner-behavior/batch-pass-b.meta-no-isolate.test.ts';
const TIMEOUT_FILE = 'runner-behavior/batch-timeout.meta-no-isolate.test.ts';
const TIMEOUT_FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${TIMEOUT_FILE}`;

/** Build the full error block key for a top-level test in the timeout fixture. */
function timeoutFileTestPath(testName: string): string {
  return `${TIMEOUT_FIXTURE_PATH} > ${testName}`;
}

describe('non-isolated batch dispatch verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;
  let passAFile: TestFileResult;
  let passBFile: TestFileResult;
  let timeoutFile: TestFileResult;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();

    // requireTestFile throws if a file is missing from the JSON results —
    // all three resolving proves the whole batch ran to completion
    passAFile = requireTestFile(metaRunResults, PASS_A_FILE);
    passBFile = requireTestFile(metaRunResults, PASS_B_FILE);
    timeoutFile = requireTestFile(metaRunResults, TIMEOUT_FILE);
  });

  describe('passing files complete regardless of position in the batch', () => {
    test('batch-pass-a passes with all tests reported', () => {
      expect(passAFile.status).toBe('passed');
      expect(passAFile.assertionResults).toHaveLength(2);
      expect(countByStatus(passAFile, 'passed')).toBe(2);
    });

    test('batch-pass-b passes with all tests reported', () => {
      expect(passBFile.status).toBe('passed');
      expect(passBFile.assertionResults).toHaveLength(2);
      expect(countByStatus(passBFile, 'passed')).toBe(2);
    });

    test('no error blocks for passing file tests', () => {
      for (const file of [PASS_A_FILE, PASS_B_FILE]) {
        for (const key of parsedCliOutput.errorBlocks.keys()) {
          expect(key).not.toContain(file);
        }
      }
    });
  });

  describe('timeout file: correct per-test states', () => {
    test('file status is failed with correct test counts', () => {
      expect(timeoutFile.status).toBe('failed');
      expect(timeoutFile.assertionResults).toHaveLength(3);
      expect(countByStatus(timeoutFile, 'passed')).toBe(2);
      expect(countByStatus(timeoutFile, 'failed')).toBe(1);
    });

    test('timed-out test fails with timeout error', () => {
      const t = requireTest(timeoutFile, 'batch timeout [should fail]');
      expect(t.status).toBe('failed');

      const block = requireErrorBlock(parsedCliOutput, timeoutFileTestPath('batch timeout [should fail]'));
      expect(block).toContain('WASMExecutionTimeoutError: Test timed out after');
      expect(block).toContain('Test Timeout Exceeded (100ms)');
    });

    test('pre-timeout test result preserved across the batch resume', () => {
      const t = requireTest(timeoutFile, 'batch pre-timeout passing test');
      expect(t.status).toBe('passed');
    });

    test('post-timeout test runs on the resumed dispatch', () => {
      const t = requireTest(timeoutFile, 'batch post-timeout passing test');
      expect(t.status).toBe('passed');
    });
  });
});
