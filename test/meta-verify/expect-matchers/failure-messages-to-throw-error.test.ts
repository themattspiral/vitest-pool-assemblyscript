import { describe, test, expect, beforeAll } from 'vitest';
import { type ParsedCliOutput, loadParsedCliOutput, requireErrorBlock, TEST_FILE_PREFIX } from '../helpers/shared.js';

const FIXTURE_FILE = `${TEST_FILE_PREFIX}test/assembly/expect-matchers/failure-messages-to-throw-error.meta.test.ts`;

/** Construct the full test path as it appears in vitest's CLI FAIL header. */
function testPath(...segments: string[]): string {
  return `${FIXTURE_FILE} > ${segments.join(' > ')}`;
}

describe('toThrowError failure message verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  describe('matching failures', () => {
    test('expect any error, but no error received', () => {
      const block = requireErrorBlock(parsedCli, testPath('toThrowError', 'matching failures', 'expect any error, but no error received [should fail]'));
      expect(block).toContain('AssertionError: function did not throw, but was expected to throw error: <any>');
    });

    test('expect specific error, but no error received', () => {
      const block = requireErrorBlock(parsedCli, testPath('toThrowError', 'matching failures', 'expect specific error, but no error received [should fail]'));
      expect(block).toContain('AssertionError: function did not throw, but was expected to throw error: "Index out of range"');
    });

    test('expect specific error, but different error received', () => {
      const block = requireErrorBlock(parsedCli, testPath('toThrowError', 'matching failures', 'expect specific error, but different error received [should fail]'));
      expect(block).toContain('AssertionError: expected function to throw error "will not match", but received error "Index out of range"');
    });
  });

  describe('runtime syntax errors', () => {
    test('non-function integer argument produces runtime error', () => {
      const block = requireErrorBlock(parsedCli, testPath('toThrowError', 'runtime syntax errors', 'non-function integer argument [should fail]'));
      expect(block).toContain('WASMRuntimeError: expect() requires a callback function when used with toThrowError() matcher');
    });

    test('non-function boolean argument produces runtime error', () => {
      const block = requireErrorBlock(parsedCli, testPath('toThrowError', 'runtime syntax errors', 'non-function boolean argument [should fail]'));
      expect(block).toContain('WASMRuntimeError: expect() requires a callback function when used with toThrowError() matcher');
    });
  });
});
