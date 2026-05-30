import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";
import { fails } from "../../assembly-src/failure-utils.meta";

// defined separately due to type inference bug that this situation causes
// for all other void callbacks in the file
describe("void type inference error handling", () => {
  test("function signature mismatch error [should fail]", () => {
    expect(() => fails()).toThrowError();
  });
});
