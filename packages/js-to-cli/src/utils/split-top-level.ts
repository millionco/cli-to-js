export const splitTopLevel = (source: string, separator: string): string[] => {
  const segments: string[] = [];
  let depth = 0;
  let stringQuote: string | null = null;
  let segmentStart = 0;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];

    if (stringQuote !== null) {
      if (character === "\\") {
        index++;
        continue;
      }
      if (character === stringQuote) {
        stringQuote = null;
      }
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

    if (depth === 0 && source.startsWith(separator, index)) {
      segments.push(source.slice(segmentStart, index));
      segmentStart = index + separator.length;
      index += separator.length - 1;
    }
  }

  segments.push(source.slice(segmentStart));
  return segments;
};
