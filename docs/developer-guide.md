
## Developer Installation Guide

**Feedback Welcome:** If you try this out, please open an issue on GitHub with your experience, bugs, or suggestions!

### Prerequisites
- Node.js 20.0.0+ (required due to our multi-memory coverage approach)
- Vitest 3.2.4+ or 4.0.0+
- AssemblyScript 0.28+
- C++ build tools (dev only - distributed package includes prebuilds):
  - GCC 7+ or Clang 5+ (C++17 support required)
  - Python 3.x (required by node-gyp)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/themattspiral/vitest-pool-assemblyscript.git
cd vitest-pool-assemblyscript
```

2. **Install Binaryen C++ dependencies and npm dependencies**
```bash
npm run setup-binaryen
npm install
```
For normal end users, `npm install` runs `setup-binaryen`, which detects your platform-specific native prebuild and skips native C++ compilation if found. If no prebuild is found, the script downloads prebuilt Binaryen libraries and C++ headers to `third_party/binaryen/`. These are used to build our native addon (for extracting debug info from WASM binaries). 

3. **Build Native Addon**
Not strictly necessary to get going (because you probably have a prebuild already), but this is how the native code is built and it's important to be able to build it as a contributing developer.

```bash
npm run build:native
```

4. **Build Pool**
```bash
npm run build
```

5. **Link the pool to your project:**
Assuming you are using the pool to test a separate project, you should `npm link` it for local testing.

```bash
# In vitest-pool-assemblyscript:
npm link

# In your project directory:
npm link vitest-pool-assemblyscript
```

6. **Configure Vitest** 

See the [Configuration Guide](../README.md#configuration-guide) section of the Readme.

7. **Write your tests**

See the [Writing Tests Guide](../README.md#writing-tests-guide) section of the Readme.

8. **Run your tests:**
```bash
# Run all tests once
npx vitest run

# Run specific test file
npx vitest run example.as.test.ts
# or
npx vitest run example

# Run specific test in specific file
npx vitest run example.as.test.ts -t "my test name"
```
