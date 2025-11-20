/**
 * Class utilities for testing coverage of class members
 *
 * Tests that MethodDeclaration covers:
 * - Regular methods
 * - Constructor
 * - Getters
 * - Setters
 */

export class Counter {
  private _value: i32;
  private _maxValue: i32;
  
  plusTwo: (a: i32) => i32;
  memberNested: (a: i32) => i32;

  constructor(initial: i32 = 0, max: i32 = 100) {
    this._value = initial;
    this._maxValue = max;

    this.plusTwo = (a: i32): i32 => {
      const plusOne = function(a: i32): i32 {
        return a + 1;
      }

      const plus1 = (a: i32): i32 => a + 1;

      return plus1(plusOne(a));
    };

    this.memberNested = (a: i32): i32 => {
      const nested = function(b: i32): i32 {
        const doubleNested = (c: i32): i32 => { return c + 1; };
        return doubleNested(b);
      };
      const nestedNamedVar = function nestedNamedFcn(b: i32): i32 { return b + 1; };
      const nestedArrow = (b: i32): i32 => { return b + 1; };
      const nestedBracelessArrow = (b: i32): i32 => b + 1;
      const x = 3, y = (b: i32): i32 => b + 1, z = 4;

      return y(nested(nestedNamedVar(nestedArrow(nestedBracelessArrow(a)))));
    }
  }

  previewPlusTwo(): i32 {
    return this.plusTwo(this._value);
  }

  @inline
  increment(): void {
    if (this._value < this._maxValue) {
      this._value++;
    }
  }

  // Regular method
  decrement(): void {
    if (this._value > 0) {
      this._value--;
    }
  }

  // Regular method with return
  add(amount: i32): i32 {
    const newValue = this._value + amount;
    if (newValue <= this._maxValue) {
      this._value = newValue;
    }
    return this._value;
  }

  // Getter
  get value(): i32 {
    return this._value;
  }

  // Setter
  set value(newValue: i32) {
    if (newValue >= 0 && newValue <= this._maxValue) {
      this._value = newValue;
    }
  }

  // Getter
  get maxValue(): i32 {
    return this._maxValue;
  }

  // Setter
  set maxValue(newMax: i32) {
    if (newMax >= this._value) {
      this._maxValue = newMax;
    }
  }

  // Method that uses other methods
  reset(): void {
    this._value = 0;
  }

  // Static method
  static create(initial: i32): Counter {
    return new Counter(initial);
  }

  // Unused method (should appear in coverage at 0%)
  unusedMethod(): i32 {
    return this._value * 2;
  }

  // Private method with private keyword
  private doubleValue(): i32 {
    return this._value * 2;
  }

  // Method that uses private method
  getDoubled(): i32 {
    return this.doubleValue();
  }

  internalNesting(): i32 {
    const nested = function(b: i32): i32 {
      const doubleNested = (c: i32): i32 => { return c + 1; };
      return doubleNested(b);
    };
    const nestedNamedVar = function nestedNamedFcn(b: i32): i32 { return b + 1; };
    const nestedArrow = (b: i32): i32 => { return b + 1; };
    const nestedBracelessArrow = (b: i32): i32 => b + 1;
    const x = 3, y = (b: i32): i32 => b + 1, z = 4;

    return y(nested(nestedNamedVar(nestedArrow(nestedBracelessArrow(this._value)))));
  }

  // Note: AS doesn't support #privateMethod syntax (ES2022 private fields)
  // Only the `private` keyword is supported for access modifiers
}

/**
 * Unused class - never instantiated
 * All methods should appear in coverage at 0%
 */
export class UnusedCounter {
  private _count: i32;

  constructor(start: i32 = 0) {
    this._count = start;
  }

  increment(): void {
    this._count++;
  }

  get count(): i32 {
    return this._count;
  }

  set count(value: i32) {
    this._count = value;
  }

  // Static method
  static createDefault(): UnusedCounter {
    return new UnusedCounter(0);
  }

  // Private method
  private tripleCount(): i32 {
    return this._count * 3;
  }

  // Method that uses private method
  getTripled(): i32 {
    return this.tripleCount();
  }
}
