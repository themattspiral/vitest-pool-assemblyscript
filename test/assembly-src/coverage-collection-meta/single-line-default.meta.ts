// Single-line function and constructor: the parameter default (`= N`) and the body
// statement share ONE source line. This is the edge case for the inlined-default-Const
// statement-attribution question: when a caller omits the default, the value is inlined
// at the default's DEFINITION site (here, the same line as the body statement). If that
// inlined Const's position fell inside the body statement's range, statement matching
// (min-position within range) could read the caller's count instead of the real one.
//
// The default lives in the parameter list (before the body `{`), so even on one line its
// column precedes the statement's range — this fixture verifies that empirically.

export function slAdd(n: i32, base: i32 = 100): i32 { return n + base; }

export class SLThing { v: i32; constructor(start: i32 = 50) { this.v = start; } }
