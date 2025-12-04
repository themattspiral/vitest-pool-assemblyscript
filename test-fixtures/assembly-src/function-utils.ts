function namedFuncWithCallbackArg(input: i32, callback: (a: i32) => i32): i32 {
  return callback(input) + 1;
}

function basicAdd(a: i32): i32 {
  return a + 1;
}

export const oneLiteral = 1, arrowMulti = (a: i32): i32 => a + 1, c = 'something', d = function(b: i32): i32 {
  return b + 1;
};

export const arrowFunc = (a: i32): i32 => {
  const nestedNamedFunc = function(b: i32): i32 {
    const doubleNestedArrowInNamedFunc = (c: i32): i32 => { return c + 1; };
    return doubleNestedArrowInNamedFunc(b);
  };
  const nestedNamedVar = function nestedNamedFcn(b: i32): i32 { return b + 1; };
  const nestedArrow = (b: i32): i32 => {
    const doubleNestedArrowInArrow = (c: i32): i32 => { return c + 1; };
    const doubleNestedNamedFuncInArrow = function(c: i32): i32 { return c + 1; };
    const res1 = doubleNestedArrowInArrow(b);
    const res2 = doubleNestedNamedFuncInArrow(b);
    const res = res1 + res2;
    return res;
  };
  const nestedBracelessArrow = (b: i32): i32 => b + 1;
  const x = 3, nestedArrowMulti = (b: i32): i32 => b + 1, z = 4, nestedNamedFuncMultiSpanLines = function(b: i32): i32 {
    return b + 1;
  }, nestedArrowMultiSpanLines = (b: i32): i32 => {
    return b + 1;
  };

  const thing1 = nestedArrowMulti(nestedNamedFunc(nestedNamedVar(nestedArrow(nestedBracelessArrow(a)))));
  return nestedNamedFuncMultiSpanLines(nestedArrowMultiSpanLines(thing1));
}

export const bracelessArrowFunc = (x: i32): i32 =>  x * 2;

export function callbackPassNamedFunc(): i32 {
  return namedFuncWithCallbackArg(2, basicAdd);
}

export function callbackPassArrowFunc(): i32 {
  return namedFuncWithCallbackArg(2, arrowFunc);
}

export function callbackPassAnonFunc(): i32 {
  return namedFuncWithCallbackArg(3, (a: i32) => a + 1);
}
