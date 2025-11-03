/**
 * Type declarations for debug.mjs
 */

export function setDebugModes(debugEnabled?: boolean, timingEnabled?: boolean): void;
export function debug(...args: any[]): void;
export function debugError(...args: any[]): void;
export function debugTiming(...args: any[]): void;
