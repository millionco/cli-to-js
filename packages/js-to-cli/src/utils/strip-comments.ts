export const stripComments = (source: string): string => {
  let output = "";
  let stringQuote: string | null = null;
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (stringQuote !== null) {
      output += character;
      if (character === "\\" && index + 1 < source.length) {
        output += source[index + 1];
        index += 2;
        continue;
      }
      if (character === stringQuote) {
        stringQuote = null;
      }
      index++;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      stringQuote = character;
      output += character;
      index++;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      const newlineIndex = source.indexOf("\n", index + 2);
      if (newlineIndex === -1) {
        index = source.length;
      } else {
        index = newlineIndex;
      }
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      const closingIndex = source.indexOf("*/", index + 2);
      if (closingIndex === -1) {
        index = source.length;
      } else {
        index = closingIndex + 2;
      }
      continue;
    }

    output += character;
    index++;
  }

  return output;
};
