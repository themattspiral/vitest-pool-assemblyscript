# Debug Tools

This directory contains scripts used during research, development, and diagnostics for the vitest-pool-assemblyscript project. These tools were instrumental in discovering and validating the dual-binary coverage approach and other architectural decisions.

## Directory Structure

```
debug-tools/
├── research/       # Research scripts exploring different approaches
├── diagnostics/    # Diagnostic scripts for debugging specific issues
└── *.mjs          # Active solution POCs and key validation scripts
```

## Active Solution POCs (Root)

These scripts demonstrate and validate the current production implementation:

- **test-exportTable-solution.mjs** - Validates the `--exportTable` approach for test execution by calling test functions directly from the exported function table. This is the foundation of our test discovery and execution architecture.

- **test-coverage-collection.mjs** - Demonstrates coverage data collection from instrumented WASM binaries using `__coverage_trace()` callbacks. Shows how coverage counters accumulate during test execution.

- **test-coverage-with-accurate-sourcemaps.mjs** - Validates the dual-binary approach: execute tests on clean binary for accurate error locations, collect coverage from instrumented binary. This solves the source map corruption problem.

- **test-lcov-generation.mjs** - Demonstrates LCOV report generation from aggregated coverage data and debug info. Validates line number accuracy and standard LCOV format output.

- **test-exportTable-with-coverage.mjs** - Full integration test combining `--exportTable` test execution with coverage collection, demonstrating the complete dual-binary workflow.

## Research (research/)

Scripts exploring different architectural approaches during the discovery phase:

- **APPROACH-3-separate-binaries.mjs** - Early exploration of compiling separate binaries for test execution vs coverage collection. Led to the dual-binary approach.

- **FINAL-complete-understanding.mjs** - Comprehensive validation that dual-binary approach works correctly, documenting the complete understanding of how Binaryen, source maps, and V8 interact.

- **FINAL-why-binaryen-sourcemaps-are-impractical.mjs** - Proof that Binaryen's source map generation doesn't work for our use case, documenting why we can't rely on Binaryen to preserve AssemblyScript source maps.

## Diagnostics (diagnostics/)

Tools for debugging specific issues, validating assumptions, and performance benchmarking:

**Benchmarks:**
- **benchmark-isolation.mjs** - Comprehensive benchmark validating per-test WASM isolation overhead (~0.43ms per test). Critical benchmark that justified the per-test isolation architectural decision. Includes warmup, memory overhead analysis, and performance recommendations.

- **benchmark-coverage-overhead.mjs** - Benchmarks Binaryen coverage instrumentation overhead (2.05ms avg). Used to validate Phase 1d success criteria (<20ms target). Includes JIT warmup and detailed timing analysis across all test files.

**Source Map Diagnostics:**
- **test-v8-positions.mjs** - Diagnostic for extracting WAT line:column positions from V8 stack traces using `Error.prepareStackTrace`. Used to validate source map accuracy.

- **inspect-sourcemap.mjs** - Inspects AS compiler source map output, explores mappings structure, and tests position lookups. Useful for debugging source map issues and understanding the mapping format.

- **test-sourcemap-bug.mjs** - Reproduces and diagnoses the source map corruption bug when Binaryen instruments WASM. Documents the exact nature of the problem that dual-binary solves.

**Architecture Validation:**
- **test-which-binary-v8-uses.mjs** - Proves that V8 uses the binary passed to `WebAssembly.instantiate()`, not any cached version. Critical for understanding dual-binary execution.

- **test-exportTable-WITHOUT-binaryen.mjs** - Validates that `--exportTable` works on clean AssemblyScript compiler output without Binaryen post-processing. Shows that test execution doesn't require instrumentation.

- **test-debug-sections.mjs** - Explores WASM debug sections and DWARF debug info to understand what metadata is available for source mapping.

## Usage Notes

- **Root POC scripts** are the most current and reflect the production implementation
- **Research scripts** document the exploration process and architectural decisions
- **Diagnostic scripts** can be run to verify specific behaviors or debug issues
- All scripts are standalone and can be executed with `node <script-name>.mjs`
- Scripts use AssemblyScript compiler API directly to compile test fixtures on-the-fly

## Relationship to Production Code

The techniques validated in these scripts are implemented in:
- `src/compiler.ts` - Dual-binary compilation (coverage modes)
- `src/executor.ts` - Test execution via `--exportTable`, coverage collection
- `src/binaryen/coverage-instrumentation.ts` - Binaryen-based coverage instrumentation
- `src/transforms/extract-function-metadata.mjs` - Function metadata extraction for coverage
- `src/coverage/lcov-reporter.js` - LCOV report generation
- `src/pool.ts` - Complete integration of all components

## Key Learnings Captured

1. **Dual-binary approach is necessary** - Binaryen instrumentation corrupts source maps, so we must execute tests on clean binary while collecting coverage from instrumented binary
2. **--exportTable enables direct test calls** - Function table export allows calling test functions by index without string-based exports
3. **V8 uses instantiated binary** - Each `WebAssembly.instantiate()` call uses the binary provided, enabling dual-binary execution in the same process
4. **Line numbers must come from AST** - Using `node.range.start` on function declarations gives accurate line numbers for LCOV
5. **LCOV is the standard** - Single `coverage/lcov.info` file compatible with all major coverage tools
