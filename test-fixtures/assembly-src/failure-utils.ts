
function myNamedFuncWithCallbackArg(myCallback: () => i32): i32 {
  return myCallback();
}

function myFailingNamedFunc(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

const myFailingArrowFunc = (): i32 => {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
};

export const a = 1, arrowDeclaration = (a: i32): i32 => a + 1, c = 'something', d = function(b: i32): i32 {
  return b + 1;
};

// @ts-ignore: decorators on top-level variables are supported in AssemblyScript
@inline
export const decoratedArrowFunc = (a: i32): i32 => {
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

export const bracelessArrowFunc = (x: i32): i32 =>  x * 2;

// @ts-ignore: decorators on top-level variables are supported in AssemblyScript
@inline
export const decoratedBracelessArrowFunc = (x: i32): i32 =>  x * 2;

export function failNamedFunc(): i32 {
  return myFailingNamedFunc();
}

export function failArrowFunc(): i32 {
  return myFailingArrowFunc();
}

export function failNamedCallbackInNamed(): i32 {
  return myNamedFuncWithCallbackArg(myFailingNamedFunc);
}

export function failArrowCallbackInNamed(): i32 {
  return myNamedFuncWithCallbackArg(myFailingArrowFunc);
}

export function failAnonCallbackInNamed(): i32 {
  return myNamedFuncWithCallbackArg(() => {
    const arr: i32[] = [1, 2, 3];
    const value = arr[10]; // Out of bounds - will abort
    return value;
  });
}

export function failAnonCallbackInNamedCallsNamed(): i32 {
  return myNamedFuncWithCallbackArg(() => myFailingNamedFunc());
}

export function failAnonCallbackInNamedCallsArrow(): i32 {
  return myNamedFuncWithCallbackArg(() => myFailingArrowFunc());
}

// This function won't be called in tests - should show 0% coverage
export function unusedFunction(): i32 {
  return 42;
}