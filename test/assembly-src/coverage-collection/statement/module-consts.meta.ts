// Const-only module — module-level constants and NOTHING else (no functions).
// Each folds to a WASM global init expression with no runtime block to count,
// so without the loaded-file synthesis they would read 0. Imported + used by
// module-consts.meta.test.ts; assertions in
// meta-verify/coverage-collection/statement/module-consts.test.ts. KEEP LINE-ALIGNED.

export const TABLE_SIZE: i32 = 1024;
export const MAX_RETRIES: i32 = 3;
export const ENABLED: bool = true;
