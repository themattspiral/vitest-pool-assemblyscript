/**
 * Switch-branch fixtures for meta-verify, covering every switch shape we know
 * about. Each function is exercised with KNOWN inputs in branch-switch.meta.test.ts
 * so its per-arm branch hit counts are exactly hand-derivable and match v8's
 * "entered" branch semantics: an arm counts every time control ENTERS it, whether
 * by a matching case or by falling through into it.
 */

// Clean switch: every case has its own body (no fall-through), explicit default.
export function category(val: i32): i32 {
  switch (val) {
    case 1:
      return 10;
    case 2:
      return 20;
    default:
      return -1;
  }
}

// Empty fall-through switch: case 0 (empty) shares case 6's body; case 1 (empty)
// shares case 2's body; explicit default. The empty cases (0, 1) are the construct
// the empty-case fix targets — an untested empty case must read 0, an entered one
// its true count.
export function dayType(day: i32): i32 {
  let r: i32 = 0;
  switch (day) {
    case 0:
    case 6:
      r = 1;
      break;
    case 1:
    case 2:
      r = 2;
      break;
    default:
      r = 0;
  }
  return r;
}

// Switch WITHOUT an explicit default: Istanbul still reports a default arm (the
// "no case matched" path), whose hits are derived as switch-reached − Σ explicit.
export function classifySign(n: i32): i32 {
  let r: i32 = 0;
  switch (n) {
    case 0:
      r = 10;
      break;
    case 1:
      r = 20;
      break;
  }
  return r;
}

// Break-only case (`case 0: break;`): matched but runs no body. It is counted via
// its located `break`, not derived — distinct from an empty fall-through case.
export function firstOnly(n: i32): i32 {
  let r: i32 = -1;
  switch (n) {
    case 0:
      break;
    case 1:
      r = 1;
      break;
    default:
      r = 99;
  }
  return r;
}

// Trailing empty case falling into default (`case 2:` immediately before
// `default:`): pure chain-derivation cannot recover case 2's entered count (its
// match edge and the no-match edge merge into the default body), but instrumenting
// the empty block does.
export function emptyTrailing(n: i32): i32 {
  let r: i32 = 0;
  switch (n) {
    case 1:
      r = 10;
      break;
    case 2:
    default:
      r = 99;
  }
  return r;
}

// Body-bearing fall-through (each case has a body, no break): entered counts
// accumulate down the chain — a matched case enters its own body and every body
// below it until a break/default.
export function cumulative(n: i32): i32 {
  let r: i32 = 0;
  switch (n) {
    case 1:
      r += 1;
    case 2:
      r += 2;
    default:
      r += 4;
  }
  return r;
}

// Negative, large, and sparse case literals — all lower to comparison-chain
// `br_if` blocks with located literals at the case labels.
export function signBucket(n: i32): i32 {
  switch (n) {
    case -5:
      return 1;
    case 1000:
      return 2;
    case 7:
      return 3;
    default:
      return 0;
  }
}

// Enum-valued case labels (compiled as constant GlobalGets at the label position).
enum Color { Red, Green, Blue }
export function colorName(c: i32): i32 {
  switch (c) {
    case Color.Red:
      return 1;
    case Color.Green:
      return 2;
    case Color.Blue:
      return 3;
    default:
      return 0;
  }
}

// Nested switch: an inner switch inside an outer case. Two independent switch
// branches; the inner is only reached when the outer takes case 0.
export function grid(x: i32, y: i32): i32 {
  switch (x) {
    case 0:
      switch (y) {
        case 0:
          return 1;
        default:
          return 2;
      }
    default:
      return 3;
  }
}

// Explicit default in the MIDDLE of the case list: arms are reported in source
// order (case 1, default, case 2), not with default forced to the end.
export function midDefault(n: i32): i32 {
  switch (n) {
    case 1:
      return 1;
    default:
      return 0;
    case 2:
      return 2;
  }
}

// Empty fall-through case WITHOUT an explicit default: the implicit "no case
// matched" arm must be derived from the DISTINCT number of matched cases, not the
// sum of per-case entered counts. case 1 (empty) falls into case 2's body, so case
// 2's entered count already includes case 1's matches — counting both inflates the
// "matched" total and under-derives the implicit default. The implicit default is
// reached only when n matches no case.
export function fallthroughNoDefault(n: i32): i32 {
  let r: i32 = 0;
  switch (n) {
    case 1:
    case 2:
      r = 12;
      break;
    case 3:
      r = 3;
      break;
  }
  return r;
}

// CHAINED empty fall-through: case 0 AND case 1 are both empty and fall into case 2's
// body. An empty case's "entered" count telescopes down the chain — case 1 is entered
// by its own matches PLUS case 0's fall-through, and case 2's body by both plus its own.
export function chainedEmpty(n: i32): i32 {
  let r: i32 = 0;
  switch (n) {
    case 0:
    case 1:
    case 2:
      r = 10;
      break;
    case 3:
      r = 20;
      break;
    default:
      r = -1;
  }
  return r;
}
