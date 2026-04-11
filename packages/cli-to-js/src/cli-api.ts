import type { CommandResult, RunConfig, CommandProcess } from "./exec.js";
import type { CliSchema, ParsedCommand } from "./parse-help-text.js";
import type { ValidationError } from "./validate.js";

interface CommandPromise extends Promise<CommandResult> {
  text: () => Promise<string>;
  lines: () => Promise<string[]>;
  json: <T = unknown>() => Promise<T>;
}

interface SubcommandFn<TOptions = Record<string, unknown>> {
  (
    options?: TOptions & { _?: string | string[]; [key: string]: unknown },
    config?: RunConfig,
  ): CommandPromise;
}

interface SpawnFn<TOptions = Record<string, unknown>> {
  (
    options?: TOptions & { _?: string | string[]; [key: string]: unknown },
    config?: RunConfig,
  ): CommandProcess;
}

interface CliApiBase {
  (options?: Record<string, unknown>, config?: RunConfig): CommandPromise;
  (subcommand: string, options?: Record<string, unknown>, config?: RunConfig): CommandPromise;

  $schema: CliSchema;
  $validate: {
    (options?: Record<string, unknown>): ValidationError[];
    (subcommand: string, options?: Record<string, unknown>): ValidationError[];
  };
  $parse: {
    (name: string): Promise<ParsedCommand | undefined>;
    (): Promise<void>;
  };
  $spawn: { [key: string]: SpawnFn } & {
    (options?: Record<string, unknown>, config?: RunConfig): CommandProcess;
    (subcommand: string, options?: Record<string, unknown>, config?: RunConfig): CommandProcess;
  };
  $command: { [key: string]: (options?: Record<string, unknown>) => string } & {
    (options?: Record<string, unknown>): string;
    (subcommand: string, options?: Record<string, unknown>): string;
  };
}

type CliApi<
  T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
> = { [K in keyof T]: SubcommandFn<T[K]> } & CliApiBase;

export type { CliApi, CliApiBase, SubcommandFn, SpawnFn, CommandPromise };
