/**
 * Quick tests - many small, fast tests
 * Used to measure overhead of per-test isolation
 */

import { test, expect } from "vitest-pool-assemblyscript/assembly";
import { double } from "../../assembly-src/quick-math";

// 20 trivial tests that should complete in <1ms each
// Using variable assignment to avoid AS compiler const-folding bug
test("quick 1", () => { const x: i32 = double(1); expect(x).toBe(2); });
test("quick 2", () => { const x: i32 = double(2); expect(x).toBe(4); });
test("quick 3", () => { const x: i32 = double(3); expect(x).toBe(6); });
test("quick 4", () => { const x: i32 = double(4); expect(x).toBe(8); });
test("quick 5", () => { const x: i32 = double(5); expect(x).toBe(10); });
test("quick 6", () => { const x: i32 = double(6); expect(x).toBe(12); });
test("quick 7", () => { const x: i32 = double(7); expect(x).toBe(14); });
test("quick 8", () => { const x: i32 = double(8); expect(x).toBe(16); });
test("quick 9", () => { const x: i32 = double(9); expect(x).toBe(18); });
test("quick 10", () => { const x: i32 = double(10); expect(x).toBe(20); });
test("quick 11", () => { const x: i32 = double(11); expect(x).toBe(22); });
test("quick 12", () => { const x: i32 = double(12); expect(x).toBe(24); });
test("quick 13", () => { const x: i32 = double(13); expect(x).toBe(26); });
test("quick 14", () => { const x: i32 = double(14); expect(x).toBe(28); });
test("quick 15", () => { const x: i32 = double(15); expect(x).toBe(30); });
test("quick 16", () => { const x: i32 = double(16); expect(x).toBe(32); });
test("quick 17", () => { const x: i32 = double(17); expect(x).toBe(34); });
test("quick 18", () => { const x: i32 = double(18); expect(x).toBe(36); });
test("quick 19", () => { const x: i32 = double(19); expect(x).toBe(38); });
test("quick 20", () => { const x: i32 = double(20); expect(x).toBe(40); });
