/**
 * Extracts the short name from a WASM function table name identifier.
 */
export function getShortFunctionName(fullName: string): string {
  if (!fullName) {
    return '';
  }

  // URL decode first (handle potential decoding errors)
  let decoded: string;
  try {
    decoded = decodeURIComponent(fullName);
  } catch {
    decoded = fullName;
  }

  // Find the last '/' that's not inside angle brackets or parens
  let angleBracketDepth = 0;
  let parenDepth = 0;
  let lastSlashOutsideBrackets = -1;

  for (let i = 0; i < decoded.length; i++) {
    const char = decoded[i];
    if (char === '<') {
      angleBracketDepth++;
    } else if (char === '>' && decoded[i - 1] !== '=') {
      angleBracketDepth--;
    } else if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === '/' && angleBracketDepth === 0 && parenDepth === 0) {
      lastSlashOutsideBrackets = i;
    }
  }

  const functionPart = lastSlashOutsideBrackets >= 0
    ? decoded.substring(lastSlashOutsideBrackets + 1)
    : decoded;

  // Handle anonymous function case: "file.as.test~anonymous|1" → "anonymous|1"
  const anonymousMatch = functionPart.match(/^.+~(anonymous\|\d+)$/);
  if (anonymousMatch) {
    return anonymousMatch[1]!;
  }

  // Process any generics/paths in the function signature
  return shortenTypePart(functionPart);
}

/**
 * Finds the index of the closing '>' that matches the opening '<' at openIndex.
 */
function findMatchingCloseBracket(str: string, openIndex: number): number {
  let angleBracketDepth = 1;

  for (let i = openIndex + 1; i < str.length; i++) {
    const char = str[i];
    if (char === '<') {
      angleBracketDepth++;
    } else if (char === '>' && str[i - 1] !== '=') {
      angleBracketDepth--;
      if (angleBracketDepth === 0) return i;
    }
  }
  return str.length - 1;
}

/**
 * Finds the index of the closing ')' that matches the opening '(' at openIndex.
 */
function findMatchingCloseParen(str: string, openIndex: number): number {
  let parenDepth = 1;
  let angleBracketDepth = 0;

  for (let i = openIndex + 1; i < str.length; i++) {
    const char = str[i];
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth === 0) return i;
    } else if (char === '<') {
      angleBracketDepth++;
    } else if (char === '>' && str[i - 1] !== '=') {
      angleBracketDepth--;
    }
  }
  return str.length - 1;
}

/**
 * Splits a string by commas at the top level (not inside <> or ()).
 */
function splitByTopLevelComma(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let angleBracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '<') {
      angleBracketDepth++;
    } else if (char === '>' && str[i - 1] !== '=') {
      angleBracketDepth--;
    } else if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === ',' && angleBracketDepth === 0 && parenDepth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * Processes the content inside generic brackets or function args.
 */
function shortenGenericContent(content: string): string {
  const parts = splitByTopLevelComma(content);
  return parts.map(part => shortenTypePart(part.trim())).join(',');
}

/**
 * Shortens a function type like (args)=>returnType.
 */
function shortenFunctionType(part: string): string {
  const closeParenIndex = findMatchingCloseParen(part, 0);
  const argsContent = part.substring(1, closeParenIndex);
  const afterParen = part.substring(closeParenIndex + 1);

  const shortenedArgs = argsContent ? shortenGenericContent(argsContent) : '';

  let returnPart = afterParen;
  if (afterParen.startsWith('=>') && afterParen.length > 2) {
    const returnType = afterParen.substring(2);
    returnPart = '=>' + shortenTypePart(returnType);
  }

  return '(' + shortenedArgs + ')' + returnPart;
}

/**
 * Shortens a type/function part, processing paths and generics recursively.
 */
function shortenTypePart(part: string): string {
  // Function types
  if (part.startsWith('(')) {
    return shortenFunctionType(part);
  }

  const openBracket = part.indexOf('<');

  if (openBracket === -1) {
    // No generics - extract last path segment if present
    if (!part.includes('/')) {
      return part;
    }
    return part.substring(part.lastIndexOf('/') + 1);
  }

  // Has generics - extract name and process content
  const namePart = part.substring(0, openBracket);
  const closeBracket = findMatchingCloseBracket(part, openBracket);
  const genericContent = part.substring(openBracket + 1, closeBracket);

  const name = namePart.includes('/')
    ? namePart.substring(namePart.lastIndexOf('/') + 1)
    : namePart;

  const shortenedContent = shortenGenericContent(genericContent);

  return name + '<' + shortenedContent + '>';
}
