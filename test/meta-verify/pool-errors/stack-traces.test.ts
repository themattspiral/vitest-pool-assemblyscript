import { describe, test, expect, beforeAll, type Assertion } from 'vitest';
import {
  type ParsedCliOutput, type MetaRunResults,
  loadParsedCliOutput, loadMetaRunResults, 
  requireErrorBlock, requireTestFile, TEST_FILE_PREFIX,
} from '../helpers/shared.js';

const FIXTURE_FILE = `${TEST_FILE_PREFIX}test/assembly/pool-errors/stack-traces.meta.test.ts`;

// Path prefixes for files referenced in stack frames
const SRC = `${TEST_FILE_PREFIX}test/assembly-src`;
const FIXTURE_DIR = `${TEST_FILE_PREFIX}test/assembly/pool-errors`;

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
function extractStackFrames(
  parsedCli: ParsedCliOutput,
  fullTestPath: string,
): string[] {
  const block = requireErrorBlock(parsedCli, fullTestPath);
  return block.split('\n').filter(l => l.startsWith(' ❯ '));
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
  const frames = extractStackFrames(parsedCli, fullTestPath);

  expect(frames, `Stack frame count for "${fullTestPath}"`)
    .toHaveLength(expectedCount);

  return expect(frames);
}

describe('stack trace source mapping verification', () => {
  let parsedCli: ParsedCliOutput;
  let metaRunResults: MetaRunResults;

  beforeAll(async () => {
    metaRunResults = await loadMetaRunResults();
    parsedCli = await loadParsedCliOutput();
  });

  describe('function and callback combinations', () => {
    test('named function: error in callee, caller in stack', () => {
      const tPath = testPath('function and callback combinations', 'failNamedFunc [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 3)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ failNamedFunc ${SRC}/failure-utils.meta.ts:32:10`,
          ` ❯ anonymous|0 ${FIXTURE_FILE}:10:17`,
        ]);
    });

    test('arrow function: anonymous primary frame, caller in stack', () => {
      const tPath = testPath('function and callback combinations', 'failArrowFunc [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 3)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ failArrowFunc ${SRC}/failure-utils.meta.ts:36:10`,
          ` ❯ anonymous|1 ${FIXTURE_FILE}:15:17`,
        ]);
    });

    test('named callback passed to named function', () => {
      const tPath = testPath('function and callback combinations', 'failNamedCallbackInNamed [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 4)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failNamedCallbackInNamed ${SRC}/failure-utils.meta.ts:40:10`,
          ` ❯ anonymous|2 ${FIXTURE_FILE}:20:17`,
        ]);
    });

    test('arrow callback passed to named function', () => {
      const tPath = testPath('function and callback combinations', 'failArrowCallbackInNamed [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 4)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failArrowCallbackInNamed ${SRC}/failure-utils.meta.ts:44:10`,
          ` ❯ anonymous|3 ${FIXTURE_FILE}:25:17`,
        ]);
    });

    test('anonymous callback passed to named function', () => {
      const tPath = testPath('function and callback combinations', 'failAnonCallbackInNamed [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 4)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:50:19`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamed ${SRC}/failure-utils.meta.ts:48:10`,
          ` ❯ anonymous|4 ${FIXTURE_FILE}:30:17`,
        ]);
    });

    test('anonymous callback calling named function', () => {
      const tPath = testPath('function and callback combinations', 'failAnonCallbackInNamedCallsNamed [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 5)
        .toEqual([
          ` ❯ myFailingNamedFunc ${SRC}/failure-utils.meta.ts:8:17`,
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:56:43`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamedCallsNamed ${SRC}/failure-utils.meta.ts:56:10`,
          ` ❯ anonymous|5 ${FIXTURE_FILE}:35:17`,
        ]);
    });

    test('anonymous callback calling arrow function', () => {
      const tPath = testPath('function and callback combinations', 'failAnonCallbackInNamedCallsArrow [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 5)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:14:17`,
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:60:43`,
          ` ❯ myNamedFuncWithCallbackArg ${SRC}/failure-utils.meta.ts:3:10`,
          ` ❯ failAnonCallbackInNamedCallsArrow ${SRC}/failure-utils.meta.ts:60:10`,
          ` ❯ anonymous|6 ${FIXTURE_FILE}:40:17`,
        ]);
    });
  });

  describe('classes', () => {
    test('class method uses ClassName#method naming', () => {
      const tPath = testPath('classes', 'ClassWithFailingMethods.fail() [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 2)
        .toEqual([
          ` ❯ ClassWithFailingMethods#fail ${SRC}/failure-utils.meta.ts:82:19`,
          ` ❯ anonymous|0 ${FIXTURE_FILE}:48:17`,
        ]);
    });

    test('class member function (arrow assigned in constructor)', () => {
      const tPath = testPath('classes', 'ClassWithFailingMethods.failingMemberFunction() [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 2)
        .toEqual([
          ` ❯ anonymous|0 ${SRC}/failure-utils.meta.ts:71:21`,
          ` ❯ anonymous|1 ${FIXTURE_FILE}:54:17`,
        ]);
    });
  });

  describe('edge cases', () => {
    test('@inline function retains original source location', () => {
      const tPath = testPath('edge cases', 'inline function [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 2)
        .toEqual([
          ` ❯ inlineFails ${SRC}/inline-utils.meta.ts:9:17`,
          ` ❯ anonymous|0 ${FIXTURE_FILE}:61:24`,
        ]);
    });

    test('single line function', () => {
      const tPath = testPath('edge cases', 'single line function [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 1)
        .toEqual([
          ` ❯ failsSingleLine ${SRC}/failure-utils.meta.ts:29:86`,
        ]);
    });

    test('multiline expect statement points to expect call', () => {
      const tPath = testPath('edge cases', 'multiline expect statement [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('AssertionError: expected false to be truthy');

      expectStackFrames(parsedCli, tPath, 1)
        .toEqual([
          ` ❯ anonymous|2 ${FIXTURE_FILE}:69:5`,
        ]);
    });

    test('cross-file: frames reference both source files', () => {
      const tPath = testPath('edge cases', 'callsAnotherFunctionThatFails [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 3)
        .toEqual([
          ` ❯ fails ${SRC}/failure-utils.meta.ts:20:17`,
          ` ❯ callsAnotherFunctionThatFails ${SRC}/failure-utils-proxy.meta.ts:4:17`,
          ` ❯ anonymous|3 ${FIXTURE_FILE}:75:17`,
        ]);
    });

    test('assertion error in test helper: primary frame points to expect call', () => {
      const tPath = testPath('edge cases', 'assertion error in test helper [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('AssertionError: expected 1 to be 2');

      expectStackFrames(parsedCli, tPath, 2)
        .toEqual([
          ` ❯ testHelperWithFailingAssertion ${FIXTURE_DIR}/assertion-helper.meta.ts:4:3`,
          ` ❯ anonymous|4 ${FIXTURE_FILE}:80:5`,
        ]);
    });
    
    test('runtime error in test helper: primary frame points to array index error', () => {
      const tPath = testPath('edge cases', 'runtime error in test helper [should fail]');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: Index out of range');

      expectStackFrames(parsedCli, tPath, 2)
        .toEqual([
          ` ❯ testHelperWithRuntimeAbort ${FIXTURE_DIR}/assertion-helper.meta.ts:10:17`,
          ` ❯ anonymous|5 ${FIXTURE_FILE}:84:17`,
        ]);
    });

    describe("WASM crash error paths (not handled by abort import)", () => {
      test('stack overflow in user code', () => {
        const tPath = testPath('edge cases', 'WASM crash error paths (not handled by abort import)', 'stack overflow in user code [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RangeError: Maximum call stack size exceeded');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(9);
        expect(frames.slice(0, 9))
          .toEqual(new Array(9).fill(` ❯ crash ${SRC}/failure-utils.meta.ts:26:16`));
      });
      
      test('stack overflow in user class code', () => {
        const tPath = testPath('edge cases', 'WASM crash error paths (not handled by abort import)', 'stack overflow in user class code [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RangeError: Maximum call stack size exceeded');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(9);
        expect(frames.slice(0, 9))
          .toEqual(new Array(9).fill(` ❯ ClassWithFailingMethods#crash ${SRC}/failure-utils.meta.ts:88:18`));
      });
      
      test('stack overflow in test helper', () => {
        const tPath = testPath('edge cases', 'WASM crash error paths (not handled by abort import)', 'stack overflow in test helper [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RangeError: Maximum call stack size exceeded');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(9);
        expect(frames.slice(0, 9))
          .toEqual(new Array(9).fill(` ❯ testHelperWithStackOverflowCrash ${FIXTURE_DIR}/assertion-helper.meta.ts:16:16`));
      });

      test('memory out of bounds runtime error', () => {
        const tPath = testPath('edge cases', 'WASM crash error paths (not handled by abort import)', 'memory out of bounds runtime error [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RuntimeError: memory access out of bounds');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(2);
        expect(frames.slice(0, 2))
          .toEqual([
            ` ❯ badLoad ${SRC}/failure-utils.meta.ts:101:10`,
            ` ❯ anonymous|3 ${FIXTURE_FILE}:106:19`,
          ]);
      });
      
      test('divide by zero runtime error', () => {
        const tPath = testPath('edge cases', 'WASM crash error paths (not handled by abort import)', 'divide by zero runtime error [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RuntimeError: divide by zero');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(2);
        expect(frames.slice(0, 2))
          .toEqual([
            ` ❯ badDiv ${SRC}/failure-utils.meta.ts:105:3`,
            ` ❯ anonymous|4 ${FIXTURE_FILE}:111:19`,
          ]);
      });
    });

    describe("user imports", () => {
      test("range runtime error", () => {
        const tPath = testPath('edge cases', 'user imports', 'range runtime error [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RangeError: Invalid array length');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(3);
        expect(frames.slice(0, 3))
          .toEqual([
            ` ❯ failingUserFunction ${TEST_FILE_PREFIX}test/helpers/create-user-imports.js:14:21`,
            ` ❯ runFailingUserFunction ${SRC}/user-import-error-wrapper.meta.ts:9:10`,
            ` ❯ anonymous|0 ${FIXTURE_FILE}:118:14`,
          ]);
      });
      
      test("reference runtime error", () => {
        const tPath = testPath('edge cases', 'user imports', 'reference runtime error [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: ReferenceError: nonexistent is not defined');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(3);
        expect(frames.slice(0, 3))
          .toEqual([
            ` ❯ failingUserFunctionNonexistantRef ${TEST_FILE_PREFIX}test/helpers/create-user-imports.js:19:30`,
            ` ❯ runFailingUserFunctionNonexistantRef ${SRC}/user-import-error-wrapper.meta.ts:17:10`,
            ` ❯ anonymous|1 ${FIXTURE_FILE}:122:14`,
          ]);
      });
      
      test("stack overflow runtime error", () => {
        const tPath = testPath('edge cases', 'user imports', 'stack overflow runtime error [should fail]');

        const block = requireErrorBlock(parsedCli, tPath);
        expect(block).toContain('WASMRuntimeError: RangeError: Maximum call stack size exceeded');

        const frames = extractStackFrames(parsedCli, tPath);
        expect(frames.length).toBeGreaterThanOrEqual(9);
        expect(frames.slice(0, 9))
          .toEqual([
            ` ❯ overflow ${TEST_FILE_PREFIX}test/helpers/create-user-imports.js:2:3`,
            ].concat(new Array(8).fill(
              ` ❯ overflow ${TEST_FILE_PREFIX}test/helpers/create-user-imports.js:2:14`
            ))
          );
      });
    });
  });

  describe("malformed user imports setup", () => {
    const fixture = `pool-errors/stack-traces.meta-imports-create-fail.test.ts`;
    const fixturePath = `${TEST_FILE_PREFIX}test/assembly/${fixture}`;
    
    // Import errors are file-level failures. the FAIL header repeats the
    // file path with a bracketed suffix: "filepath [ filepath ]"
    const errorBlockKey = `${fixturePath} [ ${fixturePath} ]`;

    test("creation failure", () => {
      const file = requireTestFile(metaRunResults, fixture);
      expect(file.status).toBe('failed');

      const block = requireErrorBlock(parsedCli, errorBlockKey);
      expect(block).toContain('WASMUserImportsError: Could not create user WasmImportsFactory');
      expect(block).toContain('Caused by: ReferenceError: nonexistent is not defined');

      const frames = extractStackFrames(parsedCli, errorBlockKey);
      expect(frames.length).toBeGreaterThanOrEqual(1);
      expect(frames[0]).toBe(
        ` ❯ createWasmImports ${TEST_FILE_PREFIX}test/helpers/failing-create-user-imports.js:8:12`
      );
    });
  });
  
  describe("nonexistent user imports setup", () => {
    const fixture = `pool-errors/stack-traces.meta-imports-load-fail.test.ts`;
    const fixturePath = `${TEST_FILE_PREFIX}test/assembly/${fixture}`;
    
    // Import errors are file-level failures. the FAIL header repeats the
    // file path with a bracketed suffix: "filepath [ filepath ]"
    const errorBlockKey = `${fixturePath} [ ${fixturePath} ]`;

    test("load failure", () => {
      const file = requireTestFile(metaRunResults, fixture);
      expect(file.status).toBe('failed');

      const block = requireErrorBlock(parsedCli, errorBlockKey);
      expect(block).toContain('WASMUserImportsError: Could not load user WasmImportsFactory');
      expect(block).toContain('Caused by: Error: Cannot find module');
    });
  });
  
  describe("small memory setup", () => {
    const fixture = `pool-errors/stack-traces.meta-small-mem.test.ts`;
    const fixturePath = `${TEST_FILE_PREFIX}test/assembly/${fixture}`;
    const tPath = `${fixturePath} > small memory setup > out of memory runtime error [should fail]`;

    test("out of memory runtime error", () => {
      const file = requireTestFile(metaRunResults, fixture);
      expect(file.status).toBe('failed');

      const block = requireErrorBlock(parsedCli, tPath);
      expect(block).toContain('WASMRuntimeError: RuntimeError: unreachable');

      const frames = extractStackFrames(parsedCli, tPath);
      expect(frames).toContain(
        ` ❯ anonymous|0 ${TEST_FILE_PREFIX}test/assembly/pool-errors/stack-traces.meta-small-mem.test.ts:6:17`
      );
    });
  });
});
