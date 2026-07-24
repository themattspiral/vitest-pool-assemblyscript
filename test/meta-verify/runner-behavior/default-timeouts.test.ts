import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput,
  requireTestFile, requireTest, countByStatus,
  requireErrorBlock, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const DEFAULT_TIMEOUTS_FILE = 'runner-behavior/default-timeouts.meta-default-timeout.test.ts';
const FIXTURE_PATH = `${TEST_FILE_PREFIX}test/assembly/${DEFAULT_TIMEOUTS_FILE}`;

// Expected window values for the as-pool-meta-default-timeouts project.
// Deliberately independent literals rather than an import from the config:
// these are the oracle side — a broken config-default resolution path must not
// be able to satisfy them. Must match the project's testTimeout/hookTimeout
// (defined in vitest.meta.config.ts + the three external meta configs).
const CONFIG_DEFAULT_TEST_TIMEOUT_MS = 200;
const CONFIG_DEFAULT_HOOK_TIMEOUT_MS = 300;

// Config-default timeout resolution: the fixture sets NO explicit timeouts, so
// the as-pool-meta-default-timeouts project's small config values are what
// trip. The reported ms values are the proof of the resolution path — they
// match neither vitest's built-in defaults nor any explicit per-test/per-hook
// value used elsewhere, so a broken default-resolution path cannot produce them.
describe('config-default timeout resolution verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;
  let file: TestFileResult;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();
    file = requireTestFile(metaRunResults, DEFAULT_TIMEOUTS_FILE);
  });

  test('file status is failed with correct test counts', () => {
    expect(file.status).toBe('failed');
    expect(file.assertionResults).toHaveLength(3);
    expect(countByStatus(file, 'passed')).toBe(1);
    expect(countByStatus(file, 'failed')).toBe(2);
  });

  test('a fast test passes under the small default windows', () => {
    const t = requireTest(file, 'passing test under default windows');
    expect(t.status).toBe('passed');
  });

  // NOTE (init-window attribution, deliberately not isolated): the test's own
  // timeout arms TWO windows — the init window (execution-start, covering WASM
  // instantiation + the _start() top-level re-run at execution) and the test-fn
  // phase window — both attributed as a plain test timeout. This test exercises a
  // hang in the test-fn phase; a hang isolated to the init segment is not tested
  // separately because it can't be constructed: top-level code that hangs at
  // execution also hangs it during discovery's _start(), which fails the file
  // before any test runs. Both windows use the same timeout and the same
  // attribution, so the message asserted below is identical either way.
  test('test-body hang trips the config-default testTimeout', () => {
    const t = requireTest(file, 'test-body hang trips the config-default testTimeout [should fail]');
    expect(t.status).toBe('failed');

    const block = requireErrorBlock(
      parsedCliOutput,
      `${FIXTURE_PATH} > test-body hang trips the config-default testTimeout [should fail]`,
    );
    expect(block).toContain(`WASMExecutionTimeoutError: Test timed out in ${CONFIG_DEFAULT_TEST_TIMEOUT_MS}ms.`);
    expect(block).toContain('If this is a long-running test, pass a timeout value using "TestOptions.timeout()" or configure it globally with "testTimeout".');
    expect(block).toContain(`Test Timeout Exceeded (${CONFIG_DEFAULT_TEST_TIMEOUT_MS}ms)`);
  });

  test('hook hang trips the config-default hookTimeout', () => {
    const t = requireTest(
      file,
      'hung beforeEach under config-default hookTimeout > beforeEach hang trips the config-default hookTimeout [should fail]',
    );
    expect(t.status).toBe('failed');

    const block = requireErrorBlock(
      parsedCliOutput,
      `${FIXTURE_PATH} > hung beforeEach under config-default hookTimeout > beforeEach hang trips the config-default hookTimeout [should fail]`,
    );
    expect(block).toContain(`WASMExecutionTimeoutError: in beforeEach hook: Hook timed out in ${CONFIG_DEFAULT_HOOK_TIMEOUT_MS}ms.`);
    expect(block).toContain('If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".');
    expect(block).toContain(`Hook Timeout Exceeded (${CONFIG_DEFAULT_HOOK_TIMEOUT_MS}ms)`);
  });
});
