import { parseHelpText, type CliSchema } from "./parse-help-text.js";
import { enrichSubcommands } from "./parse-subcommands.js";
import { runForHelp } from "./utils/run-for-help.js";
import { selectHelpOutput } from "./utils/best-help-text.js";
import { HELP_TIMEOUT_MS } from "./constants.js";
import type { CliToJsOptions } from "./index.js";

export const loadSchema = async (
  binaryName: string,
  options: CliToJsOptions = {},
): Promise<CliSchema> => {
  const { helpFlag = "--help", timeout = HELP_TIMEOUT_MS, cwd, env, subcommands = true } = options;

  const result = await runForHelp(binaryName, [helpFlag], timeout, cwd, env);
  const helpText = selectHelpOutput(result.stdout, result.stderr);
  const schema = parseHelpText(binaryName, helpText);

  if (subcommands && schema.command.subcommands.length > 0) {
    await enrichSubcommands(binaryName, schema, { timeout, cwd, env });
  }

  return schema;
};
