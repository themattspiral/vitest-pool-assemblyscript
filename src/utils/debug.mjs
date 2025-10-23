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

// Hard-coded timing flag for performance measurements
// Set to true to enable detailed timing logs for compile/discover/execute phases
const DEBUG_TIMING = true;

/**
 * Initialize debug mode for current async context (called by worker at task start)
 */
export function setDebug(enabled) {
  debugStorage.enterWith(enabled);
}

/**
 * Log debug message (only when debug enabled in current context)
 */
export function debug(...args) {
  if (debugStorage.getStore()) {
    console.log(...args);
  }
}

/**
 * Log error message (only when debug enabled in current context)
 */
export function debugError(...args) {
  if (debugStorage.getStore()) {
    console.error(...args);
  }
}

/**
 * Check if debug mode is enabled in current context
 */
export function isDebugEnabled() {
  return debugStorage.getStore() || false;
}

/**
 * Log timing information (controlled by DEBUG_TIMING constant)
 */
export function debugTiming(...args) {
  if (DEBUG_TIMING) {
    console.log(...args);
  }
}
