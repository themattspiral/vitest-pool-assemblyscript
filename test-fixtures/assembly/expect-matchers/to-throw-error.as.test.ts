import { describe, expect, test } from '../../../assembly';

import { fails } from '../../assembly-src/failure-utils';
import { add } from '../../assembly-src/math';

describe("basic throw matching", () => {
  test("any error received", () => {
    expect(() => { fails(); }).toThrowError();
  });
  
  test("specific error message received", () => {
    expect(() => { fails(); }).toThrowError("Index out of range");
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

describe("matching failures", () => {
  test("expect any error, but no error received [should fail]", () => {
    expect(() => { expect(true).toBeTruthy(); }).toThrowError();
  });
  
  test("expect specific error, but no error received [should fail]", () => {
    expect(() => { expect(true).toBeTruthy(); }).toThrowError("Index out of range");
  });
  
  test("expect specific error, but different error received [should fail]", () => {
    expect(() => { fails(); }).toThrowError("Nonexistant");
  });
});

describe("runtime syntax errors", () => {
  test("fails with error indicating function is required with toThrowError matcher [should fail]", () => {
    expect(1).toThrowError();
  });
  
  test("fails with another error indicating function is required with toThrowError matcher [should fail]", () => {
    expect(true).toThrowError();
  });

  test("expect NOT received should throw syntax error [should fail]", () => {
    expect(() => { expect(true).toBeTruthy(); }).not.toThrowError();
  });

  test("fails with error indicating a void callback is required [should fail]", () => {
    // IMPORTANT: "global arrow function type inferrence lock-in" seems to occur with
    // all subsequent () => void functions compiled in this file when this type is inferred.
    // Either use an explicit non-void return type here, or make sure it's comes after any () => voids,
    // otherwise you'll get compilation errors
    expect((): i32 => fails()).toThrowError();
  });
});
