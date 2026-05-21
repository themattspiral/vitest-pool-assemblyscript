/**
 * Verifies the rendered short-form (`expected X to deeply equal Y`) output of the
 * truncation fixture suite (test/assembly/expect-matchers/truncation.meta.test.ts).
 *
 * Each assertion is the literal short-form line, derived independently from the
 * truncation algorithm — never copied from observed output. The expected values
 * encode:
 *   - placement and count of `…(N)` markers at element boundaries
 *   - string-value ellipsis (with surrogate-pair preservation)
 *   - scaffolding precedence (class names / container braces emitted even when
 *     they push the line past the nominal budget)
 *   - the map key/value budget split (key gets the parent budget; value gets the
 *     remainder after subtracting key length + " => " separator length)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { type ParsedCliOutput, loadParsedCliOutput, requireErrorBlock, TEST_FILE_PREFIX } from '../helpers/shared.js';

const FIXTURE_FILE = `${TEST_FILE_PREFIX}test/assembly/expect-matchers/failure-messages-to-equal-truncation.meta.test.ts`;

/** Construct the full test path as it appears in vitest's CLI FAIL header. */
function testPath(...segments: string[]): string {
  return `${FIXTURE_FILE} > ${segments.join(' > ')}`;
}

describe('short-form truncation verification', () => {
  let parsedCli: ParsedCliOutput;

  beforeAll(async () => {
    parsedCli = await loadParsedCliOutput();
  });

  describe('container truncation', () => {
    test('array of many small elements: first 10 fit, rest truncate to "…(5)"', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'array of many small elements [should fail]'));
      expect(block).toContain('AssertionError: expected [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …(5)] to deeply equal [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …(5)] (differs at index [14])');
    });

    test('array of moderate-size objects: only the first Point fits, rest truncate', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'array of moderate-size objects [should fail]'));
      expect(block).toContain('AssertionError: expected [Point{ x: 1, y: 1 }, …(9)] to deeply equal [Point{ x: 1, y: 1 }, …(9)] (differs at index [4].x)');
    });

    test('set of many elements: first 9 fit, rest truncate to "…(6)"', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'set of many elements [should fail]'));
      expect(block).toContain('AssertionError: expected Set { 1, 2, 3, 4, 5, 6, 7, 8, 9, …(6) } to deeply equal Set { 1, 2, 3, 4, 5, 6, 7, 8, 9, …(6) }');
    });

    test('map of many entries: first 2 fit, rest truncate to "…(8)"', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'map of many entries [should fail]'));
      expect(block).toContain('AssertionError: expected Map { "k1" => 1, "k2" => 2, …(8) } to deeply equal Map { "k1" => 1, "k2" => 2, …(8) } (differs at key ["k7"])');
    });

    test('empty array renders as "[]" with no truncation marker', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'empty array does not emit truncation marker [should fail]'));
      expect(block).toContain('AssertionError: expected [] to deeply equal [1]');
    });

    test('empty set renders as "Set {}" with no truncation marker', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'empty set does not emit truncation marker [should fail]'));
      expect(block).toContain('AssertionError: expected Set {} to deeply equal Set { 1 }');
    });

    test('empty map renders as "Map {}" with no truncation marker', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'container truncation', 'empty map does not emit truncation marker [should fail]'));
      expect(block).toContain('AssertionError: expected Map {} to deeply equal Map { "x" => 1 }');
    });
  });

  describe('user object scaffolding', () => {
    test('normal short-form fits one field truncates one', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'user object scaffolding', 'normal short-form fits some fields truncates rest [should fail]'));
      expect(block).toContain('AssertionError: expected TwoField{ name: "aaaaaaaaaa", …(1) } to deeply equal TwoField{ name: "aaaaaaaaab", …(1) } (differs at .name)');
    });

    test('long class name truncates trailing fields after one fits', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'user object scaffolding', 'long class name truncates trailing fields [should fail]'));
      expect(block).toContain('AssertionError: expected ReallyLongClassName{ alpha: 1, …(2) } to deeply equal ReallyLongClassName{ alpha: 99, …(2) } (differs at .alpha)');
    });

    test('class name alone exceeds budget: scaffolding still emitted, content collapses to "…(1)"', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'user object scaffolding', 'class name alone exceeds budget [should fail]'));
      expect(block).toContain('AssertionError: expected EvenMoreExtremelyLongClassNameThatExceedsTheBudget{ …(1) } to deeply equal EvenMoreExtremelyLongClassNameThatExceedsTheBudget{ …(1) } (differs at .x)');
    });
  });

  describe('string value truncation', () => {
    test('long string element truncates with trailing ellipsis inside quotes', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'string value truncation', 'long string element truncates with ellipsis [should fail]'));
      expect(block).toContain('AssertionError: expected ["one really long string value th…"] to deeply equal ["x"] (differs at index [0])');
    });

    test('surrogate-pair-aware truncation: cut backs off one code unit to avoid lone surrogate', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'string value truncation', 'surrogate-aware truncation preserves pair [should fail]'));
      // The "🎉" surrogate pair occupies code units 30-31. Naive truncation at slice
      // length 31 would land between the pair (lone high surrogate at the end). The
      // truncator backs off to slice length 30, dropping the pair entirely.
      expect(block).toContain('AssertionError: expected ["abcdefghijklmnopqrstuvwxyzABCD…"] to deeply equal ["x"] (differs at index [0])');
    });
  });

  describe('cycle interaction', () => {
    test('"[Circular]" is rendered like any other piece, subject to budget rules', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'cycle interaction', 'circular reference participates in budget [should fail]'));
      expect(block).toContain('AssertionError: expected Cycle{ name: "a", next: [Circular] } to deeply equal Cycle{ name: "b", next: [Circular] } (differs at .name)');
    });
  });

  describe('map key/value budget split', () => {
    test('long key consumes most of the entry budget — value renders only a short prefix', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'map key/value budget split', 'long key reduces value budget [should fail]'));
      // Key "long key name" renders as `"long key name"` (15 chars including quotes).
      // After subtracting key length + " => " (4 chars) from the per-entry budget,
      // the value is left with only ~9 chars — enough for `"really…"` / `"differ…"`.
      expect(block).toContain('AssertionError: expected Map { "long key name" => "really…" } to deeply equal Map { "long key name" => "differ…" } (differs at key ["long key name"])');
    });

    test('short key leaves more value budget — value renders a longer prefix', () => {
      const block = requireErrorBlock(parsedCli, testPath('short-form truncation', 'map key/value budget split', 'short key leaves more value budget [should fail]'));
      // Key "z" renders as `"z"` (3 chars). The value gets the parent budget minus 3
      // minus 4 (` => `) — enough for ~18 content chars before the ellipsis.
      expect(block).toContain('AssertionError: expected Map { "z" => "really long value …" } to deeply equal Map { "z" => "different value th…" } (differs at key ["z"])');
    });
  });

});
