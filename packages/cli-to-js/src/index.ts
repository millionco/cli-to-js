import { parseHelpText } from "./parse-help-text.js";
import { buildApi } from "./build-api.js";
import { loadSchema } from "./load-schema.js";
import type { CliApi } from "./cli-api.js";

export interface CliToJsOptions {
  helpFlag?: string;
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  subcommands?: boolean;
}

export const convertCliToJs = async <
  T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
>(
  binaryName: string,
  options: CliToJsOptions = {},
): Promise<CliApi<T>> => {
  const schema = await loadSchema(binaryName, options);
  return buildApi<T>(binaryName, schema, { cwd: options.cwd, env: options.env });
};

export const fromHelpText = <
  T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
>(
  binaryName: string,
  helpText: string,
  options: CliToJsOptions = {},
): CliApi<T> => {
  const schema = parseHelpText(binaryName, helpText);
  return buildApi<T>(binaryName, schema, { cwd: options.cwd, env: options.env });
};

export { parseHelpText } from "./parse-help-text.js";
export { runCommand, spawnCommand } from "./exec.js";
export { selectHelpOutput } from "./utils/best-help-text.js";
export { loadSchema } from "./load-schema.js";
export { parseSubcommandHelp, enrichSubcommands } from "./parse-subcommands.js";
export { generate, generateTypes } from "./generate.js";
export { validateOptions } from "./validate.js";
export type { ValidationError } from "./validate.js";
export type { CliApi, CliApiBase, SubcommandFn, SpawnFn } from "./cli-api.js";
export type {
  CliSchema,
  ParsedCommand,
  ParsedFlag,
  ParsedSubcommand,
  ParsedPositionalArg,
} from "./parse-help-text.js";
export type { CommandResult, RunConfig, CommandProcess } from "./exec.js";
