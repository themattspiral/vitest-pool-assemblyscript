// Cross-file @inline target for pass-100/inline.ts.
// @ts-ignore: AS inline decorator
@inline
export function inlinedFromOtherFile(a: i32, b: i32): i32 {
  return a + b;
}
