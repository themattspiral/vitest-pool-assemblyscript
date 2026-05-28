
// provided by user imports

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "myUserFunction")
declare function myUserFunction(input: i32): i32;

export function runMyUserFunction(input: i32): i32 {
  return myUserFunction(input);
}
