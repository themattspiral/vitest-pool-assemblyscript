import { test, describe, expect } from "vitest-pool-assemblyscript/assembly";
import {
  sign, bucket, absVal, category, inRange, outsideRange,
  sumTo, countDown, atLeastOnce, gridCells, firstEven, indexOf, classify, requirePositive,
} from "../../../assembly-src/coverage-collection/pass-100/control-flow";

describe("conditionals — both arms of each", () => {
  test("if/else, else-if chain, ternary", () => {
    expect(sign(-2)).toBe(-1);
    expect(sign(2)).toBe(1);
    expect(bucket(-1)).toBe(0);
    expect(bucket(5)).toBe(1);
    expect(bucket(20)).toBe(2);
    expect(absVal(-3)).toBe(3);
    expect(absVal(3)).toBe(3);
  });

  test("switch — every case + default", () => {
    expect(category(0)).toBe(100);
    expect(category(1)).toBe(200);
    expect(category(9)).toBe(-1);
  });

  test("logical && and || — both short-circuit sides", () => {
    expect(inRange(5, 0, 10)).toBe(true);        // left true → right evaluated
    expect(inRange(-1, 0, 10)).toBe(false);      // left false → short-circuit
    expect(outsideRange(-1, 0, 10)).toBe(true);  // left true → short-circuit
    expect(outsideRange(5, 0, 10)).toBe(false);  // left false → right evaluated
  });
});

describe("loops", () => {
  test("for, while, do-while, nested", () => {
    expect(sumTo(3)).toBe(3);        // 0+1+2
    expect(countDown(3)).toBe(3);
    expect(atLeastOnce(2)).toBe(2);
    expect(gridCells(2)).toBe(4);
  });
});

describe("break / continue / early-return / throw", () => {
  test("continue + early return", () => {
    expect(firstEven([1, 2])).toBe(2);   // 1 odd → continue, 2 even → return
    expect(firstEven([1, 3])).toBe(-1);  // all odd → loop exhausts
  });

  test("break", () => {
    expect(indexOf([5, 6, 7], 6)).toBe(1); // 5≠6 (skip), 6=6 (break)
    expect(indexOf([5, 6], 9)).toBe(-1);   // none → no break
  });

  test("guard-clause early returns", () => {
    expect(classify(-1)).toBe(-1);
    expect(classify(0)).toBe(0);
    expect(classify(5)).toBe(1);
  });

  test("throw — valid returns, invalid throws", () => {
    expect(requirePositive(5)).toBe(5);
    expect(() => { requirePositive(-1); }).toThrowError("must be positive");
  });
});
