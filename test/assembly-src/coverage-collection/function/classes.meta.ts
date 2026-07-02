/**
 * Consolidated class function-coverage fixture: every member kind on a partially
 * covered class (constructor, method, getter, a COVERED setter, static, and an
 * uncovered method), plus an inheritance trio whose subclass constructors call
 * super() — which counts toward the base constructor — with one overridden and one
 * inherited method. Twinned line-for-line by js-coverage-parity-src/function/classes.ts.
 */

export class Counter {
  private _value: i32;

  constructor(initial: i32) {
    this._value = initial;
  }

  increment(): void {
    this._value++;
  }

  get value(): i32 {
    return this._value;
  }

  set value(v: i32) {
    this._value = v;
  }

  reset(): void {
    this._value = 0;
  }

  static make(): Counter {
    return new Counter(0);
  }
}

export class Animal {
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  speak(): string {
    return "...";
  }

  move(): string {
    return "moves";
  }

  get name(): string {
    return this._name;
  }
}

export class Dog extends Animal {
  constructor(name: string) {
    super(name);
  }

  move(): string {
    return "runs";
  }

  bark(): string {
    return "woof";
  }
}

export class Cat extends Animal {
  constructor(name: string) {
    super(name);
  }

  meow(): string {
    return "meow";
  }
}

// Empty-body divergence: AS drops the empty constructor (no source location to
// instrument), while v8 keeps it — a v8-only function in the parity comparison.
export class Marker {
  constructor() {}
}
