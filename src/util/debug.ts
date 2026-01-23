/**
 * Debug logging utility
 */

declare global {
  var AS_POOL_DEBUG: boolean | undefined;
}

globalThis.AS_POOL_DEBUG = false;

const DEBUG_ENV_ENABLED_VALUE = '1' as const;

function isEnabled(): boolean {
  return globalThis.AS_POOL_DEBUG === true || process.env.DEBUG === DEBUG_ENV_ENABLED_VALUE;
}

/**
 * Initialize debug mode for current async context (called by worker at task start)
 * @param {boolean} debugEnabled - Enable verbose debug logging
 */
export function setGlobalDebugMode(debugEnabled: boolean): void {
  globalThis.AS_POOL_DEBUG = debugEnabled;
}

/**
 * Log debug message (only when debug enabled in current global context)
 * or when environment has a truthy DEBUG variable set.
 */
export function debug(...args: any): void {
  if (isEnabled()) {
    // if first arg is a function, execute it and then print the result
    if (args?.length > 0 && typeof args[0] === 'function') {
      const result = args[0]();
      const rest = args.length > 1 ? args.slice(1) : [];
      console.log(Date.now(), String(result), ...rest);
    } else {
      console.log(Date.now(), ...args);
    }
  }
}

/**
 * Determine if debug mode is enabled for the current global context
 */
export function isDebugModeEnabled(): boolean {
  return isEnabled();
}

export async function delay(ms: number = 5000): Promise<void> {
  return new Promise<void>((resolve, _reject) => {
    setTimeout(resolve, ms);
  });
}
