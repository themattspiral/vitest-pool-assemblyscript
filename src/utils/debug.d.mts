/**
 * Type definitions for debug.mjs
 */

/**
 * Initialize debug mode (called by pool during setup)
 */
export function setDebug(enabled: boolean): void;

/**
 * Log debug message (only when DEBUG is enabled)
 */
export function debug(...args: any[]): void;

/**
 * Log error message (only when DEBUG is enabled)
 */
export function debugError(...args: any[]): void;

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean;
