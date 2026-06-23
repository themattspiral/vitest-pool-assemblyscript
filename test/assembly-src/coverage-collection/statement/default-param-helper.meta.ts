// A function with a default parameter, and a class with a defaulted constructor. When
// called with the defaulted arg/param omitted, AS inlines the default value as a Const
// located at the definition's default site (the signature line) in THIS file. The
// regression suite verifies that inlined Const does not pollute statement coverage.
export function addBase(n: i32, base: i32 = 100): i32 {
  return n + base;
}

export class Thing {
  v: i32;
  constructor(start: i32 = 50) {
    this.v = start;
  }
}
