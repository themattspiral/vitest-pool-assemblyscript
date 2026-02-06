import { versions } from 'node:process';
import { access, readFile, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import c from 'tinyrainbow';

import type { NativeBuildError } from '../types/types.js';

// Marker file written by install script when native build fails
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');
const NATIVE_BUILD_ERROR_FILE = resolve(packageRoot, '.native-build-error');

/**
 * Read the native build error marker file if it exists.
 * Returns undefined if file doesn't exist or can't be parsed.
 */
async function readNativeBuildError(): Promise<NativeBuildError | undefined> {
  try {
    const content = await readFile(NATIVE_BUILD_ERROR_FILE, 'utf8');
    return JSON.parse(content) as NativeBuildError;
  } catch {
    return undefined;
  }
}

/**
 * Check if a native build error marker file exists.
 * Used by compiler threads to distinguish known build failures (marker present,
 * user already warned by coverage provider) from unexpected addon load failures.
 */
export async function hasNativeBuildError(): Promise<boolean> {
  try {
    await access(NATIVE_BUILD_ERROR_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the native build error marker file.
 * Called when the addon loads successfully at runtime, clearing any stale marker
 * left from a previous failed install (e.g. after a manual rebuild).
 */
export async function clearNativeBuildError(): Promise<void> {
  try {
    await unlink(NATIVE_BUILD_ERROR_FILE);
  } catch {
    // File doesn't exist or can't be removed — non-critical
  }
}

const NODE_VERSION = versions.node;
const NODE_MAJOR_VERSION = parseInt(NODE_VERSION.split('.')[0]!, 10);

export function isNodeVersionSupportedForCoverage(): boolean {
  return NODE_MAJOR_VERSION >= 22;
}

export function warnIfASCoverageNotSupportedByNode(): void {
  if (!isNodeVersionSupportedForCoverage()) {
    console.warn(`\n`
      + c.yellow(`Warning:`)
      + c.gray(` Coverage config is enabled, but current Node version (${versions.node})\n`
      + `         does not support required WASM multi-memory features.\n`
      + `         Coverage collection will be `) + c.yellow(`disabled`) + c.gray(` for AssemblyScript WASM.\n`
      + `         Please upgrade to Node 22 or above if you need WASM coverage support.`)
    );
  }
}

/**
 * Warn that the native instrumentation addon could not be loaded.
 * Used by compiler threads for unexpected failures (no marker file present).
 */
export function warnASInstrumentationNotLoaded(errorMessage: string): void {
  console.warn(`\n`
    + c.yellow(`Warning:`)
    + c.gray(` Coverage config is enabled, but instrumentation native addon module\n`
    + `         was not loaded. Tests will run with ` + c.yellow(`coverage disabled`) + `. Error:\n\n`
    + `${errorMessage}`)
  );
}

const ERROR_PREVIEW_MAX_LINES = 10;

/**
 * Check for a native build error marker file and warn if present.
 * Called once from the coverage provider (main process), so the warning
 * is not duplicated across compiler threads.
 */
export async function warnIfNativeBuildFailed(): Promise<void> {
  const buildError = await readNativeBuildError();
  if (!buildError) return;

  // Before warning, check if the addon actually loads (e.g. after a manual rebuild).
  // If it loads, the marker file is stale — clear it and skip the warning.
  try {
    await import('../instrumentation/addon-interface.js');
    await clearNativeBuildError();
    return;
  } catch {
    // Addon still can't load — proceed with warning
  }

  const stageName = buildError.stage === 'binaryen-download'
    ? 'Binaryen dependency download'
    : 'native addon compilation';

  // Truncate error for display, point to file for full details
  const errorLines = buildError.error.split('\n');
  const truncated = errorLines.length > ERROR_PREVIEW_MAX_LINES;
  const preview = errorLines.slice(-ERROR_PREVIEW_MAX_LINES).join('\n');

  console.warn(`\n`
    + c.yellow(`Warning:`) + c.gray(` Build failed during "${stageName}" while installing.\n`)
    + c.gray(`       vitest-pool-assemblyscript. AssemblyScript tests will run,\n`)
    + c.gray(`       but `) + c.yellow(`coverage will be disabled`) + c.gray(`. Platform: `)
    + c.yellowBright(`${buildError.platform}\n`)
    + c.gray(`       Build Error Message:\n`)
    + `\n`
    + (truncated ? c.gray(`... (truncated)\n`) : ``)+ c.redBright(`${preview}`) + `\n`
    + `\n`
    + c.gray(`       Full error details: `) + c.cyan(`${NATIVE_BUILD_ERROR_FILE}`) + `\n`
    + `\n`
    + c.gray(`       To resolve, inspect the error above, ensure a C++ compiler toolchain\n`)
    + c.gray(`       is installed (`) + c.cyan(`https://github.com/nodejs/node-gyp#installation`) + c.gray(`)\n`)
    + c.gray(`       and then reinstall: `) + c.cyan(`npm install vitest-pool-assemblyscript`)
    + `\n`
  );
}
