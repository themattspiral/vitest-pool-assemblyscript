import { describe, test, expect, beforeAll } from 'vitest';
import { loadCliOutput } from '../helpers/shared.js';

const FIXTURE_FILE = 'expect-matchers/to-throw-error-failure-messages.meta.test.ts';

describe('toThrowError failure message verification', () => {
  let cliOutput: string;
  let cleanOutput: string;

  beforeAll(async () => {
    cliOutput = await loadCliOutput();
    // Strip ANSI escape codes for clean matching
    cleanOutput = cliOutput.replace(/\x1b\[[0-9;]*m/g, '');
  });

  // =========================================================================
  // MATCHING FAILURES (AssertionError)
  // =========================================================================

  describe('matching failures', () => {
    test('expect any error, but no error received', () => {
      expect(cleanOutput).toContain('AssertionError: expected function to throw any error - did not throw');
    });

    test('expect specific error, but no error received', () => {
      expect(cleanOutput).toContain('AssertionError: expected function to throw "Index out of range" error - did not throw');
    });

    test('expect specific error, but different error received', () => {
      expect(cleanOutput).toContain('AssertionError: expected function to throw "will not match" error but received "Index out of range"');
    });
  });

  // =========================================================================
  // RUNTIME SYNTAX ERRORS (WASMRuntimeError)
  // =========================================================================

  describe('runtime syntax errors', () => {
    test('non-function argument produces runtime error', () => {
      expect(cleanOutput).toContain('WASMRuntimeError: expect() requires a callback function when used with toThrowError() matcher');
    });
  });
});
