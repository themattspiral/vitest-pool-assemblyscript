import { expect } from "vitest-pool-assemblyscript/assembly";

export function helperWithFailingAssertion(): void {
  expect(1).toBe(2);
}
