import { test } from 'vitest-pool-assemblyscript/assembly';

test("compilation failure", () => {
  //@ts-ignore
  return doesNotExist;
});
