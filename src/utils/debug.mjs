/**
 * Debug logging utility
 *
 * Controlled by pool configuration:
 *   poolOptions: { assemblyScript: { debug: true } }
 *
 * Must be initialized via setDebug() before use.
 */

let DEBUG = false;

/**
 * Initialize debug mode (called by pool during setup)
 */
export function setDebug(enabled) {
  DEBUG = enabled;
}

/**
 * Log debug message (only when DEBUG is enabled)
 */
export function debug(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

/**
 * Log error message (only when DEBUG is enabled)
 */
export function debugError(...args) {
  if (DEBUG) {
    console.error(...args);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled() {
  return DEBUG;
}
