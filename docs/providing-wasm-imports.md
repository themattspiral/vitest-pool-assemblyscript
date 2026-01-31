# Providing WASM Imports

- [Framework-Provided Imports](#framework-provided-imports)
- [User-Provided Imports](#user-provided-imports)
- [Module Names](#module-names)

## Framework-Provided Imports

#### `console`
The pool provides the full implementation of the [AssemblyScript `console` interface](https://www.assemblyscript.org/stdlib/console.html). This means you can transparently use `console.log("some string")` in your tests, and the output will be fed to vitest and displayed with the test results.

If you prefer to do something else with your test console output, you may provide your own versions of these functions to the "env" module - See the next section for details on how to do this.

#### `trace`
The pool also provides an implementation for `trace`, which passes through to Node `console.trace()` immediately for debugging.

#### `abort`
The pool handles assertion errors, runtime errors, and expected throws by providing an abort handler. This cannot be user-overridden.

## User-Provided Imports

To provide your own WebAssembly imports, configure `wasmImportsFactory` to point to an ES module which exports a factory function to create your imports

> ⚠️ The path should be **relative to your vitest project root** - that is, the  location of the shallowest vitest config file in your project.

```typescript
  // v4
  // ...
    pool: createAssemblyScriptPool({
      wasmImportsFactory: 'test-helpers/create-imports.js',
    })
  // ...

  // v3
  // ...
  poolOptions: {
    assemblyScript: {
      wasmImportsFactory: 'test-helpers/create-imports.js',
    }
  }
  // ...
```

The type signature for this function looks like this:
```typescript
type WasmImportsFactory = (moduleInfo: WasmImportsFactoryInfo) => WebAssembly.Imports;
```

And the `moduleInfo` argument that it is provided with looks like this:
```typescript
interface WasmImportsFactoryInfo {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  utils: {
    // convenience function for extracting returned strings from WASM memory
    liftString: (stringPtr: number) => string | undefined;
  }
}
```

You may provide imports for any module name you wish. Here is an example factory function which uses the "env" module:
```js
export default function createWasmImports({ memory, module, utils }) {
  return {
    env: {
      parseIntStringFunction: (inputStrPtr) => {
        return parseInt(utils.liftString(inputStrPtr));
      }
    }
  };
}
```

Example AssemblyScript source code which uses this imported function (the "env" module name is specified):
```typescript
@external("env", "parseIntStringFunction")
declare function parseIntStringFunction(input: string): i32;

export function runParseIntStringFunction(input: string): i32 {
  return parseIntStringFunction(input);
}
```

## Module Names
If you omit the module name in `@external` (e.g. `@external("parseIntStringFunction")`) or omit `@external` entirely, AssemblyScript uses the source file's own name (without the last file extension) as the module name, making it impractical to provide matching imports to every source file independently if you use imported functions across multiple places in your source. It is recommended to always specify a shared module name (such as "env") for this reason.

Conversely, if you need to provide imports targeted to a specific source file, this behavior provides a way to do that as well. For example, if you have a source AS file called `my-file.as.ts` with `declare function myFunc(input: string): i32;` in it and omit the `@external` decorator, then you can import the function *only to this file* with:
```js
export default function createWasmImports({ utils }) {
  return {
    // default source file module name (omits the .ts extension)
    'my-file.as': {
      myFunc: (inputStrPtr) => {
        return parseInt(utils.liftString(inputStrPtr));
      }
    }
  };
}
```
