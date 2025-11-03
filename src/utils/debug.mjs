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

// Store debug and timing flags per async context (isolates concurrent tasks in same worker)
const debugStorage = new AsyncLocalStorage();

/**
 * Initialize debug mode for current async context (called by worker at task start)
 * @param {boolean} debugEnabled - Enable verbose debug logging
 * @param {boolean} debugTimingEnabled - Enable detailed timing logs
 */
export function setDebugModes(debugEnabled = false, timingEnabled = false) {
  debugStorage.enterWith({ debug: debugEnabled, timing: timingEnabled });
}

/**
 * Log debug message (only when debug enabled in current context)
 */
export function debug(...args) {
  const state = debugStorage.getStore();
  if (state?.debug) {
    console.log(...args);
  }
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

/**
 * Log timing information (only when debugTiming enabled in current context)
 */
export function debugTiming(...args) {
  const state = debugStorage.getStore();
  if (state?.timing) {
    console.log(...args);
  }
}
