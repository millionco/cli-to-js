import type { ParsedCommand, ParsedFlag, ParsedPositionalArg } from "./parse-help-text.js";
import { MAX_SUGGESTION_DISTANCE } from "./constants.js";

export interface ValidationError {
  kind: "unknown-flag" | "type-mismatch" | "missing-positional" | "variadic-mismatch";
  name: string;
  message: string;
  suggestion?: string;
}

const kebabToCamel = (input: string): string =>
  input.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());

const levenshteinDistance = (source: string, target: string): number => {
  const sourceLength = source.length;
  const targetLength = target.length;

  if (sourceLength === 0) return targetLength;
  if (targetLength === 0) return sourceLength;

  const matrix: number[][] = Array.from({ length: sourceLength + 1 }, () =>
    Array.from<number>({ length: targetLength + 1 }).fill(0),
  );

  for (let rowIndex = 0; rowIndex <= sourceLength; rowIndex++) matrix[rowIndex][0] = rowIndex;
  for (let columnIndex = 0; columnIndex <= targetLength; columnIndex++)
    matrix[0][columnIndex] = columnIndex;

  for (let rowIndex = 1; rowIndex <= sourceLength; rowIndex++) {
    for (let columnIndex = 1; columnIndex <= targetLength; columnIndex++) {
      const substitutionCost = source[rowIndex - 1] === target[columnIndex - 1] ? 0 : 1;
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + substitutionCost,
      );
    }
  }

  return matrix[sourceLength][targetLength];
};

const findClosestFlag = (input: string, knownFlags: string[]): string | undefined => {
  let bestMatch: string | undefined;
  let bestDistance = MAX_SUGGESTION_DISTANCE + 1;

  for (const flag of knownFlags) {
    const distance = levenshteinDistance(input.toLowerCase(), flag.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = flag;
    }
  }

  return bestMatch;
};

const buildFlagLookup = (flags: ParsedFlag[]): Map<string, ParsedFlag> => {
  const lookup = new Map<string, ParsedFlag>();
  for (const flag of flags) {
    lookup.set(kebabToCamel(flag.longName), flag);
  }
  return lookup;
};

const validateFlags = (
  options: Record<string, unknown>,
  flagLookup: Map<string, ParsedFlag>,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const knownCamelNames = [...flagLookup.keys()];

  for (const [key, value] of Object.entries(options)) {
    if (key === "_") continue;
    if (key.startsWith("-")) continue;

    const matchedFlag = flagLookup.get(key);

    if (!matchedFlag) {
      const suggestion = findClosestFlag(key, knownCamelNames);
      const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
      errors.push({
        kind: "unknown-flag",
        name: key,
        message: `Unknown flag "${key}".${suggestionText}`,
        suggestion: suggestion ?? undefined,
      });
      continue;
    }

    if (matchedFlag.takesValue && typeof value === "boolean") {
      errors.push({
        kind: "type-mismatch",
        name: key,
        message: `Flag "${key}" expects a value but received a boolean.`,
      });
    } else if (!matchedFlag.takesValue && typeof value === "string") {
      errors.push({
        kind: "type-mismatch",
        name: key,
        message: `Flag "${key}" is a boolean flag but received a string value.`,
      });
    }
  }

  return errors;
};

const validatePositionals = (
  options: Record<string, unknown>,
  positionalArgs: ParsedPositionalArg[],
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const rawPositionals = options._ ?? [];
  const providedPositionals = Array.isArray(rawPositionals) ? rawPositionals : [rawPositionals];

  let requiredCount = 0;
  for (const positionalArg of positionalArgs) {
    if (positionalArg.required) requiredCount++;
  }

  if (providedPositionals.length < requiredCount) {
    const missingArgs = positionalArgs
      .slice(providedPositionals.length)
      .filter((positionalArg) => positionalArg.required);
    for (const missingArg of missingArgs) {
      errors.push({
        kind: "missing-positional",
        name: missingArg.name,
        message: `Required positional argument "${missingArg.name}" is missing.`,
      });
    }
  }

  for (
    let index = 0;
    index < positionalArgs.length && index < providedPositionals.length;
    index++
  ) {
    const positionalArg = positionalArgs[index];
    if (!positionalArg.variadic && Array.isArray(options._)) {
      const remainingNonVariadic = positionalArgs
        .slice(index)
        .filter((innerArg) => !innerArg.variadic);

      if (
        remainingNonVariadic.length > 0 &&
        index === positionalArgs.length - 1 &&
        !positionalArg.variadic &&
        providedPositionals.length > positionalArgs.length
      ) {
        errors.push({
          kind: "variadic-mismatch",
          name: positionalArg.name,
          message: `Positional argument "${positionalArg.name}" is not variadic but received multiple values.`,
        });
        break;
      }
    }
  }

  return errors;
};

export const validateOptions = (
  command: ParsedCommand,
  options: Record<string, unknown>,
): ValidationError[] => {
  const flagLookup = buildFlagLookup(command.flags);
  return [
    ...validateFlags(options, flagLookup),
    ...validatePositionals(options, command.positionalArgs),
  ];
};
