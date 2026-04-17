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

export interface KnownCliOptions {}

export interface ConvertCliToJs {
  <N extends keyof KnownCliOptions & string>(
    binaryName: N,
    options?: CliToJsOptions,
  ): Promise<
    CliApi<
      KnownCliOptions[N] extends Record<string, Record<string, unknown>>
        ? KnownCliOptions[N]
        : Record<string, Record<string, unknown>>
    >
  >;
  <T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>>(
    binaryName: string,
    options?: CliToJsOptions,
  ): Promise<CliApi<T>>;
}

export interface FromHelpText {
  <N extends keyof KnownCliOptions & string>(
    binaryName: N,
    helpText: string,
    options?: CliToJsOptions,
  ): CliApi<
    KnownCliOptions[N] extends Record<string, Record<string, unknown>>
      ? KnownCliOptions[N]
      : Record<string, Record<string, unknown>>
  >;
  <T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>>(
    binaryName: string,
    helpText: string,
    options?: CliToJsOptions,
  ): CliApi<T>;
}

export const convertCliToJs: ConvertCliToJs = async <
  T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
>(
  binaryName: string,
  options: CliToJsOptions = {},
): Promise<CliApi<T>> => {
  const schema = await loadSchema(binaryName, options);
  return buildApi<T>(binaryName, schema, { cwd: options.cwd, env: options.env });
};

export const fromHelpText: FromHelpText = <
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
export { toCommandString } from "./utils/to-command-string.js";
export { script } from "./utils/script.js";
export { text, lines, json } from "./utils/parse-output.js";
export { loadSchema } from "./load-schema.js";
export { parseSubcommandHelp, enrichSubcommands } from "./parse-subcommands.js";
export { generate, generateTypes } from "./generate.js";
export { validateOptions } from "./validate.js";
export type { ValidationError } from "./validate.js";
export type { CliApi, CliApiBase, SubcommandFn, SpawnFn, CommandPromise } from "./cli-api.js";
export type {
  CliSchema,
  ParsedCommand,
  ParsedFlag,
  ParsedSubcommand,
  ParsedPositionalArg,
} from "./parse-help-text.js";
export type { CommandResult, RunConfig, CommandProcess } from "./exec.js";
