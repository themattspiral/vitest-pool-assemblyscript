import { test, expect, beforeEach, afterEach } from "vitest-pool-assemblyscript/assembly";
import { runUserFunction } from "../../assembly-src/user-import-wrapper";

// hooks + wasmImportsFactory interplay: hooks can call user-provided WASM
// imports — host-side setup/teardown is a primary real-world use of hooks.

let fromHook: i32 = 0;

beforeEach(() => {
  fromHook = runUserFunction(32); // user env import: returns input + 10
});

afterEach(() => {
  // teardown side: afterEach calls into user imports without error (its
  // execution is separately proven by the pass-100 hook coverage fixture)
  fromHook = runUserFunction(fromHook);
});

test("beforeEach can call a user-provided WASM import", () => {
  expect(fromHook).toBe(42);
});
