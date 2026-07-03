/**
 * Path Utilities
 *
 * Cross-platform path normalization for consistent path comparisons.
 * All internal paths use forward slashes.
 */

import { sep } from 'node:path';

/**
 * Convert path to forward slashes for consistent cross-platform comparison.
 *
 * Source maps always use forward slashes regardless of OS. By normalizing
 * all paths to forward slashes, we ensure consistent matching between:
 * - Source map paths (already forward slashes)
 * - Glob results (OS-native, need conversion on Windows)
 * - Relative paths from Node's path.relative() (OS-native)
 * - Resolved paths from Node's path.resolve() (OS-native)
 */
export function toForwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Convert an explicitly forward-slash-normalized path back to the OS-native separator.
 * Intendend for use with user-facing output so our AssemblyScript pool coverage entries
 * match the platform-native paths the delegated v8 provider emits for JavaScript pools.
 *
 * The input is expected to already be forward-slash normalized (our internal canonical form),
 * so only the output boundary switches to native.
 * 
 * On POSIX systems this will be a no-op (sep is already '/'). 
 */
export function toPlatformPath(path: string): string {
  return path.replace(/\//g, sep);
}
