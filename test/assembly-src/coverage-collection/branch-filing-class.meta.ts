/**
 * Minimal class with a DEFAULTED constructor param, used by branch-filing.meta.ts.
 * Calling `new Box()` with no argument inlines this default `0` as a Const whose
 * source location points back HERE (this file), not the call site — the
 * foreign-inlined-default-param shape the home-file arm-location fix handles.
 */
export class Box {
  value: i32;
  constructor(initial: i32 = 0) {
    this.value = initial;
  }
}
