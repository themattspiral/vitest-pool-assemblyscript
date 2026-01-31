import { describe, expect, test } from '../../../assembly';

function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

describe("basic throw matching", () => {
  test("any error received", () => {
    expect(() => { fails(); }).toThrowError();
  });
  
  test("specific error message received", () => {
    expect(() => { fails(); }).toThrowError("Index out of range");
  });
});

describe("toThrow alias", () => {
  test("any error received", () => {
    expect(() => { fails(); }).toThrow();
  });
  
  test("specific error message received", () => {
    expect(() => { fails(); }).toThrow("Index out of range");
  });
});

describe("alternating conditions to ensure internal state is reset", () => {
  test("any error received", () => {
    expect(() => { fails(); }).toThrowError();
  });

  test("normal passing", () => {
    expect(1).toBe(1);
  });

  test.fails("different error received", () => {
    expect(() => { fails(); }).toThrowError("A fake error");
  });

  test("any error received again", () => {
    expect(() => { fails(); }).toThrowError();
  });

  test("normal passing again", () => {
    expect(1).toBe(1);
  });

  test("specific error received", () => {
    expect(() => { fails(); }).toThrowError("Index out of range");
  });

  test("final normal passing", () => {
    expect(1).toBe(1);
  });

  test("final any error received", () => {
    expect(() => { fails(); }).toThrowError();
  });
});
