import { describe, expect, test } from 'vitest-pool-assemblyscript/assembly';

function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

describe("toBeNan", () => {
  describe("matching failures", () => {
    test("should print 'expected <value> to be NaN' [should fail]", () => {
      expect(77).toBeNaN();
    });
  });
});

describe("toThrowError", () => {
  describe("matching failures", () => {
    test("expect any error, but no error received [should fail]", () => {
      expect(() => { expect(true).toBeTruthy(); }).toThrowError();
    });
    
    test("expect specific error, but no error received [should fail]", () => {
      expect(() => { expect(true).toBeTruthy(); }).toThrowError("Index out of range");
    });
    
    test("expect specific error, but different error received [should fail]", () => {
      expect(() => { fails(); }).toThrowError("will not match");
    });
  });
  
  describe("runtime syntax errors", () => {
    test("fails with error indicating function is required with toThrowError matcher [should fail]", () => {
      expect(1).toThrowError();
    });
    
    test("fails with another error indicating function is required with toThrowError matcher [should fail]", () => {
      expect(true).toThrowError();
    });
  
    test("fails with error indicating a void callback is required [should fail]", () => {
      // IMPORTANT: "global arrow function type inferrence lock-in" seems to occur with
      // all subsequent () => void functions compiled in a file when a nested (within void arrow)
      // callback arrow type is inferred. Either use an explicit non-void return type here, 
      // or make sure it's comes after any () => voids, otherwise you'll get compilation errors.
      expect((): i32 => fails()).toThrowError();
    });
  });
});
