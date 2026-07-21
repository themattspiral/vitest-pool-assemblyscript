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

Configure `wasmImportsFactory` to point to an ES module that exports a factory function which returns `WebAssembly.Imports`.

> ⚠️ The path should be **relative to your vitest project root** - that is, the  location of the shallowest vitest config file in your project.

```typescript
  // v4+
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

**Imports Factory function type signature:**
```typescript
type WasmImportsFactory = (moduleInfo: WasmImportsFactoryInfo) => WebAssembly.Imports;
```

A `WasmImportsFactoryInfo` object is provided to your function so you can do more useful things, like access memory:
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

> ℹ️ Each individual `test()` runs in its own WASM instance, so the `WebAssembly.Memory` you're accessing here is only for one test's lifetime at a time.

**Example User Imports Factory Function:**
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

You can provide imports for any module name you wish. This example factory function uses the **"env"** module.

**Example AssemblyScript source code:**
```typescript
@external("env", "parseIntStringFunction")
declare function parseIntStringFunction(input: string): i32;

export function runParseIntStringFunction(input: string): i32 {
  return parseIntStringFunction(input);
}
```

In the example source, it `declare`s the existance of an external function (which you are providing via your imports). This example uses the `@external` decorator to indicate this function is available within the **"env"** module.


## Module Names
If you omit the module name in `@external` e.g. `@external("parseIntStringFunction")`, or omit `@external` entirely, AssemblyScript uses the source file's own name (without the last file extension) as the module name, making it impractical to provide matching imports to every source file independently if you use imported functions across multiple places in your source. It is recommended to always specify a shared module name such as "env" (or your own unique module name) for this reason.

Conversely, if you need to provide imports targeted to a specific source file, this behavior provides a way to do that as well. For example, if you have a source AS file called **`my-file.as.ts`**:
```typescript
declare function myFunc(input: string): i32;
```

In this case the `@external` decorator is omitted. Now the AssemblyScript compiler will be looking for it in a module with the name **"my-file.as"** (filename without `.ts` extension), and so you can effectively import the function *only* to this file:
```js
export default function createWasmImports({ utils }) {
  return {
    // default source file module name
    // (omits the .ts extension)
    'my-file.as': {
      myFunc: (inputStrPtr) => {
        return parseInt(utils.liftString(inputStrPtr));
      }
    },

    env: {
      // you can still provide common/shared 
      // module functions here too
    }
  };
}
```

> ℹ️ This assumes no declarations in other files are explicitly looking for the **"my-file.as"** module - If they were, they could also access it.
