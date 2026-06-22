// Coverage source for .fails test coverage collection scenario.
// Tests verify that functions called in expected-failure tests still get coverage,
// and that uncalled functions remain at 0 hits.

export function failsTarget(): i32 {
  return 99;
}

export function failsUncovered(): i32 {
  return 0;
}
