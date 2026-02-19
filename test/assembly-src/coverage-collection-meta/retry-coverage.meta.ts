// Coverage source for retry coverage accumulation scenario.
// Tests verify that hit counts accumulate across retry attempts
// (each attempt creates a fresh WASM instance and reads coverage independently).

export function retryTarget(): i32 {
  return 10;
}

export function retryHelper(): i32 {
  return 20;
}
