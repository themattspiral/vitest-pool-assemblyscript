import { describe, expect, test } from '../../assembly';
import {
  runUserFunction,
  runOtherUserFunction,
  runParseIntStringFunction,
} from './helpers/user-import-wrapper';

describe("default \"env\" environment", () => {
  test("user imported function is executed", () => {
    expect(runUserFunction(2)).toBe(12);
  });
});

describe("\"customUserEnv\" environment", () => {
  test("user imported function is executed", () => {
    expect(runOtherUserFunction(2)).toBe(20);
  });

  test("user imported function is executed with string param", () => {
    expect(runParseIntStringFunction("33")).toBe(33);
  });
});
