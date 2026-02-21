import { test } from "vitest-pool-assemblyscript/assembly";

test("compilation failure [should fail]", () => {
  //@ts-ignore
  return doesNotExist;
});
