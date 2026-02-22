import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput,
  requireTestFile, requireTest, countByStatus,
  requireErrorBlock, TEST_FILE_PREFIX,
} from './helpers/shared.js';

const TIMEOUT_FILE = 'pool-errors/timeout-scenarios.meta.test.ts';
const FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${TIMEOUT_FILE}`;

/** Build the full error block key for a top-level test in this fixture. */
function testPath(testName: string): string {
  return `${FIXTURE_PATH} > ${testName}`;
}

/** Build the full error block key for a test nested in a describe block. */
function suitePath(suiteName: string, testName: string): string {
  return `${FIXTURE_PATH} > ${suiteName} > ${testName}`;
}

describe('timeout scenarios verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;
  let file: TestFileResult;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();
    file = requireTestFile(metaRunResults, TIMEOUT_FILE);
  });

  describe('file-level results', () => {
    test('file status is failed', () => {
      expect(file.status).toBe('failed');
    });

    test('correct test counts', () => {
      // 10 total: 3 passed, 6 failed, 1 skipped
      // passed: pre-timeout passing, timeout with fails, post-timeout passing
      // failed: pre-timeout failing, simple timeout, timeout with retry,
      //         inherits suite timeout, different timeout value, post-timeout failing
      // skipped: pre-timeout skipped
      expect(file.assertionResults).toHaveLength(10);
      expect(countByStatus(file, 'passed')).toBe(3);
      expect(countByStatus(file, 'failed')).toBe(6);
      expect(countByStatus(file, 'skipped')).toBe(1);
    });
  });

  describe('simple timeout', () => {
    test('test status is failed', () => {
      const t = requireTest(file, 'simple timeout [should fail]');
      expect(t.status).toBe('failed');
    });

    test('error type is WASMExecutionTimeoutError', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('simple timeout [should fail]'));
      expect(block).toContain('WASMExecutionTimeoutError');
    });

    test('error message includes timeout value', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('simple timeout [should fail]'));
      expect(block).toContain('100ms');
    });
  });

  describe('timeout with retry', () => {
    test('test status is failed', () => {
      const t = requireTest(file, 'timeout with retry [should fail]');
      expect(t.status).toBe('failed');
    });

    test('retry count: 3 attempts (1 initial + 2 retries)', () => {
      const t = requireTest(file, 'timeout with retry [should fail]');
      expect(t.failureMessages).toHaveLength(3);
    });

    test('error type is WASMExecutionTimeoutError', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('timeout with retry [should fail]'));
      expect(block).toContain('WASMExecutionTimeoutError');
    });

    test('error message includes timeout value', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('timeout with retry [should fail]'));
      expect(block).toContain('100ms');
    });
  });

  describe('timeout with fails modifier', () => {
    test('test status is passed (timeout = failure, fails inverts to pass)', () => {
      const t = requireTest(file, 'timeout with fails modifier');
      expect(t.status).toBe('passed');
    });

    test('no error block in CLI (test passes)', () => {
      const blocks = parsedCliOutput.errorBlocks.get(testPath('timeout with fails modifier'));
      expect(blocks).toBeUndefined();
    });
  });

  describe('suite-inherited timeout', () => {
    test('test status is failed', () => {
      const t = requireTest(file, 'suite with inherited timeout > inherits suite timeout [should fail]');
      expect(t.status).toBe('failed');
    });

    test('error type is WASMExecutionTimeoutError', () => {
      const block = requireErrorBlock(
        parsedCliOutput,
        suitePath('suite with inherited timeout', 'inherits suite timeout [should fail]'),
      );
      expect(block).toContain('WASMExecutionTimeoutError');
    });

    test('error message includes inherited timeout value', () => {
      const block = requireErrorBlock(
        parsedCliOutput,
        suitePath('suite with inherited timeout', 'inherits suite timeout [should fail]'),
      );
      expect(block).toContain('100ms');
    });

    test('ancestor titles reflect suite hierarchy', () => {
      const t = requireTest(file, 'suite with inherited timeout > inherits suite timeout [should fail]');
      expect(t.ancestorTitles).toContain('suite with inherited timeout');
    });
  });

  describe('different timeout value', () => {
    test('test status is failed', () => {
      const t = requireTest(file, 'timeout with different value [should fail]');
      expect(t.status).toBe('failed');
    });

    test('error type is WASMExecutionTimeoutError', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('timeout with different value [should fail]'));
      expect(block).toContain('WASMExecutionTimeoutError');
    });

    test('error message includes the specific timeout value (250ms, not 100ms)', () => {
      const block = requireErrorBlock(parsedCliOutput, testPath('timeout with different value [should fail]'));
      expect(block).toContain('250ms');
    });
  });

  describe('resume integrity: pre-timeout tests preserved', () => {
    test('pre-timeout passing test retains passed status', () => {
      const t = requireTest(file, 'pre-timeout passing test');
      expect(t.status).toBe('passed');
    });

    test('pre-timeout failing test retains failed status', () => {
      const t = requireTest(file, 'pre-timeout failing test [should fail]');
      expect(t.status).toBe('failed');
    });

    test('pre-timeout skipped test retains skipped status', () => {
      const t = requireTest(file, 'pre-timeout skipped test');
      expect(t.status).toBe('skipped');
    });

    test('pre-timeout failing test has error block in CLI', () => {
      const block = requireErrorBlock(
        parsedCliOutput,
        testPath('pre-timeout failing test [should fail]'),
      );
      expect(block).toContain('AssertionError');
    });
  });

  describe('resume integrity: post-timeout tests report correctly', () => {
    test('post-timeout passing test has passed status', () => {
      const t = requireTest(file, 'post-timeout passing test');
      expect(t.status).toBe('passed');
    });

    test('post-timeout failing test has failed status', () => {
      const t = requireTest(file, 'post-timeout failing test [should fail]');
      expect(t.status).toBe('failed');
    });

    test('post-timeout failing test has error block in CLI', () => {
      const block = requireErrorBlock(
        parsedCliOutput,
        testPath('post-timeout failing test [should fail]'),
      );
      expect(block).toContain('AssertionError');
    });
  });
});
