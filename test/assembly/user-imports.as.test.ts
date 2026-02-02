import { describe, expect, test } from 'vitest-pool-assemblyscript/assembly';
import {
  runUserFunction,
  runOtherUserFunction,
  runParseIntStringFunction,
} from './helpers/user-import-wrapper.help';

describe("default \"env\" module", () => {
  test("user imported function is executed", () => {
    expect(runUserFunction(2)).toBe(12);
  });
});

describe("\"customUserModule\" module", () => {
  test("user imported function is executed", () => {
    expect(runOtherUserFunction(2)).toBe(20);
  });

  test("user imported function is executed with string param", () => {
    expect(runParseIntStringFunction("33")).toBe(33);
  });
});
