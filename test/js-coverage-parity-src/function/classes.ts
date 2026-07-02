/**
 * Class function-coverage parity twin (v8 oracle) — mirrors the AS fixture
 * coverage-collection/function/classes.meta.ts line-for-line, with the same
 * instantiation pattern via function/classes.test.ts, so v8's function coverage is
 * the oracle. Marker's empty constructor is a v8-only function (AS drops it).
 * Compared in meta-verify/coverage-collection/function/classes.test.ts.
 */

export class Counter {
  private _value: number;

  constructor(initial: number) {
    this._value = initial;
  }

  increment(): void {
    this._value++;
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
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
