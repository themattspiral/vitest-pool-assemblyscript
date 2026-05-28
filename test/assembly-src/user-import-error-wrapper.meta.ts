
// provided by user imports

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "failingUserFunction")
declare function failingUserFunction(input: i32): i32;

export function runFailingUserFunction(input: i32): i32 {
  return failingUserFunction(input);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "failingUserFunctionNonexistantRef")
declare function failingUserFunctionNonexistantRef(input: i32): i32;

export function runFailingUserFunctionNonexistantRef(input: i32): i32 {
  return failingUserFunctionNonexistantRef(input);
}

// @ts-ignore: top level decorators are supported in AssemblyScript
@external("env", "failingUserFunctionStackOverflow")
declare function failingUserFunctionStackOverflow(input: i32): i32;

export function runFailingUserFunctionStackOverflow(input: i32): i32 {
  return failingUserFunctionStackOverflow(input);
}