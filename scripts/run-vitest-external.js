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
 * import { runVitest } from '../scripts/run-vitest-external.js';
 *
 * const result = await runVitest({
 *   cwd: '/path/to/project',
 *   args: ['-c', 'vitest.meta.config.ts'],
 *   capture: true,
 * });
 * // result: { jsonOutput, cliOutput, exitCode }
 */

import { spawn } from 'child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';

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
 * @returns {Promise<{ jsonOutput: object | null, cliOutput: string, exitCode: number }>}
 *   In interactive mode (capture=false), resolves to `{ jsonOutput: null, cliOutput: '', exitCode }`.
 *   In capture mode (capture=true), resolves to parsed JSON reporter output alongside
 *   the CLI (default reporter) string output and the process exit code.
 */
export async function runVitest({ cwd, args = [], capture = false }) {
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
 * Returns exit code on completion. Used by npm scripts.
 */
function runInteractive({ cwd, args }) {
  const vitestArgs = ['vitest', 'run', ...args];
  const vitestCommand = ['npx', ...vitestArgs].join(' ');

  console.log(`Running vitest from: ${cwd}`);
  console.log(`> ${vitestCommand}`);
  console.log('');

  return new Promise((resolve) => {
    // shell: true is required on Windows where npx is a .cmd batch wrapper
    const child = spawn('npx', vitestArgs, {
      cwd,
      shell: true,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      resolve({ jsonOutput: null, cliOutput: '', exitCode: code ?? 1 });
    });
  });
}

/**
 * Capture mode: runs vitest with both JSON and default reporters.
 * JSON output goes to a temp file (via --outputFile.json), CLI output
 * is captured from stdout/stderr. The temp file is read, parsed, and
 * deleted before resolving.
 */
async function runCapture({ cwd, args }) {
  const jsonOutputPath = join(cwd, '.vitest-meta-json-output.json');

  // Clean up any leftover output file from a previous run
  await unlink(jsonOutputPath).catch(() => {});

  const captureArgs = [ 'vitest', 'run', ...args ];

  const { cliOutput, exitCode } = await new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];

    // shell: true is required on Windows where npx is a .cmd batch wrapper
    // that spawn can't resolve without the system shell
    const child = spawn('npx', captureArgs, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      resolve({ cliOutput: stdout + stderr, exitCode: code ?? 1 });
    });
  });

  // Read and clean up the JSON output file
  let jsonOutput = null;
  try {
    const jsonContent = await readFile(jsonOutputPath, 'utf-8');
    jsonOutput = JSON.parse(jsonContent);
  } catch (error) {
    // File may not exist if vitest crashed before writing it,
    // or content may not be valid JSON
    if (error.code !== 'ENOENT') {
      console.error(`Warning: Failed to parse JSON output file: ${error.message}`);
    }
  } finally {
    await unlink(jsonOutputPath).catch(() => {});
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
  const { exitCode } = await runVitest({ cwd: EXTERNAL_DIR, args: passedArgs });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
