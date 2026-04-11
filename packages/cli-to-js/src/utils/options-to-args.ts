import { camelToKebab } from "./camel-to-kebab.js";
import { SHORT_FLAG_MAX_LENGTH } from "../constants.js";

export const optionsToArgs = (
  options: Record<string, unknown>,
  equalsFlags: Set<string> = new Set(),
): string[] => {
  const flagArgs: string[] = [];
  const positionalArgs: string[] = [];

  for (const [key, value] of Object.entries(options)) {
    if (key === "_") {
      if (value === undefined || value === null) continue;
      const positionals = Array.isArray(value) ? value : [value];
      positionalArgs.push(...positionals.map(String));
      continue;
    }

    const flagName = key.startsWith("-")
      ? key
      : key.length <= SHORT_FLAG_MAX_LENGTH
        ? `-${key}`
        : `--${camelToKebab(key)}`;

    const useEqualsSeparator = equalsFlags.has(key);

    if (typeof value === "boolean") {
      if (value) {
        flagArgs.push(flagName);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (useEqualsSeparator) {
          flagArgs.push(`${flagName}=${String(item)}`);
        } else {
          flagArgs.push(flagName, String(item));
        }
      }
    } else if (value !== undefined && value !== null) {
      if (useEqualsSeparator) {
        flagArgs.push(`${flagName}=${String(value)}`);
      } else {
        flagArgs.push(flagName, String(value));
      }
    }
  }

  return [...flagArgs, ...positionalArgs];
};
