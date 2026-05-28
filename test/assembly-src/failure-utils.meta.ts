
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

export function fails(): i32 {
  const arr: i32[] = [1, 2, 3];
  const value = arr[10]; // Out of bounds - will abort
  return value;
}

export function crash(num: i32, str: string): string {
  // infinite recursion - will overflow, crash runtime, and get caught by executor
  return str + crash(num + 1, str);
}

export function failsSingleLine(): i32 { const arr: i32[] = [1, 2, 3]; const value = arr[10]; return value; }

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

export class ClassWithFailingMethods {
  value: i32;
  failingMemberFunction: () => i32;

  constructor(a: i32 = 0) {
    this.value = a;
    this.failingMemberFunction = (): i32 => {
      const arr: i32[] = [1, 2, 3];
      const value = arr[10]; // Out of bounds - will abort
      return value;
    };
  }

  get myValueGetter(): i32 {
    return this.value;
  }

  fail(): i32 {
    const arr: i32[] = [1, 2, this.myValueGetter];
    const value = arr[10]; // Out of bounds - will abort
    return value;
  }

  crash(num: i32, str: string): string {
    // infinite recursion - will overflow, crash runtime, and get caught by executor
    return str + this.crash(num + 1, str);
  }
}

export function growBoom(): string {
  let str = "";
  for (let i: u64 = 0; i < 3_000_000_000; i++) {
    str += i.toString();
  }
  return str;
}

export function badLoad(): i32 {
  return load<i32>(-1);
}

export function badDiv(): i32 {
  return 5 / 0;
}
