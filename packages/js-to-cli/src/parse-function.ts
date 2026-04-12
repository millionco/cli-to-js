import { splitTopLevel } from "./utils/split-top-level.js";
import { stripComments } from "./utils/strip-comments.js";

export interface ParsedOptionField {
  name: string;
  hasDefault: boolean;
  defaultLiteral: string | null;
}

export interface ParsedParameter {
  name: string;
  kind: "primitive" | "options" | "rest";
  hasDefault: boolean;
  defaultLiteral: string | null;
  optionFields: ParsedOptionField[] | null;
}

export interface ParsedFunctionSignature {
  name: string;
  isAsync: boolean;
  parameters: ParsedParameter[];
}

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

const findMatchingClose = (source: string, openIndex: number): number => {
  const openChar = source[openIndex];
  const closeChar = openChar === "(" ? ")" : openChar === "{" ? "}" : "]";
  let depth = 0;
  let stringQuote: string | null = null;
  for (let index = openIndex; index < source.length; index++) {
    const character = source[index];
    if (stringQuote !== null) {
      if (character === "\\") {
        index++;
        continue;
      }
      if (character === stringQuote) stringQuote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      stringQuote = character;
      continue;
    }
    if (character === openChar) {
      depth++;
    } else if (character === closeChar) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const findTopLevelDefaultEquals = (source: string): number => {
  let depth = 0;
  let stringQuote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (stringQuote !== null) {
      if (character === "\\") {
        index++;
        continue;
      }
      if (character === stringQuote) stringQuote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      stringQuote = character;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") {
      depth++;
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      depth--;
      continue;
    }
    if (depth === 0 && character === "=") {
      const nextCharacter = source[index + 1];
      const previousCharacter = source[index - 1];
      if (nextCharacter === "=" || nextCharacter === ">") continue;
      if (
        previousCharacter === "=" ||
        previousCharacter === "<" ||
        previousCharacter === ">" ||
        previousCharacter === "!"
      ) {
        continue;
      }
      return index;
    }
  }
  return -1;
};

const splitNameAndDefault = (
  source: string,
): { beforeEquals: string; defaultLiteral: string | null } => {
  const equalsIndex = findTopLevelDefaultEquals(source);
  if (equalsIndex === -1) {
    return { beforeEquals: source.trim(), defaultLiteral: null };
  }
  return {
    beforeEquals: source.slice(0, equalsIndex).trim(),
    defaultLiteral: source.slice(equalsIndex + 1).trim(),
  };
};

const parseOptionFields = (innerSource: string): ParsedOptionField[] => {
  const fields: ParsedOptionField[] = [];
  for (const rawSlice of splitTopLevel(innerSource, ",")) {
    const slice = rawSlice.trim();
    if (slice === "") continue;

    const { beforeEquals, defaultLiteral } = splitNameAndDefault(slice);

    let propertyName = beforeEquals;
    const colonIndex = beforeEquals.indexOf(":");
    if (colonIndex !== -1) {
      propertyName = beforeEquals.slice(0, colonIndex).trim();
    }

    if (!IDENTIFIER_PATTERN.test(propertyName)) {
      throw new Error(`unsupported destructured option field: "${slice}"`);
    }

    fields.push({
      name: propertyName,
      hasDefault: defaultLiteral !== null,
      defaultLiteral,
    });
  }
  return fields;
};

const parseParameter = (rawSlice: string, exportedName: string): ParsedParameter => {
  const slice = rawSlice.trim();

  if (slice.startsWith("...")) {
    const restName = slice.slice(3).trim();
    if (!IDENTIFIER_PATTERN.test(restName)) {
      throw new Error(`unsupported rest parameter "${slice}" in "${exportedName}"`);
    }
    return {
      name: restName,
      kind: "rest",
      hasDefault: false,
      defaultLiteral: null,
      optionFields: null,
    };
  }

  if (slice.startsWith("{")) {
    const closingBraceIndex = findMatchingClose(slice, 0);
    if (closingBraceIndex === -1) {
      throw new Error(`could not parse destructured options parameter in "${exportedName}"`);
    }
    const innerSource = slice.slice(1, closingBraceIndex);
    const afterBrace = slice.slice(closingBraceIndex + 1).trim();
    const hasDefault = afterBrace.startsWith("=");
    return {
      name: "options",
      kind: "options",
      hasDefault,
      defaultLiteral: hasDefault ? afterBrace.slice(1).trim() : null,
      optionFields: parseOptionFields(innerSource),
    };
  }

  if (slice.startsWith("[")) {
    throw new Error(
      `unsupported parameter pattern "${slice}" in "${exportedName}" (array destructuring not supported)`,
    );
  }

  const { beforeEquals, defaultLiteral } = splitNameAndDefault(slice);

  if (!IDENTIFIER_PATTERN.test(beforeEquals)) {
    throw new Error(`unsupported parameter pattern "${slice}" in "${exportedName}"`);
  }

  return {
    name: beforeEquals,
    kind: "primitive",
    hasDefault: defaultLiteral !== null,
    defaultLiteral,
    optionFields: null,
  };
};

const extractParameterListSource = (source: string): string => {
  let cursor = 0;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor++;

  if (source.startsWith("function", cursor)) {
    cursor += "function".length;
    while (cursor < source.length && source[cursor] !== "(") cursor++;
  }

  while (cursor < source.length && /\s/.test(source[cursor])) cursor++;

  if (source[cursor] !== "(") {
    const arrowIndex = source.indexOf("=>", cursor);
    if (arrowIndex === -1) {
      throw new Error(`could not parse function source: ${source}`);
    }
    return source.slice(cursor, arrowIndex).trim();
  }

  const closingIndex = findMatchingClose(source, cursor);
  if (closingIndex === -1) {
    throw new Error(`could not find matching paren in function source: ${source}`);
  }
  return source.slice(cursor + 1, closingIndex);
};

export const parseFunctionSignature = (
  fn: Function,
  exportedName: string,
): ParsedFunctionSignature => {
  const strippedSource = stripComments(fn.toString()).trim();
  const isAsync = /^async\b/.test(strippedSource);
  const sourceWithoutAsync = isAsync
    ? strippedSource.slice("async".length).trimStart()
    : strippedSource;

  const parameterListSource = extractParameterListSource(sourceWithoutAsync);

  if (parameterListSource.trim() === "") {
    return { name: exportedName, isAsync, parameters: [] };
  }

  const parameters = splitTopLevel(parameterListSource, ",")
    .map((slice) => slice.trim())
    .filter((slice) => slice !== "")
    .map((slice) => parseParameter(slice, exportedName));

  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    const isLast = index === parameters.length - 1;
    if ((parameter.kind === "options" || parameter.kind === "rest") && !isLast) {
      throw new Error(
        `${parameter.kind} parameter "${parameter.name}" must be last in "${exportedName}"`,
      );
    }
  }

  return { name: exportedName, isAsync, parameters };
};
