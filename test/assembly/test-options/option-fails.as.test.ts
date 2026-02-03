import { it, expect, TestOptions, describe } from 'vitest-pool-assemblyscript/assembly';
import { add } from '../../assembly-src/quick-math';

describe("`fails` option used successfully", ()=> {
  it("should pass normally", () => {
    expect(add(1, 2)).toBe(3);
  });

  it("should pass with failing assertion when `fails` option is set", TestOptions.fails(), () => {
    expect(false).toBeTruthy();
  });

  it("should also pass with failing assertion when `fails` option is set", () => {
    expect(false).toBeTruthy();
  }, TestOptions.fails());

  it.fails("should pass with failing assertion when `fails` function is used", () => {
    expect(false).toBeTruthy();
  });

  it.fails("should pass with failing assertion when `fails` function is used with options", TestOptions.retry(3), () => {
    expect(false).toBeTruthy();
  });

  it.fails("should pass with failing assertion when `fails` function is used with options also", () => {
    expect(false).toBeTruthy();
  }, TestOptions.retry(3));
})
