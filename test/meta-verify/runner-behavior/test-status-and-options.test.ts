import { describe, test, expect, beforeAll } from 'vitest';
import {
  type MetaRunResults, type TestFileResult, type ParsedCliOutput,
  loadMetaRunResults, loadParsedCliOutput, requireTestFile, requireTest, countByStatus,
} from '../helpers/shared.js';

const SKIP_FILE = 'runner-behavior/skip.meta.test.ts';
const ONLY_FILE = 'runner-behavior/only.meta.test.ts';
const FAILS_FILE = 'runner-behavior/fails.meta.test.ts';
const RETRY_FILE = 'runner-behavior/retry.meta.test.ts';

describe('test options & result status verification', () => {
  let metaRunResults: MetaRunResults;
  let parsedCliOutput: ParsedCliOutput;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCliOutput = await loadParsedCliOutput();
  });

  describe('skip-scenarios: all tests skipped', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, SKIP_FILE);
    });

    test('file status is passed (all skipped = passes)', () => {
      expect(file.status).toBe('passed');
    });

    test('all 11 tests are skipped', () => {
      expect(file.assertionResults).toHaveLength(11);
      expect(countByStatus(file, 'skipped')).toBe(11);
      expect(countByStatus(file, 'passed')).toBe(0);
      expect(countByStatus(file, 'failed')).toBe(0);
    });

    test('test.skip test is skipped', () => {
      const t = requireTest(file, 'should be skipped');
      expect(t.status).toBe('skipped');
    });

    test('TestOptions.skip() test is skipped', () => {
      const t = requireTest(file, 'should also be skipped');
      expect(t.status).toBe('skipped');
    });

    test('combined test.skip + TestOptions.skip() test is skipped', () => {
      const t = requireTest(file, 'skip is idempotent: should be skipped when both `skip` function is used and option is set');
      expect(t.status).toBe('skipped');
    });

    test('test nested in describe.skip is skipped', () => {
      const t = requireTest(file, 'suite using `skip` function should be skipped regardless of options on tests in it > should be skipped because it\'s in a skipped suite');
      expect(t.status).toBe('skipped');
    });

    test('test nested in describe with TestOptions.skip() is skipped', () => {
      const t = requireTest(file, 'suite with `skip` option set should be skipped regardless of options on tests in it > nested suite should be skipped because it\'s in a skipped suite > plain - should be skipped because it\'s in a nested skipped suite');
      expect(t.status).toBe('skipped');
    });
  });

  describe('only-scenarios: only-marked tests run, rest skipped', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, ONLY_FILE);
    });

    test('file status is passed', () => {
      expect(file.status).toBe('passed');
    });

    test('21 total tests: 6 passed, 15 skipped', () => {
      expect(file.assertionResults).toHaveLength(21);
      expect(countByStatus(file, 'passed')).toBe(6);
      expect(countByStatus(file, 'skipped')).toBe(15);
      expect(countByStatus(file, 'failed')).toBe(0);
    });

    test('test.only runs', () => {
      const t = requireTest(file, 'test with `only` func should run');
      expect(t.status).toBe('passed');
    });

    test('TestOptions.only() runs', () => {
      const t = requireTest(file, 'should also run');
      expect(t.status).toBe('passed');
    });

    test('plain test is implicitly skipped when only exists', () => {
      const t = requireTest(file, 'plain test should be skipped in file with only');
      expect(t.status).toBe('skipped');
    });

    test('test in describe.only runs', () => {
      const t = requireTest(file, '`only` suite: should run with other onlies > plain test: should run in only suite');
      expect(t.status).toBe('passed');
    });

    test('plain sibling suite is skipped when only exists', () => {
      const t = requireTest(file, 'plain suite with same-level `only` - should be skipped > plain test: should be skipped because the suite gets set to skipped');
      expect(t.status).toBe('skipped');
    });

    test('nested describe.only runs within plain suite', () => {
      const t = requireTest(file, 'plain suite with same-level `only` and `only` nested suite - should run > `only` suite within plain suite should run with other file onlies > plain test: should run within nested suite marked only');
      expect(t.status).toBe('passed');
    });

    test('test.only within plain suite runs', () => {
      const t = requireTest(file, 'plain suite with same-level `only` and `only` sub-test - should run > `only` test within plain suite should run with other file onlies');
      expect(t.status).toBe('passed');
    });

    test('describe.skip overrides test.only inside it', () => {
      const t = requireTest(file, '`skip` suite: should have all tests skipped regardless of their options > `only` test: should be skipped because suite is skipped despite `only` function');
      expect(t.status).toBe('skipped');
    });

    test('hierarchy preserved in ancestorTitles for nested only suite test', () => {
      const t = requireTest(file, 'plain suite with same-level `only` and `only` nested suite - should run > `only` suite within plain suite should run with other file onlies > plain test: should run within nested suite marked only');
      // ancestorTitles: [filePath, outerDescribe, describe.only]
      expect(t.ancestorTitles).toHaveLength(3);
      expect(t.ancestorTitles[1]).toBe('plain suite with same-level `only` and `only` nested suite - should run');
      expect(t.ancestorTitles[2]).toBe('`only` suite within plain suite should run with other file onlies');
    });
  });

  describe('fails-scenarios: fails option behavior', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, FAILS_FILE);
    });

    test('file status is failed', () => {
      expect(file.status).toBe('failed');
    });

    test('8 total tests: 5 passed, 3 failed', () => {
      expect(file.assertionResults).toHaveLength(8);
      expect(countByStatus(file, 'passed')).toBe(5);
      expect(countByStatus(file, 'failed')).toBe(3);
    });

    test('passing test marked with fails reports as failure', () => {
      const t = requireTest(file, '`fails` option failure tests > should not pass with passing assertion when `fails` option is set [should fail]');
      expect(t.status).toBe('failed');
    });

    test('failing test marked with fails reports as passed', () => {
      const t = requireTest(file, 'suite should pass when test within it uses `fails` option and passes > should pass with a failing assertion when `fails` option is set');
      expect(t.status).toBe('passed');
    });

    test('nested fails-failure causes file to fail', () => {
      const t = requireTest(file, 'suite that fails and will cause file suite to fail > nested suite > should fail with a passing assertion when `fails` option is set [should fail]');
      expect(t.status).toBe('failed');
      expect(t.ancestorTitles).toContain('nested suite');
    });

    test('fails inheritance from suite: failing test passes due to inherited fails', () => {
      const t = requireTest(file, 'suite with `fails` set > should pass because inherited `fails` inverts the failure');
      expect(t.status).toBe('passed');
    });

    test('fails(false) override at test level', () => {
      const t = requireTest(file, 'suite with `fails` set > should fail because `fails(false)` overrides suite `fails` [should fail]');
      expect(t.status).toBe('failed');
    });
  });

  describe('retry-and-inheritance: retry counts and option inheritance', () => {
    let file: TestFileResult;

    beforeAll(() => {
      file = requireTestFile(metaRunResults, RETRY_FILE);
    });

    test('file status is failed', () => {
      expect(file.status).toBe('failed');
    });

    test('7 total tests: 3 passed, 4 failed', () => {
      expect(file.assertionResults).toHaveLength(7);
      expect(countByStatus(file, 'passed')).toBe(3);
      expect(countByStatus(file, 'failed')).toBe(4);
    });

    test('basic passing test', () => {
      const t = requireTest(file, 'just some test with project config defaults');
      expect(t.status).toBe('passed');
    });

    test('basic failing test', () => {
      const t = requireTest(file, 'failing test with project config defaults [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(1);
    });

    test('suite-level retry(5) inherited: 6 failure messages (1 initial + 5 retries)', () => {
      const t = requireTest(file, 'suite with retry different than default > should inherit this suite\'s `retry` and [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(6);
    });

    test('test-level retry(3) overrides suite retry(5): 4 failure messages', () => {
      const t = requireTest(file, 'suite with retry different than default > should override suite `retry` and [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(4);
    });

    test('retry + fails interaction: inherited retry and fails, test passes', () => {
      const t = requireTest(file, 'suite with retry different than default > nested suite with `fails` set > should get inherited retry and fail with it, then pass because inherited `fails` is true');
      expect(t.status).toBe('passed');
    });

    test('retry + fails interaction: retries still happen even when fails inverts result to pass', () => {
      // A passing fails test has no errors, so failureMessages is empty.
      // Verify retry count from CLI test report output instead: "(retry x5)"
      //
      // Note: we match by suite-qualified test name without the file path prefix
      // for this particular test case, because v3's reporters don't include both the 
      // file path and retry annotation on the same line in any config combo.
      // The suite-qualified name is unique enough across the meta suite for this not to matter.
      const suiteQualifiedName = 'suite with retry different than default > nested suite with `fails` set > should get inherited retry and fail with it, then pass because inherited `fails` is true';
      const line = parsedCliOutput.testReportOutput
        .split('\n')
        .find(l => l.includes(suiteQualifiedName));
      expect(line).toBeDefined();
      expect(line).toContain('(retry x5)');
    });

    test('fails(false) override with inherited retry: test fails with retry count', () => {
      const t = requireTest(file, 'suite with retry different than default > nested suite with `fails` set > should get inherited retry and overide `fail` to false, so that it actually [should fail]');
      expect(t.status).toBe('failed');
      expect(t.failureMessages).toHaveLength(6);
    });

    test('hierarchy preserved for deeply nested test', () => {
      const t = requireTest(file, 'suite with retry different than default > nested suite with `fails` set > should get inherited retry and fail with it, then pass because inherited `fails` is true');
      expect(t.ancestorTitles).toHaveLength(3);
      expect(t.ancestorTitles[1]).toBe('suite with retry different than default');
      expect(t.ancestorTitles[2]).toBe('nested suite with `fails` set');
    });
  });
});
