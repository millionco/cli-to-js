import type { CliSchema, ParsedCommand, ParsedFlag } from "./parse-help-text.js";
import {
  runCommand,
  spawnCommand,
  type CommandResult,
  type RunConfig,
  type CommandProcess,
} from "./exec.js";
import { parseSubcommandHelp, enrichSubcommands } from "./parse-subcommands.js";
import { validateOptions, type ValidationError } from "./validate.js";
import { kebabToCamel } from "./utils/kebab-to-camel.js";
import type { CliApi } from "./cli-api.js";

const RESERVED_PROPERTIES = new Set([
  "then",
  "catch",
  "finally",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "toJSON",
]);

interface NormalizedCall {
  subcommands: string[];
  options: Record<string, unknown>;
  config: RunConfig;
}

const isPlainOptionsObject = (
  value: Record<string, unknown> | RunConfig | undefined,
): value is Record<string, unknown> => typeof value === "object" && value !== null;

const normalizeCallArgs = (
  firstArg: string | Record<string, unknown> | undefined,
  secondArg: Record<string, unknown> | RunConfig | undefined,
  thirdArg: RunConfig | undefined,
  mergeConfig: (perCall?: RunConfig) => RunConfig,
): NormalizedCall => {
  if (typeof firstArg === "string") {
    return {
      subcommands: [firstArg],
      options: isPlainOptionsObject(secondArg) ? secondArg : {},
      config: mergeConfig(thirdArg),
    };
  }
  return {
    subcommands: [],
    options: firstArg ?? {},
    config: mergeConfig((thirdArg ?? secondArg) as RunConfig | undefined),
  };
};

const collectEqualsFlags = (flags: ParsedFlag[]): Set<string> => {
  const equalsFlagNames = new Set<string>();
  for (const flag of flags) {
    if (flag.usesEquals) {
      equalsFlagNames.add(kebabToCamel(flag.longName));
    }
  }
  return equalsFlagNames;
};

const getEqualsFlags = (
  schema: CliSchema,
  subcommandName: string,
  rootEqualsFlags: Set<string>,
): Set<string> => {
  const subcommand = schema.command.subcommands.find(
    (innerSubcommand) =>
      innerSubcommand.name === subcommandName ||
      (innerSubcommand.aliases && innerSubcommand.aliases.includes(subcommandName)),
  );
  if (!subcommand?.flags) return rootEqualsFlags;
  const subcommandEqualsFlags = collectEqualsFlags(subcommand.flags);
  if (subcommandEqualsFlags.size === 0) return rootEqualsFlags;
  return new Set([...rootEqualsFlags, ...subcommandEqualsFlags]);
};

const resolveAlias = (schema: CliSchema, property: string): string => {
  const subcommand = schema.command.subcommands.find(
    (innerSubcommand) =>
      innerSubcommand.name === property ||
      (innerSubcommand.aliases && innerSubcommand.aliases.includes(property)),
  );
  return subcommand?.name ?? property;
};

export const buildApi = <
  T extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
>(
  binaryName: string,
  schema: CliSchema,
  defaultConfig: RunConfig = {},
): CliApi<T> => {
  const mergeConfig = (perCall: RunConfig = {}): RunConfig => ({ ...defaultConfig, ...perCall });
  const rootEqualsFlags = collectEqualsFlags(schema.command.flags);

  const buildSpawnProxy = () => {
    const spawnRoot = (
      subcommandOrOptions?: string | Record<string, unknown>,
      optionsOrConfig?: Record<string, unknown> | RunConfig,
      maybeConfig?: RunConfig,
    ): CommandProcess => {
      const normalized = normalizeCallArgs(
        subcommandOrOptions,
        optionsOrConfig,
        maybeConfig,
        mergeConfig,
      );
      return spawnCommand(
        binaryName,
        normalized.subcommands,
        normalized.options,
        normalized.config,
        rootEqualsFlags,
      );
    };

    return new Proxy(spawnRoot, {
      get(spawnTarget, subProperty) {
        if (typeof subProperty === "symbol") return Reflect.get(spawnTarget, subProperty);
        if (subProperty === "then") return undefined;

        const resolvedName = resolveAlias(schema, subProperty);
        const effectiveEqualsFlags = getEqualsFlags(schema, resolvedName, rootEqualsFlags);
        return (options: Record<string, unknown> = {}, config: RunConfig = {}): CommandProcess =>
          spawnCommand(
            binaryName,
            [resolvedName],
            options,
            mergeConfig(config),
            effectiveEqualsFlags,
          );
      },
    });
  };

  const handleValidate = (
    subcommandOrOptions?: string | Record<string, unknown>,
    maybeOptions?: Record<string, unknown>,
  ): ValidationError[] => {
    if (typeof subcommandOrOptions === "string") {
      const subcommand = schema.command.subcommands.find(
        (innerSubcommand) =>
          innerSubcommand.name === subcommandOrOptions ||
          (innerSubcommand.aliases && innerSubcommand.aliases.includes(subcommandOrOptions)),
      );
      if (!subcommand) {
        throw new Error(
          `Unknown subcommand "${subcommandOrOptions}". Call $parse("${subcommandOrOptions}") first or pass { subcommands: true } to convertCliToJs.`,
        );
      }
      if (!subcommand.flags) {
        throw new Error(
          `Subcommand "${subcommandOrOptions}" has not been enriched with flags. Call $parse("${subcommandOrOptions}") first.`,
        );
      }
      const command: ParsedCommand = {
        name: subcommand.name,
        description: subcommand.description,
        flags: subcommand.flags,
        positionalArgs: subcommand.positionalArgs ?? [],
        subcommands: [],
        mutuallyExclusiveFlags: [],
      };
      return validateOptions(command, maybeOptions ?? {});
    }
    return validateOptions(schema.command, subcommandOrOptions ?? {});
  };

  const handleParse = async (subcommandName?: string): Promise<ParsedCommand | void> => {
    if (subcommandName) {
      const parsed = await parseSubcommandHelp(binaryName, subcommandName, defaultConfig);
      if (parsed) {
        const existing = schema.command.subcommands.find(
          (subcommand) => subcommand.name === subcommandName,
        );
        if (existing) {
          existing.flags = parsed.flags;
          existing.positionalArgs = parsed.positionalArgs;
        } else {
          schema.command.subcommands.push({
            name: subcommandName,
            aliases: [],
            description: parsed.description,
            flags: parsed.flags,
            positionalArgs: parsed.positionalArgs,
          });
        }
      }
      return parsed ?? undefined;
    }
    await enrichSubcommands(binaryName, schema, defaultConfig);
  };

  const rootExecutor = (
    subcommandOrOptions?: string | Record<string, unknown>,
    optionsOrConfig?: Record<string, unknown> | RunConfig,
    maybeConfig?: RunConfig,
  ): Promise<CommandResult> => {
    const normalized = normalizeCallArgs(
      subcommandOrOptions,
      optionsOrConfig,
      maybeConfig,
      mergeConfig,
    );
    return runCommand(
      binaryName,
      normalized.subcommands,
      normalized.options,
      normalized.config,
      rootEqualsFlags,
    );
  };

  return new Proxy(rootExecutor, {
    get(target, property) {
      if (property === "$schema") return schema;
      if (property === "$validate") return handleValidate;
      if (property === "$spawn") return buildSpawnProxy();
      if (property === "$parse") return handleParse;
      if (typeof property === "symbol") return Reflect.get(target, property);
      if (property === "then") return undefined;
      if (RESERVED_PROPERTIES.has(property)) return Reflect.get(target, property);

      const resolvedName = resolveAlias(schema, property);
      const effectiveEqualsFlags = getEqualsFlags(schema, resolvedName, rootEqualsFlags);
      return (
        options: Record<string, unknown> = {},
        config: RunConfig = {},
      ): Promise<CommandResult> =>
        runCommand(binaryName, [resolvedName], options, mergeConfig(config), effectiveEqualsFlags);
    },
  }) as unknown as CliApi<T>;
};
