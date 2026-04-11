import { runCommand, pickOutput } from "./exec.js";
import { parseHelpText, type CliSchema } from "./parse-help-text.js";
import { enrichSubcommands } from "./parse-subcommands.js";
import { HELP_TIMEOUT_MS } from "./constants.js";
import type { CliToJsOptions } from "./index.js";

export const loadSchema = async (
  binaryName: string,
  options: CliToJsOptions = {},
): Promise<CliSchema> => {
  const { helpFlag = "--help", timeout = HELP_TIMEOUT_MS, cwd, env, subcommands = false } = options;

  const result = await runCommand(binaryName, [helpFlag], {}, { timeout, cwd, env });
  const helpText = pickOutput(result);
  const schema = parseHelpText(binaryName, helpText);

  if (subcommands && schema.command.subcommands.length > 0) {
    await enrichSubcommands(binaryName, schema, { timeout, cwd, env });
  }

  return schema;
};
