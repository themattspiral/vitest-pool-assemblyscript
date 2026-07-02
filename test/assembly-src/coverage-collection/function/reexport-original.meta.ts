/**
 * Original source file for re-export coverage verification.
 * Functions defined here are re-exported by reexport-barrel.meta.ts.
 */

export function originalFunc(x: i32): i32 {
  return x + 1;
}

export function notReexported(x: i32): i32 {
  return x - 1;
}
