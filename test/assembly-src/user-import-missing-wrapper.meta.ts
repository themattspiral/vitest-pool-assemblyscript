// provided by user imports

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("customUserModule", "otherFunction")
declare function otherFunction(input: i32): i32;
export function runOtherUserFunction(input: i32): i32 {
  return otherFunction(input);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("anotherCustomUserModule", "yetAnotherFunction")
declare function yetAnotherFunction(input: i32): i32;
export function runYetAnotherFunction(input: i32): i32 {
  return yetAnotherFunction(input);
}
