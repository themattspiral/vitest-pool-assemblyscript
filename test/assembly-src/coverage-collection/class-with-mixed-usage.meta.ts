/**
 * Class with various method types for partial coverage testing.
 * Tests use constructor, increment, and value getter.
 * decrement, reset, and static create are left uncalled.
 */
export class MixedCounter {
  private _value: i32;

  constructor(initial: i32 = 0) {
    this._value = initial;
  }

  increment(): void {
    this._value++;
  }

  decrement(): void {
    this._value--;
  }

  reset(): void {
    this._value = 0;
  }

  get value(): i32 {
    return this._value;
  }

  static create(initial: i32 = 0): MixedCounter {
    return new MixedCounter(initial);
  }
}
