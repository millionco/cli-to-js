import { DESCRIPTION_CONTINUATION_INDENT_MIN, COLUMN_SEPARATOR_MIN_SPACES } from "./constants.js";

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\u001B(?:\[[0-9;]*[a-zA-Z]|\].*?(?:\u0007|\u001B\\))/g;
const stripAnsi = (input: string): string => input.replace(ANSI_ESCAPE_PATTERN, "");

export interface ParsedFlag {
  longName: string;
  shortName: string | null;
  description: string;
  takesValue: boolean;
  valueName: string | null;
  defaultValue: string | null;
  isNegated: boolean;
}

export interface ParsedPositionalArg {
  name: string;
  required: boolean;
  variadic: boolean;
}

export interface ParsedSubcommand {
  name: string;
  description: string;
  flags?: ParsedFlag[];
  positionalArgs?: ParsedPositionalArg[];
}

export interface ParsedCommand {
  name: string;
  description: string;
  flags: ParsedFlag[];
  positionalArgs: ParsedPositionalArg[];
  subcommands: ParsedSubcommand[];
}

export interface CliSchema {
  binaryName: string;
  command: ParsedCommand;
}

type SectionKind = "options" | "commands" | "arguments" | "unknown";

const USAGE_LINE_PATTERN = /usage:\s*(\S+)(.*)/i;
const SECTION_HEADER_PATTERN = /^\s*([A-Za-z][A-Za-z\s]*?)\s*:\s*$/;
const FLAG_START_PATTERN = /^\s+-/;
const CONTINUATION_PATTERN = new RegExp(`^\\s{${DESCRIPTION_CONTINUATION_INDENT_MIN},}\\S`);
const COLUMN_SEPARATOR_PATTERN = new RegExp(`^(.+?)\\s{${COLUMN_SEPARATOR_MIN_SPACES},}(.+)$`);

const classifySection = (headerText: string): SectionKind => {
  const lower = headerText.toLowerCase();
  if (lower.includes("option") || lower.includes("flag")) return "options";
  if (lower.includes("command") || lower.includes("subcommand")) return "commands";
  if (lower.includes("argument") || lower.includes("positional")) return "arguments";
  return "unknown";
};

const extractDefaultFromDescription = (description: string): string | null => {
  const match = description.match(/\(default:\s*"?([^)"]*)"?\)/);
  return match ? match[1] : null;
};

const parseFlagLine = (line: string): ParsedFlag | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("-")) return null;

  const separatorMatch = trimmed.match(COLUMN_SEPARATOR_PATTERN);

  let flagPart: string;
  let description: string;

  if (separatorMatch) {
    flagPart = separatorMatch[1].trim();
    description = separatorMatch[2].trim();
  } else {
    flagPart = trimmed;
    description = "";
  }

  let shortName: string | null = null;
  let longName: string | null = null;
  let takesValue = false;
  let valueName: string | null = null;

  const segments = flagPart.split(",").map((segment) => segment.trim());

  for (const rawSegment of segments) {
    const segment = rawSegment.replace(/\[no-\]/g, "");

    if (segment.startsWith("--")) {
      const longMatch = segment.match(/^(--[\w-]+)(?:[=\s]+[<[]?([\w.-]+)[>\]]?)?/);
      if (longMatch) {
        longName = longMatch[1].slice(2);
        if (longMatch[2]) {
          takesValue = true;
          valueName = longMatch[2];
        }
      }
    } else if (segment.startsWith("-")) {
      const shortMatch = segment.match(/^(-\w)(?:\s+[<[]?([\w.-]+)[>\]]?)?/);
      if (shortMatch) {
        shortName = shortMatch[1];
        if (shortMatch[2] && !takesValue) {
          takesValue = true;
          valueName = shortMatch[2];
        }
      }
    }
  }

  if (!longName && !shortName) return null;

  if (!longName && shortName) {
    longName = shortName.slice(1);
  }

  const resolvedLongName = longName ?? "";
  if (!resolvedLongName) return null;

  return {
    longName: resolvedLongName,
    shortName,
    description,
    takesValue,
    valueName,
    defaultValue: extractDefaultFromDescription(description),
    isNegated: Boolean(longName?.startsWith("no-")),
  };
};

const parseCommandLine = (line: string): ParsedSubcommand | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("-")) return null;

  const commandSeparatorPattern = new RegExp(
    `^([\\w][\\w-]*(?:\\|[\\w][\\w-]*)*(?:\\s+(?:\\[.*?\\]|<.*?>))*)\\s{${COLUMN_SEPARATOR_MIN_SPACES},}(.+)$`,
  );
  const separatorMatch = trimmed.match(commandSeparatorPattern);

  if (separatorMatch) {
    const nameMatch = separatorMatch[1].match(/^([\w][\w-]*)/);
    if (!nameMatch) return null;

    const name = nameMatch[1];
    if (name === "help") return null;

    return { name, description: separatorMatch[2].trim() };
  }

  const nameOnly = trimmed.match(/^([\w][\w-]*(?:\|[\w][\w-]*)*)$/);
  if (nameOnly) {
    const primaryName = nameOnly[1].split("|")[0];
    if (primaryName === "help") return null;
    return { name: primaryName, description: "" };
  }

  return null;
};

const parseUsageLine = (line: string): ParsedPositionalArg[] => {
  const usageMatch = line.match(USAGE_LINE_PATTERN);
  if (!usageMatch) return [];

  const argsStr = usageMatch[2];
  const positionalArgs: ParsedPositionalArg[] = [];
  const argPattern = /(<([\w.-]+)(?:\.\.\.)?>(\.\.\.)?|\[([\w.-]+)(?:\.\.\.)?](\.\.\.)?)/g;
  let match;

  while ((match = argPattern.exec(argsStr)) !== null) {
    const fullMatch = match[0];
    const isRequired = fullMatch.startsWith("<");
    const name = match[2] || match[4];
    const isVariadic = fullMatch.includes("...");

    if (name === "options" || name === "command" || name === "cmd") continue;

    positionalArgs.push({ name, required: isRequired, variadic: isVariadic });
  }

  return positionalArgs;
};

export const parseHelpText = (binaryName: string, helpText: string): CliSchema => {
  const cleanedText = stripAnsi(helpText);
  const lines = cleanedText.split("\n");
  const flags: ParsedFlag[] = [];
  const subcommands: ParsedSubcommand[] = [];
  let positionalArgs: ParsedPositionalArg[] = [];
  let currentSection: SectionKind = "unknown";
  let seenUsageLine = false;
  let seenFirstSection = false;
  const descriptionLines: string[] = [];

  for (const line of lines) {
    if (line.match(USAGE_LINE_PATTERN)) {
      positionalArgs = parseUsageLine(line);
      seenUsageLine = true;
      continue;
    }

    const headerMatch = line.match(SECTION_HEADER_PATTERN);
    if (headerMatch) {
      currentSection = classifySection(headerMatch[1]);
      seenFirstSection = true;
      continue;
    }

    if (seenUsageLine && !seenFirstSection && line.trim() && !FLAG_START_PATTERN.test(line)) {
      descriptionLines.push(line.trim());
      continue;
    }

    if (
      (currentSection === "options" || currentSection === "unknown") &&
      FLAG_START_PATTERN.test(line)
    ) {
      const flag = parseFlagLine(line);
      if (
        flag &&
        flag.longName !== "help" &&
        flag.longName !== "version" &&
        flag.longName !== "h" &&
        flag.longName !== "V"
      ) {
        flags.push(flag);
      }
    } else if (
      (currentSection === "options" || currentSection === "unknown") &&
      CONTINUATION_PATTERN.test(line) &&
      line.trim() &&
      flags.length > 0
    ) {
      const previousFlag = flags[flags.length - 1];
      previousFlag.description += " " + line.trim();
      previousFlag.defaultValue = extractDefaultFromDescription(previousFlag.description);
    } else if (currentSection === "commands" && line.trim() && !FLAG_START_PATTERN.test(line)) {
      if (CONTINUATION_PATTERN.test(line) && subcommands.length > 0) {
        const previousCommand = subcommands[subcommands.length - 1];
        previousCommand.description += " " + line.trim();
      } else {
        const command = parseCommandLine(line);
        if (command) {
          subcommands.push(command);
        }
      }
    }
  }

  return {
    binaryName,
    command: {
      name: binaryName,
      description: descriptionLines.join(" "),
      flags,
      positionalArgs,
      subcommands,
    },
  };
};
