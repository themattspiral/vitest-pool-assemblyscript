// Module-declaration synthesis parity twin (v8 oracle) — mirrors the AS fixture
// coverage-collection/statement/module-synthesis.meta.ts line-for-line. Compared
// in meta-verify/coverage-collection/statement/module-synthesis.test.ts. KEEP
// LINE-ALIGNED (this header matches the AS fixture's line count — do not change
// the line count).

export const ALWAYS_CONST = 10;
export let ALWAYS_LET = 20;
export function gate() { return false; }
if (gate()) {
  const NEVER = 30;
  ALWAYS_LET = NEVER;
}
