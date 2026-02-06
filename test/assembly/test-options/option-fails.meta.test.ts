import { test, expect, describe } from "vitest-pool-assemblyscript/assembly";

describe("`fails` option failure tests", ()=> {
  test.fails("should not pass with passing assertion when `fails` option is set [should fail]", () => {
    expect(true).toBeTruthy();
  });
})
