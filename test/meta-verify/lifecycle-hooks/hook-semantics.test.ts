import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput, requireTestFile, requireTest, countByStatus,
  requireErrorBlock, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const FIXTURE_PATH_PREFIX = `${TEST_FILE_PREFIX}test/assembly/`;
const FAIL_BEFORE_FILE = 'lifecycle-hooks/hooks-fail-before.meta.test.ts';
const FAIL_AFTER_FILE = 'lifecycle-hooks/hooks-fail-after.meta.test.ts';
const ORDER_FILE = 'lifecycle-hooks/hooks-order-output.meta.test.ts';
const FAILS_MOD_FILE = 'lifecycle-hooks/hooks-fails-modifier.meta.test.ts';
const TIMEOUT_FILE = 'lifecycle-hooks/hooks-timeout.meta.test.ts';
const THROW_INTERPLAY_FILE = 'lifecycle-hooks/hooks-expect-throw-interplay.meta.test.ts';
const FAIL_RETRY_FILE = 'lifecycle-hooks/hooks-fail-retry.meta.test.ts';
const CROSS_LEVEL_FILE = 'lifecycle-hooks/hooks-fail-cross-level.meta.test.ts';
const AFTEREACH_POSITION_FILE = 'lifecycle-hooks/hooks-aftereach-position.meta.test.ts';

/**
 * Extract a test's captured stdout section from the test report output.
 * Vitest prints these as `stdout | <filepath> > <suite> > <test>` followed by
 * the content lines, terminated by a blank line. Returns null when the test
 * produced no stdout at all.
 */
function findStdoutBlock(parsed: ParsedCliOutput, fullTestPath: string): string | null {
  const lines = parsed.testReportOutput.split('\n');
  const header = `stdout | ${fullTestPath}`;
  const headerIdx = lines.findIndex(line => line.trimEnd() === header);

  if (headerIdx === -1) {
    return null;
  }

  const content: string[] = [];
  for (let i = headerIdx + 1; i < lines.length && lines[i]!.trim() !== ''; i++) {
    content.push(lines[i]!);
  }
  return content.join('\n');
}

function requireStdoutBlock(parsed: ParsedCliOutput, fullTestPath: string): string {
  const block = findStdoutBlock(parsed, fullTestPath);
  if (block === null) {
    throw new Error(`No stdout block found for test path "${fullTestPath}"`);
  }
  return block;
}

/**
 * Count occurrences of a tag across the whole test report output. Used for
 * per-attempt counting on retried tests, whose console output lands in one
 * stdout section per attempt (so a single-block lookup can't see them all).
 */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('lifecycle hook semantics verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();
  });

  describe('failing beforeEach', () => {
    let file: TestFileResult;
    const skippedFnTestPath = `${FIXTURE_PATH_PREFIX}${FAIL_BEFORE_FILE} > failing beforeEach assertion > test fn is skipped when beforeEach fails [should fail]`;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, FAIL_BEFORE_FILE);
    });

    test('both tests fail', () => {
      expect(file.assertionResults).toHaveLength(2);
      expect(countByStatus(file, 'failed')).toBe(2);
    });

    test('assertion failure in beforeEach is an AssertionError with the phase prefix and hook-body code frame', () => {
      const block = requireErrorBlock(parsedCliOutput, skippedFnTestPath);
      expect(block).toContain('AssertionError: in beforeEach hook: expected 2 to be 3');
      // diff renders the hook's failed expectation
      expect(block).toContain('- 3');
      expect(block).toContain('+ 2');
      // stack frame + code frame source-map into the fixture (the hook body)
      expect(block).toContain('hooks-fail-before.meta.test.ts:');
      expect(block).toContain('expect(1 + 1).toBe(3)');
    });

    test('first hook runs, remaining before-chain and test fn are skipped, afterEach still runs', () => {
      const stdout = requireStdoutBlock(parsedCliOutput, skippedFnTestPath);
      expect(stdout).toContain('fb:before-1-ran');
      expect(stdout).toContain('fb:after-ran');
      expect(stdout).not.toContain('fb:before-2-should-not-run');
      expect(stdout).not.toContain('fb:test-fn-should-not-run');
    });

    test('runtime error in beforeEach is a WASMRuntimeError with the phase prefix; test fn skipped', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAIL_BEFORE_FILE} > runtime error in beforeEach > runtime hook error fails the test [should fail]`;
      const block = requireErrorBlock(parsedCliOutput, testPath);
      expect(block).toContain('WASMRuntimeError: in beforeEach hook: Index out of range');
      expect(parsedCliOutput.testReportOutput).not.toContain('rb:test-fn-should-not-run');
    });
  });

  describe('failing afterEach', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, FAIL_AFTER_FILE);
    });

    test('all four tests fail', () => {
      expect(file.assertionResults).toHaveLength(4);
      expect(countByStatus(file, 'failed')).toBe(4);
    });

    test('a failing afterEach flips a passed test to failed, and stops the remaining after-chain', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAIL_AFTER_FILE} > failing afterEach flips a passed test > passes in the body, fails in afterEach [should fail]`;
      const block = requireErrorBlock(parsedCliOutput, testPath);
      expect(block).toContain('AssertionError: in afterEach hook: expected 4 to be 5');

      // reverse registration order: the second-registered hook ran (and failed);
      // the first-registered hook — which would run last — never ran
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('fa:after-2-ran');
      expect(stdout).not.toContain('fa:after-1-should-not-run');
    });

    test('afterEach still runs after a test-fn failure', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAIL_AFTER_FILE} > afterEach still runs after a test-fn failure > failing body still triggers afterEach [should fail]`;
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('taf:after-ran');
    });

    test('afterEach still runs after a genuine WASM trap', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAIL_AFTER_FILE} > afterEach still runs after a genuine WASM trap > trapping body still triggers afterEach [should fail]`;
      const block = requireErrorBlock(parsedCliOutput, testPath);
      expect(block).toContain('unreachable');

      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('trap:after-ran');
    });

    test('an afterEach failure after a body failure appends a second error to the same test', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAIL_AFTER_FILE} > hook failure after test failure appends a second error > both the body error and the afterEach error land on the test [should fail]`;
      const blocks = parsedCliOutput.errorBlocks.get(testPath);
      expect(blocks, `error blocks for ${testPath}`).toBeDefined();

      // two distinct errors → two error blocks for the one test
      expect(blocks).toHaveLength(2);
      const combined = blocks!.join('\n');
      expect(combined).toContain('expected 1 to be 2');
      expect(combined).toContain('in afterEach hook: expected 10 to be 11');
    });
  });

  describe('execution order (console tags)', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, ORDER_FILE);
    });

    test('file passes: 1 passed, 1 skipped', () => {
      expect(file.status).toBe('passed');
      expect(countByStatus(file, 'passed')).toBe(1);
      expect(countByStatus(file, 'skipped')).toBe(1);
    });

    test('hooks bracket the test in exact vitest order, with afterEach reversed within each suite', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${ORDER_FILE} > ordered suite > hook order bracket`;
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toBe([
        'order:f-be1',
        'order:f-be2',
        'order:s-be1',
        'order:s-be2',
        'order:body',
        'order:s-ae2',
        'order:s-ae1',
        'order:f-ae2',
        'order:f-ae1',
      ].join('\n'));
    });

    test('a skipped test runs no hooks and produces no output', () => {
      const skipped = requireTest(file, 'ordered suite > skipped test runs no hooks');
      expect(skipped.status).toBe('skipped');
      // no hook tags or body output anywhere for the skipped test
      expect(parsedCliOutput.testReportOutput).not.toContain('order:skipped-body-should-not-run');
      const stdout = findStdoutBlock(parsedCliOutput, `${FIXTURE_PATH_PREFIX}${ORDER_FILE} > ordered suite > skipped test runs no hooks`);
      expect(stdout).toBeNull();
    });
  });

  describe('fails modifier interplay', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, FAILS_MOD_FILE);
    });

    test('hook failures satisfy `fails` (inverted to pass); all-passing hooks do not', () => {
      expect(countByStatus(file, 'passed')).toBe(2);
      expect(countByStatus(file, 'failed')).toBe(1);

      expect(requireTest(file, 'fails modifier with failing beforeEach > beforeEach failure satisfies `fails` — inverted to pass').status).toBe('passed');
      expect(requireTest(file, 'fails modifier with failing afterEach > afterEach failure satisfies `fails` — inverted to pass').status).toBe('passed');
    });

    test('with all hooks passing, the `fails` expectation fails — and both hooks still ran', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${FAILS_MOD_FILE} > fails modifier with all hooks passing > no failure anywhere fails the \`fails\` expectation [should fail]`;
      const block = requireErrorBlock(parsedCliOutput, testPath);
      expect(block).toContain('Test is expected to fail, but all assertion(s) passed');

      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('fm:before-ran');
      expect(stdout).toContain('fm:after-ran');
    });
  });

  describe('failing hooks consume retry attempts', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, FAIL_RETRY_FILE);
    });

    test('both tests fail after exhausting retries', () => {
      expect(file.assertionResults).toHaveLength(2);
      expect(countByStatus(file, 'failed')).toBe(2);
    });

    // retry(2) → 3 attempts: one failure message per attempt (1 initial + 2
    // retries), the hook tag logged once per attempt (fresh instance each
    // time), and the test fn skipped on every attempt
    test('beforeEach failure consumes each attempt like a body failure', () => {
      const t = requireTest(file, 'failing beforeEach consumes retry attempts > beforeEach fails every attempt until retries are exhausted [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(3);

      expect(countOccurrences(parsedCliOutput.testReportOutput, 'rc:before-attempt')).toBe(3);
      expect(parsedCliOutput.testReportOutput).not.toContain('rc:test-fn-should-not-run');
    });

    // retry(1) → 2 attempts: the body passes and re-runs on the retry, and
    // the afterEach failure flips each attempt to failed
    test('afterEach failure consumes each attempt after a passing body', () => {
      const t = requireTest(file, 'failing afterEach consumes retry attempts > afterEach fails every attempt after a passing body [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(2);

      expect(countOccurrences(parsedCliOutput.testReportOutput, 'rc:after-attempt')).toBe(2);
      expect(countOccurrences(parsedCliOutput.testReportOutput, 'rc:after-body-ran')).toBe(2);
    });
  });

  describe('toThrowError + afterEach interplay (capture-state consumption)', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, THROW_INTERPLAY_FILE);
    });

    test('both tests fail', () => {
      expect(file.assertionResults).toHaveLength(2);
      expect(countByStatus(file, 'failed')).toBe(2);
    });

    // The afterEach abort message deliberately matches the expected-throw
    // substring — a stale expectation would swallow it as the "expected"
    // error and leave the test passed. Failing with the afterEach's own
    // runtime error proves the expectation was consumed at the success-unwind.
    test('afterEach abort after a passing toThrowError fails the test with its own error', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${THROW_INTERPLAY_FILE} > afterEach abort after a passing toThrowError test > toThrowError passes, then the afterEach abort fails the test [should fail]`;
      const block = requireErrorBlock(parsedCliOutput, testPath);
      expect(block).toContain('WASMRuntimeError: in afterEach hook: intentional teardown failure');
    });

    // A trap inside the expected-to-throw callback bypasses the abort import,
    // so only the executor-side reset clears the expectation. A stale one
    // would misclassify the afterEach assertion as a toThrowError mismatch
    // ("expected function to throw error ...").
    test('trap in toThrowError callback: afterEach failure is classified as its own assertion error', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${THROW_INTERPLAY_FILE} > trap inside the expected-to-throw callback > trap in toThrowError callback fails the test; afterEach failure is classified as its own error [should fail]`;
      const blocks = parsedCliOutput.errorBlocks.get(testPath);
      expect(blocks, `error blocks for ${testPath}`).toBeDefined();

      const combined = blocks!.join('\n');
      expect(combined).toContain('unreachable');
      expect(combined).toContain('in afterEach hook: expected 2 to be 3');
      expect(combined).not.toContain('expected function to throw error');
    });
  });

  describe('cross-level chain-failure stop', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, CROSS_LEVEL_FILE);
    });

    test('both tests fail', () => {
      expect(file.assertionResults).toHaveLength(2);
      expect(countByStatus(file, 'failed')).toBe(2);
    });

    test('an OUTER beforeEach failure skips the INNER beforeEach and the body; both afterEach levels still run', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${CROSS_LEVEL_FILE} > outer suite with a failing beforeEach > inner suite > outer beforeEach failure skips the inner beforeEach and the body [should fail]`;
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('cl:outer-before-ran');
      // afterEach chain runs innermost-first, across both levels
      expect(stdout).toContain('cl:inner-after-ran');
      expect(stdout).toContain('cl:outer-after-ran');
      // the inner-level beforeEach and the body are both skipped by the outer failure
      expect(stdout).not.toContain('cl:inner-before-should-not-run');
      expect(stdout).not.toContain('cl:body-should-not-run');
    });

    test('an INNER afterEach failure stops the OUTER afterEach', () => {
      const testPath = `${FIXTURE_PATH_PREFIX}${CROSS_LEVEL_FILE} > outer suite whose afterEach should be stopped > inner suite with a failing afterEach > inner afterEach failure stops the outer afterEach [should fail]`;
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('cl:body-ran-2');
      expect(stdout).toContain('cl:inner-after-ran-2');
      // the outer-level afterEach (which runs after the inner one) is stopped by the failure
      expect(stdout).not.toContain('cl:outer-after-should-not-run');
    });
  });

  describe('afterEach position independence', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, AFTEREACH_POSITION_FILE);
    });

    // The tag prints only if the below-registered afterEach ran (position
    // independence) AND its state assertion passed (it observed the module
    // state written by beforeEach + the body). A test pass with the tag present
    // certifies both; the tag's absence would mean it never ran, a failed test
    // would mean it saw wrong state.
    test('the below-registered afterEach ran and observed the module state (test passes, tag present)', () => {
      expect(file.status).toBe('passed');
      expect(countByStatus(file, 'passed')).toBe(1);

      const testPath = `${FIXTURE_PATH_PREFIX}${AFTEREACH_POSITION_FILE} > afterEach registered below still applies to this test`;
      const stdout = requireStdoutBlock(parsedCliOutput, testPath);
      expect(stdout).toContain('pos:after-ran-and-saw-15');
    });
  });

  describe('hung hooks (per-hook timeout windows)', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, TIMEOUT_FILE);
    });

    // Each hook runs in its own window: the fixture's per-hook `timeout` arg is
    // the window that trips, reported with vitest's hook-timeout message plus our
    // phase-annotation prefix (timeout errors carry no source-mapped frame, so
    // the prefix is the only signal of WHICH hook hung).
    test('both hung-hook tests fail with the phase-annotated hook-timeout message', () => {
      expect(countByStatus(file, 'failed')).toBe(2);

      const beforePath = `${FIXTURE_PATH_PREFIX}${TIMEOUT_FILE} > hung beforeEach > beforeEach hang trips the hook timeout [should fail]`;
      const beforeBlock = requireErrorBlock(parsedCliOutput, beforePath);
      expect(beforeBlock).toContain('WASMExecutionTimeoutError: in beforeEach hook: Hook timed out in 150ms.');
      expect(beforeBlock).toContain('If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".');
      expect(beforeBlock).toContain('Hook Timeout Exceeded (150ms)');

      const afterPath = `${FIXTURE_PATH_PREFIX}${TIMEOUT_FILE} > hung afterEach > afterEach hang trips the hook timeout after the body passed [should fail]`;
      const afterBlock = requireErrorBlock(parsedCliOutput, afterPath);
      expect(afterBlock).toContain('WASMExecutionTimeoutError: in afterEach hook: Hook timed out in 150ms.');
      expect(afterBlock).toContain('Hook Timeout Exceeded (150ms)');
    });
  });
});
