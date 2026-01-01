import type { AssemblyScriptConsoleLogHandler } from '../types/types.js';
import { liftString } from '../util/assemblyscript/binding-helpers.js';

export function createWasmConsole(
  memory: WebAssembly.Memory,
  handleLog: AssemblyScriptConsoleLogHandler
) {
  const getMessage = (msgPtr: number, memory: WebAssembly.Memory, prefix: string = ''): string => {
    return `${prefix}${msgPtr ? liftString(memory, msgPtr) : '<no message>'}`;
  };

  const timersByLabel: { [label: string]: number } = {};

  // provides the AssemblyScript "brower-like console" from AS std lib
  // see https://github.com/AssemblyScript/assemblyscript/blob/v0.28.9/std/assembly/index.d.ts#L2609
  return {
    'console.assert': <T>(assertion: T, msgPtr: number): void => {
      if (!assertion) {
        const msg = getMessage(msgPtr, memory);
        handleLog(`Assertion failed${msg ? `: ${msg}` : ''}`);
      }
    },
    'console.log': (msgPtr: number): void => {
      handleLog(getMessage(msgPtr, memory));
    },
    'console.debug': (msgPtr: number): void => {
      handleLog(getMessage(msgPtr, memory, 'Debug: '));
    },
    'console.info': (msgPtr: number): void => {
      handleLog(getMessage(msgPtr, memory, 'Info: '));
    },
    'console.warn': (msgPtr: number): void => {
      handleLog(getMessage(msgPtr, memory, 'Warning: '), true);
    },
    'console.error': (msgPtr: number): void => {
      handleLog(getMessage(msgPtr, memory, 'Error: '), true);
    },
    'console.time': (labelPtr?: number): void => {
      const label = labelPtr ? liftString(memory, labelPtr) ?? 'default' : 'default';
      timersByLabel[label] = performance.now();
    },
    'console.timeLog': (labelPtr?: number): void => {
      const label = labelPtr ? liftString(memory, labelPtr) ?? 'default' : 'default';
      const start = timersByLabel[label];
      let msg = '';
      if (start === undefined) {
        msg = `Warning: No such label '${label}' for console.timeLog()`;
      } else {
        msg = `${label}: ${(performance.now() - start).toFixed(3)}ms`;
      }
      handleLog(msg);
    },
    'console.timeEnd': (labelPtr?: number): void => {
      const label = labelPtr ? liftString(memory, labelPtr) ?? 'default' : 'default';
      const start = timersByLabel[label];
      let msg = '';
      if (start === undefined) {
        msg = `Warning: No such label '${label}' for console.timeLog()`;
      } else {
        msg = `${label}: ${(performance.now() - start).toFixed(3)}ms`;
      }
      handleLog(msg);
      delete timersByLabel[label];
    },
  };
}
