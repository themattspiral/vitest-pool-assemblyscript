/**
 * Type declarations for debug.mjs
 */

export function setDebug(enabled: boolean): void;
export function debug(...args: any[]): void;
export function debugError(...args: any[]): void;
export function isDebugEnabled(): boolean;
export function debugTiming(...args: any[]): void;
