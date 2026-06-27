// Module-declaration synthesis decision: an UNCONDITIONAL module-scope const/let
// folds to a WASM global (no counter) and is credited covered via the loaded-file
// synthesis; a const placed CONDITIONALLY (inside a block) is NOT synthesized and
// reads its real count. Driven by module-synthesis.meta.test.ts; v8 parity in
// meta-verify/coverage-collection/statement/module-synthesis.test.ts. KEEP LINE-ALIGNED.

export const ALWAYS_CONST: i32 = 10;
export let ALWAYS_LET: i32 = 20;
export function gate(): bool { return false; }
if (gate()) {
  const NEVER: i32 = 30;
  ALWAYS_LET = NEVER;
}
