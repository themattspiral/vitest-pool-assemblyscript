import { stripVTControlCharacters } from 'node:util';
import { type ParsedStack, highlight } from '@vitest/utils';
import { RawSourceMap } from 'source-map';
import c from 'tinyrainbow';

const FRAME_POINTER = '❯' as const;
const MAX_SOURCE_HIGHLIGHT_LENGTH = 100_000 as const;
const CODE_FRAME_INDENT_SPACES = 4 as const;

export function getYellowString(str: string): string {
  return c.yellow(str);
}

export function toPlaintextStackFrameString(frame: ParsedStack): string {
  return `    at ${frame.method} ${frame.file}:${frame.line}:${frame.column}`;
}

export function toVitestLikeStackFrameString(frame: ParsedStack): string {
  return c.cyan(
    ` ${c.dim(FRAME_POINTER)} ${frame.method} ${frame.file}:${c.dim(`${frame.line}:${frame.column}`)}`
  );
}

export function getSourceCodeFrameString(sourceMap: RawSourceMap, frame: ParsedStack): string | undefined {
  if (!sourceMap.sourcesContent) {
    return undefined;
  }

  const fileIndex = sourceMap.sources.indexOf(frame.file);
  if (fileIndex < 0) {
    return undefined;
  }

  const source = sourceMap.sourcesContent[fileIndex];
  if (!source) {
    return undefined;
  }

  // same performance guard used in printError
  const highlightedSource = source.length < MAX_SOURCE_HIGHLIGHT_LENGTH ? highlight(source, { colors: c }) : source;

  return generateCodeFrame(highlightedSource, CODE_FRAME_INDENT_SPACES, frame);
}


// ============================================================================
// Source code formatting functions borrowed from Vitest
// ============================================================================

/*
 * Vitest doesn't expose generateCodeFrame as a util, so we have
 * recreated it here with minimal changes.
 * 
 * See https://github.com/vitest-dev/vitest/blob/v3.2.4/packages/vitest/src/node/printError.ts#L424
 * 
 * Vitest is released under the MIT license, included in this project's root.
 * Copyright (c) 2021-Present Vitest Team
 */

const lineSplitRE: RegExp = /\r?\n/;

function generateCodeFrame(
  source: string,
  indent = 0,
  loc: { line: number; column: number } | number,
  range = 2,
): string {
  const start
    = typeof loc === 'object'
      ? positionToOffset(source, loc.line, loc.column)
      : loc
  const end = start
  const lines = source.split(lineSplitRE)
  const nl = /\r\n/.test(source) ? 2 : 1
  let count = 0
  let res: string[] = []

  const columns = process.stdout?.columns || 80

  for (let i = 0; i < lines.length; i++) {
    count += lines[i]!.length + nl
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) {
          continue
        }

        const lineLength = lines[j]!.length

        // too long, maybe it's a minified file, skip for codeframe
        if (stripVTControlCharacters(lines[j]!).length > 200) {
          return ''
        }

        res.push(
          lineNo(j + 1)
          + truncateString(lines[j]!.replace(/\t/g, ' '), columns - 5 - indent),
        )

        if (j === i) {
          // push underline
          const pad = start - (count - lineLength) + (nl - 1)
          const length = Math.max(
            1,
            end > count ? lineLength - pad : end - start,
          )
          res.push(lineNo() + ' '.repeat(pad) + c.red('^'.repeat(length)))
        }
        else if (j > i) {
          if (end > count) {
            const length = Math.max(1, Math.min(end - count, lineLength))
            res.push(lineNo() + c.red('^'.repeat(length)))
          }
          count += lineLength + 1
        }
      }
      break
    }
  }

  if (indent) {
    res = res.map(line => ' '.repeat(indent) + line)
  }

  return res.join('\n')
}


function positionToOffset(
  source: string,
  lineNumber: number,
  columnNumber: number,
): number {
  const lines = source.split(lineSplitRE)
  const nl = /\r\n/.test(source) ? 2 : 1
  let start = 0

  if (lineNumber > lines.length) {
    return source.length
  }

  for (let i = 0; i < lineNumber - 1; i++) {
    start += lines[i]!.length + nl
  }

  return start + columnNumber
}

function lineNo(no: number | string = '') {
  return c.gray(`${String(no).padStart(3, ' ')}| `)
}

function truncateString(text: string, maxLength: number): string {
  const plainText = stripVTControlCharacters(text)

  if (plainText.length <= maxLength) {
    return text
  }

  return `${plainText.slice(0, maxLength - 1)}…`
}
