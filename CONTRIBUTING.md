# Contributing to vitest-pool-assemblyscript

Thanks for your interest in contributing! This project is pre-1.0 and actively evolving, and contributions are welcome. This guide will help you get started and set expectations for the process.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new) with:

- A clear and descriptive title
- Expected vs actual behavior
- Steps to reproduce the behavior
- Your environment: Node version, OS, vitest version, AssemblyScript version
- Any relevant configuration (vitest config, pool options)
- Error output or screenshots if applicable

### Suggesting Features

Feature suggestions are welcome! Please [open an issue](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new) to discuss before starting any implementation work. This is especially important while the project is pre-1.0, as the API and architecture are still stabilizing, and early discussion helps avoid duplicated effort and misalignment.

Check the [roadmap](README.md#current-limitations--roadmap) first to see if your idea is already planned or explicitly out of scope.

### Submitting Changes

Bug fixes, documentation improvements, and small corrections can go straight to a PR.

Anything that adds or modifies functionality should be [discussed](https://github.com/themattspiral/vitest-pool-assemblyscript/issues/new) before implementation.

When you're ready to submit a pull request:

1. Fork the repository and create a branch from `main`
2. Follow the [Developer Setup](docs/developer-guide.md#developer-setup) instructions to get a working development environment
3. Make your changes, following the [code guidelines](#code-guidelines) below
4. Ensure all tests pass: both [local and external](docs/developer-guide.md#local-vs-external-testing)
    - `npm test` for local
    - `npm run eetest` for external v4 and v3
5. Open a pull request

#### Pull Request Expectations

- **Use a clear and descriptive title** for the PR
- **Describe your changes** in as much detail as necessary. Explain what changed and why.
- **Keep PRs focused** - Aim for one logical change per PR
- **Follow existing patterns** - Naming, file organization, [coding style](#code-guidelines)
- **Include tests** for new functionality and bug fixes, adding [meta verify tests](docs/developer-guide.md#standard-tests-vs-meta-tests) for vitest behavior and failure mode verification
- **Maintain coverage thresholds** in the ["passing" suite's assembly-src fixtures](docs/developer-guide.md#standard-tests-vs-meta-tests) at 100%
- Please **avoid refactoring unrelated code** within the same PR. Refactoring is fine where it touches your changes.

## Code Guidelines

The [Developer Guide](docs/developer-guide.md) covers the development environment, build process, and testing in detail.

The easiest rule is **consistency with the existing codebase** where possible, but we aim to follow these guidelines:

### Style

- Prefer clear, descriptive names over short ones
- Types live in `src/types/` - check before creating new ones
- Avoid `any` when a concrete type is possible
- Prefer named, defined function return types over inline
- No magic numbers or magic strings - extract to well-named constants
- Prefer the positive case first in if/else blocks

### Comments

- Use the style of comments already present in the project generally
- Explain *why*, not just *what*, especially for non-obvious decisions, workarounds, complex logic
- Add/update JSDoc/TSDoc where applicable, primarily on public-facing interfaces in `assembly/`

### Building and Testing

Pool source is TypeScript compiled to `dist/`. You need to rebuild after changing TypeScript source files:

```bash
npm run build        # build pool source
npm test             # run local passing suite and meta-verify suite

npm run cptest       # build pool source + run local passing tests (shortcut)
npm run eptest       # run external passing tests (validate install scenario)
```

See the [Developer Guide - Testing](docs/developer-guide.md#testing) section for the full testing workflow, including meta tests, external tests, and the DX command reference.

## Understanding the Codebase

These resources will help you get oriented:

- **[Developer Guide](docs/developer-guide.md)** for setup, source code orientation, building, testing, debugging
- **[Pool Architecture](docs/pool-architecture.md)** explains how the pool integrates with vitest, test execution pipeline, thread pools, error handling, etc
- **[Coverage Architecture](docs/coverage-architecture.md)** explains WASM instrumentation, coverage collection, and the hybrid coverage provider

## Review Process

I'll do my best to review pull requests within a few days, but we know life happens. If you haven't heard back in a week, feel free to ping the PR with a comment.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE), the same license that covers this project.
