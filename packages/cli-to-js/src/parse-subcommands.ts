import { runCommand, pickOutput, type RunConfig } from "./exec.js";
import { parseHelpText, type CliSchema, type ParsedCommand } from "./parse-help-text.js";
import { HELP_TIMEOUT_MS } from "./constants.js";

const SUBCOMMAND_HELP_FLAGS = ["-h", "--help"];

const hasContent = (command: ParsedCommand): boolean =>
  command.flags.length > 0 || command.subcommands.length > 0 || command.positionalArgs.length > 0;

export const parseSubcommandHelp = async (
  binaryName: string,
  subcommandName: string,
  config: RunConfig = {},
): Promise<ParsedCommand | null> => {
  const timeout = config.timeout ?? HELP_TIMEOUT_MS;

  for (const helpFlag of SUBCOMMAND_HELP_FLAGS) {
    try {
      const result = await runCommand(
        binaryName,
        [subcommandName, helpFlag],
        {},
        { timeout, cwd: config.cwd, env: config.env },
      );
      const helpText = pickOutput(result);
      if (!helpText.trim()) continue;

      const schema = parseHelpText(subcommandName, helpText);
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
      }
    }),
  );
};
