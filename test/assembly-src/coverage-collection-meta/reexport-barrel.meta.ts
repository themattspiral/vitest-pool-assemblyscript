/**
 * Barrel file for re-export coverage verification.
 * Re-exports from reexport-original.meta.ts.
 * Question: does originalFunc get attributed to this file, the original, or both?
 */

export { originalFunc } from './reexport-original.meta';

/** Function defined in the barrel file itself */
export function barrelOwn(x: i32): i32 {
  return x * 3;
}
