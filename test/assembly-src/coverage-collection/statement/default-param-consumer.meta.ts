import { addBase, Thing } from "./default-param-helper.meta";

// Calls addBase with the default arg omitted; the inlined default Const maps back to
// the helper's definition.
export function useAddBase(n: i32): i32 {
  return addBase(n);
}

// Constructs Thing with no arg (defaulted constructor) in a `const` declaration
// inside a folded if(true): the inlined Thing default Const lands at the helper's
// constructor signature, and must not pollute this function's statement coverage.
export function makeThingFolded(): i32 {
  if (true) {
    const c = new Thing();
    return c.v;
  }
  return -1;
}
