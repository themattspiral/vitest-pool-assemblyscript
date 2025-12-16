// internal named function declaration that takes a callback
function namedFuncWithCallbackArg(input: i32, callback: (a: i32) => i32): i32 {
  return callback(input) + 1;
}

// internal arrow function that takes a callback
const arrowWithCallbackArg = (input: i32, callback: (a: i32) => i32): i32 => {
  return callback(input) + 1;
}

function basicAdd(a: i32): i32 {
  return a + 1;
}

export function constantReturn(): i32 {
  return 1;
}

export const one = 1, namedFuncMulti = function(b: i32): i32 { return b + 1; }, arrowMulti = (a: i32): i32 => { return a + 1; }, bracelessArrowMulti = (a: i32): i32 => a + 1, c = 'something', namedFuncMultiSpanLines = function(b: i32): i32 {
  return b + 1;
};

export const bracelessArrowFunc = (x: i32): i32 =>  namedFuncMulti(x) * bracelessArrowMulti(1);

// In theory AS supports class expressions because it parses them, but as of 0.28.9 it fails to compile with:
//    "ERROR AS100: Not implemented: Block-scoped class declarations or expressions"
//
// const MyCounterClass = class InternalMiniCounter {
//   private _value: i32;
//   member: (a: i32) => i32;
//   constructor() { ... }
// };

export const arrowFuncWithNesting = (a: i32): i32 => {
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

export function declaredFuncWithNesting(a: i32): i32 {
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

export function callbackPassNamedFunc(): i32 {
  return namedFuncWithCallbackArg(2, basicAdd);
}

export function callbackPassArrowFunc(): i32 {
  return namedFuncWithCallbackArg(2, arrowFuncWithNesting);
}

export function callbackPassAnonFunc(): i32 {
  return namedFuncWithCallbackArg(3, (a: i32) => {
    return a + 1;
  });
}

export function callbackPassAnonFuncBraceless(): i32 {
  return namedFuncWithCallbackArg(3, (a: i32) => a + 1);
}

export function arrowCallbackPassNamedFunc(): i32 {
  return arrowWithCallbackArg(2, basicAdd);
}

export function arrowCallbackPassArrowFunc(): i32 {
  return arrowWithCallbackArg(2, arrowFuncWithNesting);
}

export function arrowCallbackPassAnonFunc(): i32 {
  return arrowWithCallbackArg(3, (a: i32) => {
    return a + 1;
  });
}

export function arrowCallbackPassAnonFuncBraceless(): i32 {
  return arrowWithCallbackArg(3, (a: i32) => a + 1);
}