/**
 * Custom install script for vitest-pool-assemblyscript native addon.
 *
 * Flow:
 * 1. Try to load a prebuilt or locally-built native addon via node-gyp-build
 * 2. If found → clean up non-matching prebuilds to save disk space, then exit
 * 3. If not found → attempt to download Binaryen dependencies and compile from source
 * 4. If compilation fails → write error to marker file and exit successfully
 *
 * Installation always succeeds. Users on unsupported platforms without a C++ toolchain
 * can still run tests - they just won't have coverage instrumentation. The pool checks
 * for the marker file at runtime and displays a warning with the build error details.
 */

import { execSync } from 'child_process';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');

const require = createRequire(import.meta.url);

// Marker file written when native build fails - checked at runtime to warn users
const NATIVE_BUILD_ERROR_FILE = join(packageRoot, '.native-build-error');

/**
 * Write a marker file indicating native build failure.
 * The pool reads this at runtime to display a warning to users.
 */
function writeNativeBuildError(stage, errorMessage) {
  const content = JSON.stringify({
    stage,
    error: errorMessage,
    platform: `${process.platform}-${process.arch}`,
    timestamp: new Date().toISOString(),
  }, null, 2);

  try {
    writeFileSync(NATIVE_BUILD_ERROR_FILE, content, 'utf8');
  } catch {
    // Non-critical - worst case user just doesn't see the detailed error
  }
}

/**
 * Remove the marker file if it exists (on successful build).
 */
function clearNativeBuildError() {
  try {
    if (existsSync(NATIVE_BUILD_ERROR_FILE)) {
      rmSync(NATIVE_BUILD_ERROR_FILE);
    }
  } catch {
    // Non-critical
  }
}

/**
 * Remove prebuild directories that don't match the current platform.
 * Prebuilds ship for all 6 platforms (~21 MB each uncompressed), but only
 * the current platform's prebuild is needed at runtime.
 */
function cleanUnusedPrebuilds() {
  const prebuildsDir = join(packageRoot, 'prebuilds');
  if (!existsSync(prebuildsDir)) return;

  const currentPlatformDir = `${process.platform}-${process.arch}`;

  try {
    const entries = readdirSync(prebuildsDir);
    for (const entry of entries) {
      if (entry !== currentPlatformDir) {
        rmSync(join(prebuildsDir, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Non-critical — don't fail install over cleanup
  }
}

// Step 1: Check if a prebuild or local build already exists
try {
  const nodeGypBuild = require('node-gyp-build');
  nodeGypBuild(packageRoot);
  // Addon loaded successfully — clean up unused prebuilds and marker file, then exit
  cleanUnusedPrebuilds();
  clearNativeBuildError();
  process.exit(0);
} catch {
  // No prebuild or local build found — fall through to source build
}

// Step 2: Download Binaryen headers and static library
console.log('No prebuilt native addon found for this platform. Building from source...');
console.log('');

try {
  console.log('Downloading Binaryen dependencies...');
  execSync('node scripts/setup-binaryen.js', {
    cwd: packageRoot,
    stdio: 'pipe',
  });
} catch (err) {
  const errorOutput = err?.stderr?.toString() || err?.stdout?.toString() || (err instanceof Error ? err.message : String(err));
  writeNativeBuildError('binaryen-download', errorOutput);
  process.exit(0);
}

// Step 3: Compile native addon from source
try {
  console.log('');
  console.log('Compiling native addon...');
  execSync('npx node-gyp rebuild', {
    cwd: packageRoot,
    stdio: 'pipe',
  });
  console.log('');
  console.log('Native addon compiled successfully.');
  clearNativeBuildError();
} catch (err) {
  const errorOutput = err?.stderr?.toString() || err?.stdout?.toString() || (err instanceof Error ? err.message : String(err));
  writeNativeBuildError('native-compile', errorOutput);
  process.exit(0);
}
