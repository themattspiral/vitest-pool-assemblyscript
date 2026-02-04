/**
 * Setup script for external (tarball) package testing.
 *
 * Prepares a sibling directory with an installed copy of the packed tarball,
 * so that tests run against the package exactly as a consumer would install it.
 *
 * Assumes the project has already been built (npm run build) before running.
 *
 * Steps:
 * 1. Clean any previous external test directory
 * 2. Copy test-external/ to the sibling directory
 * 3. Pack the tarball into the sibling directory
 * 4. Install the tarball in the sibling directory
 *
 * Cross-platform: uses Node.js fs APIs instead of shell commands.
 */

import { execSync } from 'child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync, existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const EXTERNAL_SOURCE_DIR = join(PROJECT_ROOT, 'test-external');
const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

/** Derive the tarball filename from package.json name and version. */
function getTarballFilename() {
  const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
  // npm pack produces: <name>-<version>.tgz (scoped packages replace / with -)
  const safeName = packageJson.name.replace('@', '').replace('/', '-');
  return `${safeName}-${packageJson.version}.tgz`;
}

// Step 1: Clean previous external test directory
console.log(`Step 1: Cleaning previous external directory...`);
if (existsSync(EXTERNAL_DIR)) {
  rmSync(EXTERNAL_DIR, { recursive: true, force: true });
  console.log(`  Removed ${EXTERNAL_DIR}`);
} else {
  console.log('  Nothing to clean');
}

// Step 2: Copy test-external/ to sibling directory
console.log('');
console.log('Step 2: Copying test-external/ to sibling directory...');
cpSync(EXTERNAL_SOURCE_DIR, EXTERNAL_DIR, { recursive: true });
console.log(`  Copied to ${EXTERNAL_DIR}`);

// Step 3: Pack the tarball into the external directory
console.log('');
console.log('Step 3: Packing tarball...');
execSync(`npm pack --pack-destination "${EXTERNAL_DIR}"`, {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
});

// Step 4: Install the tarball in the external directory
const tarballFilename = getTarballFilename();
const tarballPath = join(EXTERNAL_DIR, tarballFilename);

if (!existsSync(tarballPath)) {
  console.error(`Expected tarball not found: ${tarballPath}`);
  process.exit(1);
}

console.log('');
console.log(`Step 4: Installing tarball in external directory...`);
execSync(`npm install "${tarballFilename}"`, {
  cwd: EXTERNAL_DIR,
  stdio: 'inherit',
});

console.log('');
console.log('External test environment ready.');
console.log(`  Directory: ${EXTERNAL_DIR}`);
console.log(`  Tarball: ${tarballFilename}`);
