import { Counter } from '../assembly-src/class-utils';

// A function with an expression that will come from another file
//   - the default Counter contructor param gets inlined in this function
//     as a local const with a debug location pointing (correctly) to the
//     constructor in class utils
export function useCounter(): i32 {
  const c: Counter = new Counter();
  return c.value;
}

export function useCounterWithIfBlock(a: i32): i32 {
  if (a < 1) {
    const c: Counter = new Counter();
    return c.value;
  } else {
    return a + 1;
  }
}

export function useCounterWithSwitchBlock(a: i32): i32 {
  switch (a) {
    case 1:
      const c1: Counter = new Counter();
      return c1.value;
    case 2:
      const c2: Counter = new Counter(1);
      return c2.value;
    default:
      return a + 1;
  }
}

export function useCounterWithIfBlockWithForeignExpression(a: i32): i32 {
  if (new Counter().value === a) {
    const c: Counter = new Counter(2);
    return c.value;
  } else {
    return a + 1;
  }
}

export function useCounterWithIfBlockWithConstantCondition(): i32 {
  if (true) {
    if (true) {
      const c: Counter = new Counter();
      const val = c.bracelessMember(1);
      return val;
    }
  }
}
