import { highlight, type TokenColors } from 'tinyhighlight';
import c from 'tinyrainbow';

/**
 * Adapted from vitest. The internal function was changed between vitest 3.2.x and 4.0.x,
 * and then removed from public exposure in 4.1.x, so now instead we recreate the same
 * highlighting color rules.
 * 
 * @see https://github.com/vitest-dev/vitest/blob/v4.1.0/packages/vitest/src/utils/colors.ts#L18
 * 
 * Vitest is released under the MIT license, included in this project's root.
 * Copyright (c) 2021-Present Vitest Team
 */

const colors: TokenColors = {
  Keyword: c.magenta,
  IdentifierCapitalized: c.yellow,
  Punctuator: c.yellow,
  StringLiteral: c.green,
  NoSubstitutionTemplate: c.green,
  MultiLineComment: c.gray,
  SingleLineComment: c.gray,
  RegularExpressionLiteral: c.cyan,
  NumericLiteral: c.blue,
  TemplateHead: text =>
    c.green(text.slice(0, text.length - 2)) + c.cyan(text.slice(-2)),
  TemplateTail: text => c.cyan(text.slice(0, 1)) + c.green(text.slice(1)),
  TemplateMiddle: text =>
    c.cyan(text.slice(0, 1))
    + c.green(text.slice(1, text.length - 2))
    + c.cyan(text.slice(-2)),
  IdentifierCallable: c.blue,
  PrivateIdentifierCallable: text => `#${c.blue(text.slice(1))}`,
  Invalid: (text: string) => c.white(c.bgRed(c.bold(text)))
};

export function highlightCode(source: string): string {
  return highlight(source, { colors });
}
