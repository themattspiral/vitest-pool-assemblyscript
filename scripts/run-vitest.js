/**
 * General-purpose vitest runner with two modes:
 *
 * **Interactive mode** (CLI entry point): Runs vitest with stdio inherited,
 * so output streams directly to the terminal. Used by npm scripts like
 * `test:ext:pass`, `test:ext:meta`, etc. Defaults to running in the external
 * test directory prepared by setup-test-external.js.
 *
 * **Capture mode** (programmatic import): Runs vitest and captures both
 * structured JSON reporter output and CLI (default reporter) output. Returns
 * them alongside the exit code for meta-test assertions. JSON output is
 * written to a temp file via `--outputFile.json`, read back, and cleaned up.
 *
 * @example
 * // Programmatic usage from a meta-test
 * import { runVitest } from '../scripts/run-vitest.js';
 *
 * const result = runVitest({
 *   cwd: '/path/to/project',
 *   args: ['-c', 'vitest.meta.config.ts'],
 *   capture: true,
 * });
 * // result: { jsonOutput, cliOutput, exitCode }
 */

import { execSync, spawnSync } from 'child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const EXTERNAL_DIR_NAME = 'vitest-pool-assemblyscript-test-external';
const EXTERNAL_DIR = resolve(PROJECT_ROOT, '..', EXTERNAL_DIR_NAME);

/**
 * Run vitest and optionally capture structured output for meta-test assertions.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory to run vitest from.
 * @param {string[]} [options.args=[]] - Additional arguments passed to `vitest run`.
 * @param {boolean} [options.capture=false] - When true, captures JSON + CLI output
 *   instead of inheriting stdio. JSON reporter output is written to a temp file,
 *   read back, and cleaned up automatically.
 * @returns {{ jsonOutput: object | null, cliOutput: string, exitCode: number }}
 *   In interactive mode (capture=false), returns `{ jsonOutput: null, cliOutput: '', exitCode }`.
 *   In capture mode (capture=true), returns parsed JSON reporter output alongside
 *   the CLI (default reporter) string output and the process exit code.
 */
export function runVitest({ cwd, args = [], capture = false }) {
  if (!existsSync(cwd)) {
    throw new Error(`Working directory not found: ${cwd}`);
  }

  if (!capture) {
    return runInteractive({ cwd, args });
  }

  return runCapture({ cwd, args });
}

/**
 * Interactive mode: stdio inherited, output streams directly to terminal.
 * Forwards exit code on failure. Used by npm scripts.
 */
function runInteractive({ cwd, args }) {
  const vitestCommand = ['npx vitest run', ...args].join(' ');

  console.log(`Running vitest from: ${cwd}`);
  console.log(`> ${vitestCommand}`);
  console.log('');

  try {
    execSync(vitestCommand, { cwd, stdio: 'inherit' });
    return { jsonOutput: null, cliOutput: '', exitCode: 0 };
  } catch (error) {
    const exitCode = error.status ?? 1;
    return { jsonOutput: null, cliOutput: '', exitCode };
  }
}

/**
 * Capture mode: runs vitest with both JSON and default reporters.
 * JSON output goes to a temp file (via --outputFile.json), CLI output
 * is captured from stdout/stderr. The temp file is read, parsed, and
 * deleted before returning.
 */
function runCapture({ cwd, args }) {
  const jsonOutputPath = join(cwd, '.vitest-meta-json-output.json');

  // Clean up any leftover output file from a previous run
  if (existsSync(jsonOutputPath)) {
    unlinkSync(jsonOutputPath);
  }

  const captureArgs = [
    'vitest', 'run',
    '--reporter=json',
    '--reporter=default',
    `--outputFile.json=${jsonOutputPath}`,
    ...args,
  ];

  const result = spawnSync('npx', captureArgs, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });

  const cliOutput = (result.stdout ?? '') + (result.stderr ?? '');
  const exitCode = result.status ?? 1;

  // Read and clean up the JSON output file
  let jsonOutput = null;
  if (existsSync(jsonOutputPath)) {
    try {
      const jsonContent = readFileSync(jsonOutputPath, 'utf-8');
      jsonOutput = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error(`Warning: Failed to parse JSON output file: ${parseError.message}`);
    } finally {
      unlinkSync(jsonOutputPath);
    }
  }

  return { jsonOutput, cliOutput, exitCode };
}

// CLI entry point: run in interactive mode from the external test directory
const isCliEntryPoint = resolve(process.argv[1]) === __filename;

if (isCliEntryPoint) {
  if (!existsSync(EXTERNAL_DIR)) {
    console.error(`External test directory not found: ${EXTERNAL_DIR}`);
    console.error('Run "npm run test:ext:setup" first to prepare the environment.');
    process.exit(1);
  }

  const passedArgs = process.argv.slice(2);
  const { exitCode } = runVitest({ cwd: EXTERNAL_DIR, args: passedArgs });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
