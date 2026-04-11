import type { ParsedCommand, ParsedFlag, ParsedPositionalArg } from "./parse-help-text.js";
import { MAX_SUGGESTION_DISTANCE } from "./constants.js";
import { kebabToCamel } from "./utils/kebab-to-camel.js";
import { levenshteinDistance } from "./utils/levenshtein-distance.js";

export interface ValidationError {
  kind:
    | "unknown-flag"
    | "type-mismatch"
    | "invalid-choice"
    | "missing-required-flag"
    | "missing-positional"
    | "variadic-mismatch"
    | "exclusive-conflict";
  name: string;
  message: string;
  suggestion?: string;
  choices?: string[];
}

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
        suggestion,
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

    if (matchedFlag.choices) {
      const valuesToCheck = Array.isArray(value)
        ? value.map(String)
        : typeof value === "string"
          ? [value]
          : [];
      for (const singleValue of valuesToCheck) {
        if (!matchedFlag.choices.includes(singleValue)) {
          errors.push({
            kind: "invalid-choice",
            name: key,
            message: `Flag "${key}" received "${singleValue}" but must be one of: ${matchedFlag.choices.join(", ")}.`,
            choices: matchedFlag.choices,
          });
        }
      }
    }
  }

  const requiredFlags = [...flagLookup.entries()].filter(([, flag]) => flag.isRequired);
  for (const [camelName, flag] of requiredFlags) {
    if (!(camelName in options)) {
      errors.push({
        kind: "missing-required-flag",
        name: camelName,
        message: `Required flag "${camelName}" (--${flag.longName}) is missing.`,
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

  const hasVariadicArg = positionalArgs.some((positionalArg) => positionalArg.variadic);

  if (!hasVariadicArg && providedPositionals.length > positionalArgs.length) {
    errors.push({
      kind: "variadic-mismatch",
      name: positionalArgs.length > 0 ? positionalArgs[positionalArgs.length - 1].name : "_",
      message: `Expected at most ${positionalArgs.length} positional argument(s) but received ${providedPositionals.length}.`,
    });
  }

  return errors;
};

const validateExclusiveGroups = (
  options: Record<string, unknown>,
  mutuallyExclusiveFlags: string[][],
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const providedKeys = new Set(Object.keys(options).filter((key) => key !== "_"));

  for (const group of mutuallyExclusiveFlags) {
    const camelGroup = group.map((flagName) => kebabToCamel(flagName));
    const presentFlags = camelGroup.filter((camelName) => providedKeys.has(camelName));

    if (presentFlags.length > 1) {
      errors.push({
        kind: "exclusive-conflict",
        name: presentFlags.join(", "),
        message: `Flags ${presentFlags.map((flagName) => `"${flagName}"`).join(" and ")} are mutually exclusive.`,
      });
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
    ...validateExclusiveGroups(options, command.mutuallyExclusiveFlags ?? []),
  ];
};
