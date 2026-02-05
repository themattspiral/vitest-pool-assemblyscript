/**
 * Path Utilities
 *
 * Cross-platform path normalization for consistent path comparisons.
 * All internal paths use forward slashes.
 */

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
