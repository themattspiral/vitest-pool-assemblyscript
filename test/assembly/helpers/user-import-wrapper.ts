
// provided by user imports

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "myUserFunction")
declare function myUserFunction(input: i32): i32;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("customUserEnv", "otherFunction")
declare function otherFunction(input: i32): i32;

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("customUserEnv", "parseIntStringFunction")
declare function parseIntStringFunction(input: string): i32;


export function runUserFunction(input: i32): i32 {
  return myUserFunction(input);
}

export function runOtherUserFunction(input: i32): i32 {
  return otherFunction(input);
}

export function runParseIntStringFunction(input: string): i32 {
  return parseIntStringFunction(input);
}
