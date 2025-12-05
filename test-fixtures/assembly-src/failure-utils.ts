
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
