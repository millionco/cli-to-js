import type { RunConfig } from "./exec.js";
import { parseHelpText, type CliSchema, type ParsedCommand } from "./parse-help-text.js";
import { runForHelp } from "./utils/run-for-help.js";
import { selectHelpOutput } from "./utils/best-help-text.js";
import { HELP_TIMEOUT_MS } from "./constants.js";

const SUBCOMMAND_HELP_FLAGS = ["-h", "--help"];

const hasContent = (command: ParsedCommand): boolean =>
  command.flags.length > 0 || command.subcommands.length > 0 || command.positionalArgs.length > 0;

export const parseSubcommandHelp = async (
  binaryName: string,
  subcommandPath: string | string[],
  config: RunConfig = {},
): Promise<ParsedCommand | null> => {
  const timeout = config.timeout ?? HELP_TIMEOUT_MS;
  const pathSegments = Array.isArray(subcommandPath) ? subcommandPath : [subcommandPath];
  const displayName = pathSegments[pathSegments.length - 1];

  for (const helpFlag of SUBCOMMAND_HELP_FLAGS) {
    try {
      const result = await runForHelp(
        binaryName,
        [...pathSegments, helpFlag],
        timeout,
        config.cwd,
        config.env,
      );
      const helpText = selectHelpOutput(result.stdout, result.stderr);
      if (!helpText.trim()) continue;

      const schema = parseHelpText(displayName, helpText);
      if (hasContent(schema.command)) return schema.command;
    } catch {
      continue;
    }
  }

  return null;
};

export const enrichSubcommands = async (
  binaryName: string,
  schema: CliSchema,
  config: RunConfig = {},
): Promise<void> => {
  await Promise.allSettled(
    schema.command.subcommands.map(async (subcommand) => {
      const parsed = await parseSubcommandHelp(binaryName, subcommand.name, config);
      if (parsed) {
        subcommand.flags = parsed.flags;
        subcommand.positionalArgs = parsed.positionalArgs;
        if (parsed.subcommands.length > 0) {
          subcommand.subcommands = parsed.subcommands;
        }
      }
    }),
  );
};
