/**
 * Run script for external (tarball) package testing.
 *
 * Runs vitest from the external sibling directory that was prepared by
 * setup-test-external.js. This verifies the pool works correctly when
 * installed as a package from a tarball.
 *
 * Future: This script will evolve into an output relay that captures both
 * structured (--reporter=json) and visual (--reporter=default) output from
 * the external vitest run and provides them to meta-tests for assertion.
 * See .claude/workspace/plans/built-package-testing-plan.md Phase 2.
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

const noCoverage = process.argv.includes('--no-coverage');

if (!existsSync(EXTERNAL_DIR)) {
  console.error(`External test directory not found: ${EXTERNAL_DIR}`);
  console.error('Run "npm run etest:setup" first to prepare the environment.');
  process.exit(1);
}

const vitestArgs = ['npx vitest run'];
if (noCoverage) {
  vitestArgs.push('--coverage.enabled=false');
}
const vitestCommand = vitestArgs.join(' ');

console.log(`Running external tests from: ${EXTERNAL_DIR}`);
if (noCoverage) {
  console.log('  Coverage disabled via --no-coverage flag');
}
console.log('');

try {
  execSync(vitestCommand, {
    cwd: EXTERNAL_DIR,
    stdio: 'inherit',
  });
} catch (error) {
  // execSync throws on non-zero exit codes. The test output has already been
  // printed to the console via stdio: 'inherit', so just forward the exit code.
  const exitCode = error.status ?? 1;
  process.exit(exitCode);
}
