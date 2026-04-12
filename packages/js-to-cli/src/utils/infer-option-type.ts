export interface BooleanOption {
  commanderType: "boolean";
}

export interface NegatedBooleanOption {
  commanderType: "negated-boolean";
}

export interface NumberOption {
  commanderType: "number";
  defaultValue: number;
}

export interface ArrayOption {
  commanderType: "array";
}

export interface StringOption {
  commanderType: "string";
  defaultValue: string | undefined;
}

export interface RequiredStringOption {
  commanderType: "required-string";
}

export type InferredOptionType =
  | BooleanOption
  | NegatedBooleanOption
  | NumberOption
  | ArrayOption
  | StringOption
  | RequiredStringOption;

const NUMBER_LITERAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export const inferOptionType = (defaultLiteral: string | null): InferredOptionType => {
  if (defaultLiteral === null) {
    return { commanderType: "required-string" };
  }

  const trimmedLiteral = defaultLiteral.trim();

  if (trimmedLiteral === "false") {
    return { commanderType: "boolean" };
  }

  if (trimmedLiteral === "true") {
    return { commanderType: "negated-boolean" };
  }

  if (NUMBER_LITERAL_PATTERN.test(trimmedLiteral)) {
    return { commanderType: "number", defaultValue: parseFloat(trimmedLiteral) };
  }

  if (trimmedLiteral.startsWith("[")) {
    return { commanderType: "array" };
  }

  const firstCharacter = trimmedLiteral[0];
  if (firstCharacter === '"' || firstCharacter === "'" || firstCharacter === "`") {
    const lastCharacter = trimmedLiteral[trimmedLiteral.length - 1];
    const unquotedDefault =
      lastCharacter === firstCharacter ? trimmedLiteral.slice(1, -1) : trimmedLiteral.slice(1);
    return { commanderType: "string", defaultValue: unquotedDefault };
  }

  return { commanderType: "string", defaultValue: undefined };
};
