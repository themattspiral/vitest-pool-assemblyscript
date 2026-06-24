/**
 * Class member kinds + inheritance for the 100% passing set: constructor with a
 * default parameter, regular method, getter, covered setter, @inline method, private
 * method + caller, static method, an @operator overload, and a base/subclass pair
 * whose subclass constructor calls super(). Branch-free by design (branches live in
 * control-flow.ts), so every member is exercised to 100% on all four types.
 */

export class Counter {
  private _value: i32;

  // Default parameter — exercised both defaulted (new Counter()) and explicit.
  constructor(initial: i32 = 0) {
    this._value = initial;
  }

  increment(): void {
    this._value += 1;
  }

  get value(): i32 {
    return this._value;
  }

  set value(v: i32) {
    this._value = v;
  }

  // @inline is stripped by the default stripInline, so this stays a real, covered fn.
  @inline
  doubled(): i32 {
    return this._value * 2;
  }

  private tripled(): i32 {
    return this._value * 3;
  }

  callsPrivate(): i32 {
    return this.tripled();
  }

  static startingAt(initial: i32): Counter {
    return new Counter(initial);
  }
}

export class Animal {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  describe(): string {
    return this.name;
  }
}

export class Dog extends Animal {
  constructor(name: string) {
    super(name);
  }

  // Overrides Animal#describe; Animal#describe is covered via a direct Animal instance.
  describe(): string {
    return this.name + " (dog)";
  }

  bark(): string {
    return "woof";
  }
}

export class Vec2 {
  x: f64;
  y: f64;

  constructor(x: f64, y: f64) {
    this.x = x;
    this.y = y;
  }

  // @ts-ignore: AS operator decorator
  @operator("+")
  static add(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  magnitude(): f64 {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
}
