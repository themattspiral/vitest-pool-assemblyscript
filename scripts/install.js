/**
 * Custom install script for vitest-pool-assemblyscript native addon.
 *
 * Flow:
 * 1. Try to load a prebuilt or locally-built native addon via node-gyp-build
 * 2. If found → clean up non-matching prebuilds to save disk space, then exit
 * 3. If not found → attempt to download Binaryen dependencies and compile from source
 * 4. If compilation fails → warn and exit successfully (coverage will be unavailable)
 *
 * Installation always succeeds. Users on unsupported platforms without a C++ toolchain
 * can still run tests - they just won't have coverage instrumentation.
 */

import { execSync } from 'child_process';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, rmSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');

const require = createRequire(import.meta.url);

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
  // Addon loaded successfully — clean up unused prebuilds and exit
  cleanUnusedPrebuilds();
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
    stdio: 'inherit',
  });
} catch (err) {
  console.error('');
  console.error('⚠️  Failed to download Binaryen dependencies.');
  console.error('    Native addon will not be available.');
  console.error('    Tests will run, but coverage features will be disabled.');
  console.error('');
  console.error('    Error: ' + (err instanceof Error ? err.message : String(err)));
  console.error('');
  process.exit(0);
}

// Step 3: Compile native addon from source
try {
  console.log('');
  console.log('Compiling native addon...');
  execSync('npx node-gyp rebuild', {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  console.log('');
  console.log('Native addon compiled successfully.');
} catch (err) {
  console.error('');
  console.error('⚠️  Failed to compile native addon from source.');
  console.error('    Native addon will not be available.');
  console.error('    Tests will run, but coverage features will be disabled.');
  console.error('');
  console.error('    To enable coverage, install a C++ compiler toolchain and reinstall:');
  console.error('    https://github.com/nodejs/node-gyp#installation');
  console.error('');
  console.error('    Error: ' + (err instanceof Error ? err.message : String(err)));
  console.error('');
  process.exit(0);
}
