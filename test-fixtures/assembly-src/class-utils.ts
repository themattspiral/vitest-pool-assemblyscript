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
  
  private member: (a: i32) => i32;
  bracelessMember: (a: i32) => i32;
  voidMember: () => void;

  constructor(initial: i32 = 0, max: i32 = 100) {
    this._value = initial;
    this._maxValue = max;

    this.member = (a: i32): i32 => {
      const nestedNamedFunc = function(b: i32): i32 {
        const doubleNestedArrowInNamedFunc = (c: i32): i32 => { return c + 1; };
        return doubleNestedArrowInNamedFunc(b);
      };
      const nestedNamedVar = function nestedNamedFcn(b: i32): i32 { return b + 1; };
      const nestedArrow = (b: i32): i32 => {
        const doubleNestedArrow = (c: i32): i32 => {
          let tripleNestedLet = (d: i32): i32 => d + 1;
          var tripleNestedVar = (d: i32): i32 => d + 2;
          const tripleNested = (d: i32): i32 => d + 3;
          const tripleNestedNamed = function(d: i32): i32 {
            return d + 4;
          };
          return tripleNestedNamed(tripleNested(tripleNestedLet(tripleNestedVar(c))));
        };
        const doubleNestedNamedFunc = function(c: i32): i32 { return c + 1; };
        const res1 = doubleNestedArrow(b);
        const res2 = doubleNestedNamedFunc(b);
        const res = res1 + res2;
        return res;
      };
      const nestedBracelessArrow = (b: i32): i32 => b + 1;

      // not sure why this would ever be needed since AS doesn't support JS-style closures,
      // but let's make sure we support it just in case
      const nestedVoid = (): void => { let x = 4; };
      nestedVoid();
      
      const x = 3, nestedNamedFuncMulti = function(b: i32): i32 { return b + 1; }, nestedArrowMulti = (b: i32): i32 => { return b + 1; }, nestedBracelessArrowMulti = (b: i32): i32 => nestedArrowMulti(b), z = 4, nestedNamedFuncMultiSpanLines = function(b: i32): i32 {
        return b + 1;
      }, nestedArrowMultiSpanLines = (b: i32): i32 => {
        return nestedNamedFuncMulti(b);
      };

      const thing1 = nestedArrowMulti(nestedNamedFunc(nestedNamedVar(nestedArrow(nestedBracelessArrow(a)))));
      const thing2 = nestedBracelessArrowMulti(nestedNamedFuncMultiSpanLines(nestedArrowMultiSpanLines(a)));
      return thing1
        + thing2;
    };

    this.bracelessMember = (a: i32): i32 => a + 2;

    this.voidMember = () => { let x = 4; };
    this.voidMember();
  }

  previewComplex(): i32 {
    return this.member(this.value);
  }

  previewPlusTwo(): i32 {
     return this.bracelessMember(this.value);
  }

  @inline
  incrementInlined(): void {
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

  // Method that uses setter method
  reset(): void {
    this.value = 0;
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

  internalNesting(a: i32): i32 {
    const nestedNamedFunc = function(b: i32): i32 {
      const doubleNestedArrowInNamedFunc = (c: i32): i32 => { return c + 1; };
      return doubleNestedArrowInNamedFunc(b);
    };
    const nestedNamedVar = function nestedNamedFcn(b: i32): i32 { return b + 1; };
    const nestedArrow = (b: i32): i32 => {
      const doubleNestedArrow = (c: i32): i32 => {
        let tripleNestedLet = (d: i32): i32 => d + 1;
        var tripleNestedVar = (d: i32): i32 => d + 2;
        const tripleNested = (d: i32): i32 => d + 3;
        const tripleNestedNamed = function(d: i32): i32 {
          return d + 4;
        };
        return tripleNestedNamed(tripleNested(tripleNestedLet(tripleNestedVar(c))));
      };
      const doubleNestedNamedFunc = function(c: i32): i32 { return c + 1; };
      const res1 = doubleNestedArrow(b);
      const res2 = doubleNestedNamedFunc(b);
      const res = res1 + res2;
      return res;
    };
    const nestedBracelessArrow = (b: i32): i32 => b + 1;

    // not sure why this would ever be needed since AS doesn't support JS-style closures,
    // but let's make sure we support it just in case
    const nestedVoid = (): void => { let x = 4; };
    nestedVoid();
    
    const x = 3, nestedNamedFuncMulti = function(b: i32): i32 { return b + 1; }, nestedArrowMulti = (b: i32): i32 => { return b + 1; }, nestedBracelessArrowMulti = (b: i32): i32 => nestedArrowMulti(b), z = 4, nestedNamedFuncMultiSpanLines = function(b: i32): i32 {
      return b + 1;
    }, nestedArrowMultiSpanLines = (b: i32): i32 => {
      return nestedNamedFuncMulti(b);
    };

    const thing1 = nestedArrowMulti(nestedNamedFunc(nestedNamedVar(nestedArrow(nestedBracelessArrow(a)))));
    const thing2 = nestedBracelessArrowMulti(nestedNamedFuncMultiSpanLines(nestedArrowMultiSpanLines(a)));
    return thing1
      + thing2;
  }
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
