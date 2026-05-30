import { describe, expect, test } from "vitest-pool-assemblyscript/assembly";

import { Point } from "../../assembly-src/user-class-utils";
import {
  TwoField,
  ReallyLongClassName,
  EvenMoreExtremelyLongClassNameThatExceedsTheBudget,
  Cycle,
} from "../../assembly-src/truncation-utils.meta";

describe("short-form truncation", () => {

  describe("container truncation", () => {
    test("array of many small elements [should fail]", () => {
      // 15-element i32 arrays differing only at index [14] (in the truncated portion).
      // Short form: `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …(5)]` on both sides.
      const a: i32[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const b: i32[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 99];
      expect(a).toEqual(b);
    });

    test("array of moderate-size objects [should fail]", () => {
      // 10 Points where only the first renders fully; rest truncate because each
      // multi-field child eats its slice of the per-element budget.
      const a = new Array<Point>();
      const b = new Array<Point>();
      for (let i = 1; i <= 10; i++) {
        a.push(new Point(i, i));
        b.push(new Point(i, i));
      }
      b[4] = new Point(99, 5); // differ inside the truncated portion
      expect(a).toEqual(b);
    });

    test("set of many elements [should fail]", () => {
      const a = new Set<i32>();
      const b = new Set<i32>();
      for (let i = 1; i <= 15; i++) {
        a.add(i);
        b.add(i);
      }
      // Replace the trailing element so the sets differ but the diff is in the
      // truncated portion of both short forms.
      b.delete(15);
      b.add(99);
      expect(a).toEqual(b);
    });

    test("map of many entries [should fail]", () => {
      const a = new Map<string, i32>();
      const b = new Map<string, i32>();
      for (let i = 1; i <= 10; i++) {
        const k = "k" + i.toString();
        a.set(k, i);
        b.set(k, i);
      }
      b.set("k7", 999); // diff inside the truncated portion
      expect(a).toEqual(b);
    });

    test("empty array does not emit truncation marker [should fail]", () => {
      const a: i32[] = [];
      const b: i32[] = [1];
      expect(a).toEqual(b);
    });

    test("empty set does not emit truncation marker [should fail]", () => {
      const a = new Set<i32>();
      const b = new Set<i32>();
      b.add(1);
      expect(a).toEqual(b);
    });

    test("empty map does not emit truncation marker [should fail]", () => {
      const a = new Map<string, i32>();
      const b = new Map<string, i32>();
      b.set("x", 1);
      expect(a).toEqual(b);
    });
  });

  describe("user object scaffolding", () => {
    test("normal short-form fits some fields truncates rest [should fail]", () => {
      // First field fits (consumes most of the budget); second field truncates into `…(1)`.
      const a = new TwoField("aaaaaaaaaa", 1);
      const b = new TwoField("aaaaaaaaab", 1);
      expect(a).toEqual(b);
    });

    test("long class name truncates trailing fields [should fail]", () => {
      // 19-char type name plus scaffolding leaves a tight contentBudget; one field fits, two truncate.
      const a = new ReallyLongClassName(1, 2, 3);
      const b = new ReallyLongClassName(99, 2, 3);
      expect(a).toEqual(b);
    });

    test("class name alone exceeds budget [should fail]", () => {
      // Type name is 50 chars — already past budget=40. Scaffolding is still emitted, content
      // collapses to `…(1)`, and the resulting line exceeds the nominal budget by design
      // (scaffolding-always-emitted rule: always surface an identifiable token).
      const a = new EvenMoreExtremelyLongClassNameThatExceedsTheBudget(1);
      const b = new EvenMoreExtremelyLongClassNameThatExceedsTheBudget(99);
      expect(a).toEqual(b);
    });
  });

  describe("string value truncation", () => {
    test("long string element truncates with ellipsis [should fail]", () => {
      // Array-of-one-string: short context with enough room for the truncated string form
      // (parent overhead doesn't push the element past budget).
      const a = ["one really long string value that needs truncation"];
      const b = ["x"];
      expect(a).toEqual(b);
    });

    test("surrogate-aware truncation preserves pair [should fail]", () => {
      // The cut would land on a UTF-16 high surrogate (the first code unit of 🎉) — the
      // truncator must back off one code unit to avoid emitting a lone surrogate.
      const a = ["abcdefghijklmnopqrstuvwxyzABCD🎉EXTRA"];
      const b = ["x"];
      expect(a).toEqual(b);
    });
  });

  describe("cycle interaction", () => {
    test("circular reference participates in budget [should fail]", () => {
      // Each Node's `next` points back to itself; stringification renders `next: [Circular]`
      // which is subject to the same budget/elision rules as any other piece.
      const a = new Cycle("a"); a.next = a;
      const b = new Cycle("b"); b.next = b;
      expect(a).toEqual(b);
    });
  });

  describe("map key/value budget split", () => {
    test("long key reduces value budget [should fail]", () => {
      // 13-char key consumes most of the per-entry budget — value renders only a short
      // prefix before the truncation ellipsis.
      const a = new Map<string, string>();
      const b = new Map<string, string>();
      a.set("long key name", "really long value string that needs truncating");
      b.set("long key name", "different value that also exceeds the budget too");
      expect(a).toEqual(b);
    });

    test("short key leaves more value budget [should fail]", () => {
      // 1-char key leaves most of the per-entry budget for the value — value renders a
      // longer prefix before the truncation ellipsis (vs. the long-key counterpart).
      const a = new Map<string, string>();
      const b = new Map<string, string>();
      a.set("z", "really long value string that needs truncating");
      b.set("z", "different value that also exceeds the budget too");
      expect(a).toEqual(b);
    });
  });

});
