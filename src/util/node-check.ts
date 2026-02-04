import { versions } from 'node:process';
import c from 'tinyrainbow';

const NODE_VERSION = versions.node;
const NODE_MAJOR_VERSION = parseInt(NODE_VERSION.split('.')[0]!, 10);

export function isCoverageSupported(): boolean {
  return NODE_MAJOR_VERSION >= 22;
}

export function warnIfASCoverageNotSupported(): void {
  if (!isCoverageSupported()) {
    console.warn(`\n`
      + c.yellow(`Warning:`)
      + c.gray(` Coverage is enabled, but current Node version (${versions.node})\n`
      + `         does not support required WASM multi-memory features.\n`
      + `         Coverage collection will be `) + c.yellow(`disabled`) + c.gray(` for AssemblyScript WASM.\n`
      + `         Please upgrade to Node 22 or above if you need WASM coverage support.`)
    );
  }
}
