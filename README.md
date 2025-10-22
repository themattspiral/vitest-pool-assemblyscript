# Vitest AssemblyScript Pool

A Vitest pool for running AssemblyScript tests with per-test crash isolation, coverage tracking, and a familiar testing API.

**Status**: Work in Progress - Core functionality implemented, API surface under active development

## Motivation

AssemblyScript lacks exception handling (no try/catch), making testing challenging. Existing frameworks have limitations:

- **Test crashes cascade**: One failing test kills all subsequent tests
- **Incorrect test counting**: Assertion counts reported as test counts
- **Limited coverage**: No per-test tracking or LCOV output
- **No parallelization**: Sequential execution only

This pool solves these problems by leveraging Vitest's ecosystem - its runner infrastructure, reporters, watch mode, and UI - while adding AssemblyScript-specific test execution and crash isolation.

## Planned Features

### Core Testing

- **Per-test crash isolation**: Each test runs in a fresh WASM instance. One test aborting doesn't affect others, adds <1ms extra overhead per test
- **Correct test counting**: Tests are `test()` blocks, not assertion calls
- **Familiar API**: Jest/Vitest-like syntax with `test()`, `describe()`, and `expect()`

### Coverage

- **Per-test coverage tracking**: Know which tests cover which code paths
- **Multiple formats**: LCOV, HTML, JSON, Cobertura
- **Coverage-guided test selection**: Run only tests affected by code changes

### Performance

- **Binary caching**: Compile once, reuse for all test runs
- **Fast iteration**: Watch mode with incremental compilation
- **Parallel test execution** (planned): Worker pool for concurrent test file execution

### Developer Experience

- **Vitest ecosystem integration**: Leverages Vitest's runner, reporters, watch mode, and UI
- **Rich matchers** (planned): `toBe()`, `toEqual()`, `toBeGreaterThan()`, `toBeCloseTo()`, etc.
- **Test organization** (planned): Nested `describe()` blocks with lifecycle hooks

## Current Status (October 2025)

- ✅ Vitest Pool integration (`ProcessPool` interface)
- ✅ Per-test WASM instance isolation
- ✅ Test registry pattern for crash safety
- ✅ Basic `test()` and `assert()` framework
- ✅ Binary caching between test discovery and execution

## Quick Example

```typescript
// tests/math.as.test.ts
import { test, assert } from 'vitest-pool-assemblyscript/assembly';

test('addition works', () => {
  const sum: i32 = 1 + 1;
  assert(sum == 2, 'expected 1 + 1 to equal 2');
});

test('multiplication works', () => {
  const product: i32 = 3 * 4;
  assert(product == 12, 'expected 3 * 4 to equal 12');
});
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'vitest-pool-assemblyscript',
    include: ['tests/**/*.as.test.ts'],
  }
});
```

## Architecture

Built using Vitest's [`ProcessPool` API](https://vitest.dev/advanced/pool) for alternative runtime execution:

### What We Leverage from Vitest

- **Runner infrastructure**: Test task structure, result reporting, state management
- **Watch mode**: File watching and incremental re-runs
- **Reporters**: Terminal output, UI, coverage reports
- **Configuration**: Standard Vitest config for test patterns, timeouts, etc.

### How It Works

1. **Test Discovery**: Compile AS → WASM, execute to query test registry, cache binary
2. **Test Execution**: Reuse cached binary, run each test in fresh WASM instance for crash isolation
3. **Result Reporting**: Collect results via WASM imports, report through Vitest's task structure

## Contributing

This is currently a hobby project being developed in the open. Issues and PRs welcome, but expect slower response times.

## License

MIT
