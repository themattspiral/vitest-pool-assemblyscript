// Never-imported source — exercises 0-hit reporting. The coverage provider parses
// assemblyScriptInclude sources via the AST, so this file appears in coverage with
// every statement/line uncovered even though NO test imports it. (No .meta.test.ts
// imports this on purpose.) Compared in .../statement/zerohit.test.ts. KEEP LINE-ALIGNED.

export function untestedAdd(a: i32, b: i32): i32 {
  let sum = a + b;
  return sum;
}

export function untestedBranch(n: i32): i32 {
  if (n > 0) {
    return 1;
  }
  return 0;
}
