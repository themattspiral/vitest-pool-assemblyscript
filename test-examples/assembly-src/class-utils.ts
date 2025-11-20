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
  
  memberArrowFunc_IncrementPreview: (a: i32) => i32;

  constructor(initial: i32 = 0, max: i32 = 100) {
    this._value = initial;
    this._maxValue = max;

    this.memberArrowFunc_IncrementPreview = (a: i32): i32 => {
      const res: i32 = a + 1;
      return res;
    };
  }

  previewIncrement(): i32 {
    return this.memberArrowFunc_IncrementPreview(this._value);
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
