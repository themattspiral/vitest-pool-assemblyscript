import { describe, test, expect, beforeAll, type Assertion } from 'vitest';
import {
  type ParsedCliOutput,
  loadParsedCliOutput, requireErrorBlock, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const FIXTURE_FILE = `${TEST_FILE_PREFIX}test/assembly/pool-errors/stack-traces.meta.test.ts`;

// Path prefixes for files referenced in stack frames
const SRC = `${TEST_FILE_PREFIX}test/assembly-src`;
const FIXTURE = `${TEST_FILE_PREFIX}test/assembly/pool-errors`;

/** Construct the full test path as it appears in vitest's CLI FAIL header. */
function testPath(...segments: string[]): string {
  return `${FIXTURE_FILE} > ${segments.join(' > ')}`;
}

/**
 * Extract stack frame lines from an error block and return an assertion
 * on the resulting array for further chaining. Internally validates the
 * frame count for clearer error messages on mismatch.
 *
 * Stack frame lines are identified by the ' ❯ ' prefix that our pool's
 * error formatting produces for both the primary frame (in error.diff)
 * and additional frames (in error.stacks).
 */
function expectStackFrames(
  parsedCli: ParsedCliOutput,
  fullTestPath: string,
  expectedCount: number,
): Assertion<string[]> {
  const block = requireErrorBlock(parsedCli, fullTestPath);
  const frames = block.split('\n').filter(l => l.startsWith(' ❯ '));

  expect(frames, `Stack frame count for "${fullTestPath}"`)
    .toHaveLength(expectedCount);

  return expect(frames);
}

describe('stack trace source mapping verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  describe('function and callback combinations', () => {
    test('named function: error in callee, caller in stack', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failNamedFunc [should fail]'), 3)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ failNamedFunc ${SRC}/failure-utils.meta.ts:27:10`,
          ` ❯ anonymous|0 ${FIXTURE}/stack-traces.meta.test.ts:9:17`,
        ]);
    });

    test('arrow function: anonymous primary frame, caller in stack', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failArrowFunc [should fail]'), 3)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ failArrowFunc ${SRC}/failure-utils.meta.ts:31:10`,
          ` ❯ anonymous|1 ${FIXTURE}/stack-traces.meta.test.ts:14:17`,
        ]);
    });

    test('named callback passed to named function', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failNamedCallbackInNamed [should fail]'), 4)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failNamedCallbackInNamed ${SRC}/failure-utils.meta.ts:35:10`,
          ` ❯ anonymous|2 ${FIXTURE}/stack-traces.meta.test.ts:19:17`,
        ]);
    });

    test('arrow callback passed to named function', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failArrowCallbackInNamed [should fail]'), 4)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failArrowCallbackInNamed ${SRC}/failure-utils.meta.ts:39:10`,
          ` ❯ anonymous|3 ${FIXTURE}/stack-traces.meta.test.ts:24:17`,
        ]);
    });

    test('anonymous callback passed to named function', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failAnonCallbackInNamed [should fail]'), 4)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:45:19`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamed ${SRC}/failure-utils.meta.ts:43:10`,
          ` ❯ anonymous|4 ${FIXTURE}/stack-traces.meta.test.ts:29:17`,
        ]);
    });

    test('anonymous callback calling named function', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failAnonCallbackInNamedCallsNamed [should fail]'), 5)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:51:43`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamedCallsNamed ${SRC}/failure-utils.meta.ts:51:10`,
          ` ❯ anonymous|5 ${FIXTURE}/stack-traces.meta.test.ts:34:17`,
        ]);
    });

    test('anonymous callback calling arrow function', () => {
      expectStackFrames(parsedCli, testPath('function and callback combinations', 'failAnonCallbackInNamedCallsArrow [should fail]'), 5)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:55:43`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamedCallsArrow ${SRC}/failure-utils.meta.ts:55:10`,
          ` ❯ anonymous|6 ${FIXTURE}/stack-traces.meta.test.ts:39:17`,
        ]);
    });
  });

  describe('classes', () => {
    test('class method uses ClassName#method naming', () => {
      expectStackFrames(parsedCli, testPath('classes', 'ClassWithFailingMethods.fail() [should fail]'), 2)
        .toEqual([
          ` ❯ ClassWithFailingMethods#fail ${SRC}/failure-utils.meta.ts:77:19`,
          ` ❯ anonymous|0 ${FIXTURE}/stack-traces.meta.test.ts:47:17`,
        ]);
    });

    test('class member function (arrow assigned in constructor)', () => {
      expectStackFrames(parsedCli, testPath('classes', 'ClassWithFailingMethods.failingMemberFunction() [should fail]'), 2)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:66:21`,
          ` ❯ anonymous|1 ${FIXTURE}/stack-traces.meta.test.ts:53:17`,
        ]);
    });
  });

  describe('edge cases', () => {
    test('@inline function retains original source location', () => {
      expectStackFrames(parsedCli, testPath('edge cases', 'inline function [should fail]'), 2)
        .toEqual([
          ` ❯ throwsError ${SRC}/inline-utils.meta.ts:9:17`,
          ` ❯ anonymous|0 ${FIXTURE}/stack-traces.meta.test.ts:60:24`,
        ]);
    });

    test('single line function', () => {
      expectStackFrames(parsedCli, testPath('edge cases', 'single line function [should fail]'), 1)
        .toEqual([
          ` ❯ failsSingleLine ${SRC}/failure-utils.meta.ts:24:86`,
        ]);
    });

    test('multiline expect statement points to expect call', () => {
      expectStackFrames(parsedCli, testPath('edge cases', 'multiline expect statement [should fail]'), 1)
        .toEqual([
          ` ❯ anonymous|2 ${FIXTURE}/stack-traces.meta.test.ts:68:5`,
        ]);
    });

    test('cross-file: frames reference both source files', () => {
      expectStackFrames(parsedCli, testPath('edge cases', 'callsAnotherFunctionThatFails [should fail]'), 3)
        .toEqual([
          ` ❯ fails ${SRC}/failure-utils.meta.ts:20:17`,
          ` ❯ callsAnotherFunctionThatFails ${SRC}/failure-utils-proxy.meta.ts:4:17`,
          ` ❯ anonymous|3 ${FIXTURE}/stack-traces.meta.test.ts:74:17`,
        ]);
    });

    test('assertion error in test helper: primary frame points to expect call', () => {
      expectStackFrames(parsedCli, testPath('edge cases', 'assertion error in helper [should fail]'), 2)
        .toEqual([
          ` ❯ helperWithFailingAssertion ${FIXTURE}/assertion-helper.meta.ts:4:3`,
          ` ❯ anonymous|4 ${FIXTURE}/stack-traces.meta.test.ts:79:5`,
        ]);
    });
  });
});
