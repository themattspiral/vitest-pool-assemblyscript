/**
 * Debug logging utility
 *
 * Controlled by pool configuration:
 *   poolOptions: { assemblyScript: { debug: true } }
 *
 * Thread-safe: Uses AsyncLocalStorage to isolate debug state per worker task
 * when isolateWorkers: false (concurrent tasks in same worker).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// Store debug flag per async context (isolates concurrent tasks in same worker)
const debugStorage = new AsyncLocalStorage();

/**
 * Initialize debug mode for current async context (called by worker at task start)
 * @param {boolean} debugEnabled - Enable verbose debug logging
 */
export function setDebugMode(debugEnabled) {
  debugStorage.enterWith({ debug: debugEnabled });
}

/**
 * Log debug message (only when debug enabled in current context)
 * or when environment has a truthy DEBUG variable set.
 */
export function debug(...args) {
  const state = debugStorage.getStore();
  if (state?.debug || process.env.DEBUG) {
    console.log(...args);
  }
}

/**
 * Determine if debug mode is enabled for the current async context
 */
export function isDebugModeEnabled() {
  const state = debugStorage.getStore();
  return !!state?.debug;
}

/**
 * Log error message (only when debug enabled in current context)
 */
export function debugError(...args) {
  const state = debugStorage.getStore();
  if (state?.debug) {
    console.error(...args);
  }
}
