import { describe, expect, test } from "vitest-pool-assemblyscript/assembly";

// Meta fixture: intentional toThrowError failures to verify CLI error output formatting.
// Each test is expected to fail — the meta-verify tests assert on the resulting
// error type, message text, and diff content in the CLI output.

function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

describe("toThrowError", () => {
  describe("matching failures", () => {
    test("expect any error, but no error received [should fail]", () => {
      expect(() => { expect(true).toBeTruthy(); }).toThrowError();
    });

    test("expect specific error, but no error received [should fail]", () => {
      expect(() => { expect(true).toBeTruthy(); }).toThrowError("Index out of range");
    });

    test("expect specific error, but different error received [should fail]", () => {
      expect(() => { fails(); }).toThrowError("will not match");
    });
  });

  describe("runtime syntax errors", () => {
    test("non-function integer argument [should fail]", () => {
      expect(1).toThrowError();
    });

    test("non-function boolean argument [should fail]", () => {
      expect(true).toThrowError();
    });

    // TODO: This test was previously expected to fail but now passes. Needs analysis
    // to understand why a non-void callback works with toThrowError().
    //
    // IMPORTANT: "global arrow function type inference lock-in" seems to occur with
    // all subsequent () => void functions compiled in a file when a nested (within void arrow)
    // callback arrow type is inferred. Either use an explicit non-void return type here,
    // or make sure it comes after any () => voids, otherwise you'll get compilation errors.
    test.skip("non-void callback argument [needs analysis]", () => {
      expect((): i32 => fails()).toThrowError();
    });
  });
});
