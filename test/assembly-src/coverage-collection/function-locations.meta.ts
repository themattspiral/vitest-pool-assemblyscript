/** Function location accuracy verification. Line numbers are asserted in verify tests. */

export function atLineThree(x: i32): i32 {
  return x;
}

export class Located {
  constructor() {}

  method(): i32 {
    return 1;
  }

  get prop(): i32 {
    return 2;
  }

  static staticMethod(): i32 {
    return 3;
  }
}
