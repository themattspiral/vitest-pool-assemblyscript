import { test, expect, describe } from '../../../assembly';

describe("arrays", () => {
  test('arrays with same values are equal', () => {
    const a: i32[] = [1, 2, 3, 4, 5];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).toEqual(b);
  });
  
  test('arrays with different int types with same values are equal', () => {
    const a: u64[] = [1, 9, 37, 2];
    const b: i8[] = [1, 9, 37, 2];
    expect(a).toEqual(b);
  });
  
  test('arrays with different float types with same values (binary representable) are equal', () => {
    const a: f64[] = [22.5];
    const b: f32[] = [22.5];
    expect(a).toEqual(b);
  });
  
  test('arrays with different float types with same values (non binary representable) are not equal', () => {
    const a: f64[] = [22.12345];
    const b: f32[] = [22.12345];
    expect(a).not.toEqual(b);
  });
  
  test('arrays with same values in different order are not equal', () => {
    const a: i32[] = [2, 4, 5, 1, 3];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });
  
  test('arrays with different values are not equal', () => {
    const a: i32[] = [1, 5, 5, 9, 9];
    const b: i32[] = [1, 2, 3, 4, 5];
    expect(a).not.toEqual(b);
  });
});

describe("maps", () => {
  // TODO
});

describe("sets", () => {
  // TODO
});

describe("ArrayBuffer", () => {
  // TODO
});

describe("user defined object", () => {
  // TODO
});
