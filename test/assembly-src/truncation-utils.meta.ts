/**
 * Classes used by truncation.meta.test.ts to drive failure-message truncation
 * scenarios — short class names, long class names, name-exceeds-budget, and a
 * self-referential class for cycle handling.
 */

/** Small 2-field class for the "fits some / truncates rest" short-form scenario. */
export class TwoField {
  name: string;
  count: i32;

  constructor(name: string, count: i32) {
    this.name = name;
    this.count = count;
  }
}

/** 19-character class name with three small fields — exercises "long type name still leaves
 *  room for some content" vs "type name + scaffolding consumes most of the budget" scenarios. */
export class ReallyLongClassName {
  alpha: i32;
  beta: i32;
  gamma: i32;

  constructor(alpha: i32, beta: i32, gamma: i32) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
  }
}

/** 50-character class name — the type name alone exceeds the short-form budget, exercising
 *  the "scaffolding always emitted even when it pushes the output past `budget`" rule. */
export class EvenMoreExtremelyLongClassNameThatExceedsTheBudget {
  x: i32;

  constructor(x: i32) {
    this.x = x;
  }
}

/** Self-referential class for cycle-handling tests. `next` starts null; assign after
 *  construction to form a cycle (e.g. `n.next = n`). Class name kept short so the
 *  rendered `next: [Circular]` token fits inside the short-form budget — that's the
 *  whole point of the test (verify [Circular] participates in budget like any other piece). */
export class Cycle {
  name: string;
  next: Cycle | null = null;

  constructor(name: string) {
    this.name = name;
  }
}
