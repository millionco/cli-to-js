import { Command } from "commander";
import { basename } from "node:path";
import { DEFAULT_FAILURE_EXIT_CODE } from "./constants.js";
import { loadModule } from "./load-module.js";
import {
  parseFunctionSignature,
  type ParsedFunctionSignature,
  type ParsedOptionField,
  type ParsedParameter,
} from "./parse-function.js";
import { camelToKebab } from "./utils/camel-to-kebab.js";
import { formatResult } from "./utils/format-result.js";
import { inferOptionType } from "./utils/infer-option-type.js";

export interface BuildCliOptions {
  programName?: string;
}

const collectArrayValue = (value: string, previous: string[]): string[] => [...previous, value];

const applyOptionField = (subcommand: Command, field: ParsedOptionField): void => {
  const kebabName = camelToKebab(field.name);
  const inferred = inferOptionType(field.defaultLiteral);

  switch (inferred.commanderType) {
    case "boolean":
      subcommand.option(`--${kebabName}`, "");
      return;
    case "negated-boolean":
      subcommand.option(`--no-${kebabName}`, "");
      return;
    case "number":
      subcommand.option(`--${kebabName} <number>`, "", parseFloat, inferred.defaultValue);
      return;
    case "array": {
      const emptyArrayDefault: string[] = [];
      subcommand.option(`--${kebabName} <value>`, "", collectArrayValue, emptyArrayDefault);
      return;
    }
    case "required-string":
      subcommand.requiredOption(`--${kebabName} <value>`, "");
      return;
    case "string":
      if (inferred.defaultValue !== undefined) {
        subcommand.option(`--${kebabName} <value>`, "", inferred.defaultValue);
        return;
      }
      subcommand.option(`--${kebabName} <value>`, "");
      return;
  }
};

const applyParameter = (subcommand: Command, parameter: ParsedParameter): void => {
  if (parameter.kind === "primitive") {
    const argumentSpec = parameter.hasDefault
      ? `[${camelToKebab(parameter.name)}]`
      : `<${camelToKebab(parameter.name)}>`;
    subcommand.argument(argumentSpec);
    return;
  }

  if (parameter.kind === "rest") {
    subcommand.argument(`[${camelToKebab(parameter.name)}...]`);
    return;
  }

  for (const field of parameter.optionFields ?? []) {
    applyOptionField(subcommand, field);
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const assembleCallArgs = (
  signature: ParsedFunctionSignature,
  commanderArgs: unknown[],
): unknown[] => {
  const positionalParameters = signature.parameters.filter(
    (parameter) => parameter.kind === "primitive" || parameter.kind === "rest",
  );
  const positionalValues = commanderArgs.slice(0, positionalParameters.length);
  const optionsSlot = commanderArgs[positionalParameters.length];
  const rawOptions: Record<string, unknown> = isPlainObject(optionsSlot) ? optionsSlot : {};

  const callArgs: unknown[] = [];
  let positionalCursor = 0;

  for (const parameter of signature.parameters) {
    if (parameter.kind === "primitive") {
      callArgs.push(positionalValues[positionalCursor]);
      positionalCursor++;
      continue;
    }

    if (parameter.kind === "rest") {
      const restValue = positionalValues[positionalCursor];
      positionalCursor++;
      if (Array.isArray(restValue)) {
        callArgs.push(...restValue);
      } else if (restValue !== undefined) {
        callArgs.push(restValue);
      }
      continue;
    }

    const optionsObject: Record<string, unknown> = {};
    for (const field of parameter.optionFields ?? []) {
      if (field.name in rawOptions) {
        optionsObject[field.name] = rawOptions[field.name];
      }
    }
    callArgs.push(optionsObject);
  }

  return callArgs;
};

const buildActionHandler =
  (fn: (...args: unknown[]) => unknown, signature: ParsedFunctionSignature) =>
  async (...commanderArgs: unknown[]): Promise<void> => {
    try {
      const callArgs = assembleCallArgs(signature, commanderArgs);
      const result = await fn(...callArgs);
      const formatted = formatResult(result);
      if (formatted !== null) process.stdout.write(formatted + "\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(message + "\n");
      process.exit(DEFAULT_FAILURE_EXIT_CODE);
    }
  };

export const convertJsToCli = async (
  modulePath: string,
  options: BuildCliOptions = {},
): Promise<Command> => {
  const loaded = await loadModule(modulePath);

  const program = new Command()
    .name(options.programName ?? basename(loaded.absolutePath))
    .description(`CLI generated from ${loaded.modulePath}`);

  for (const functionExport of loaded.functionExports) {
    const signature = parseFunctionSignature(functionExport.fn, functionExport.exportName);
    const subcommand = program.command(functionExport.commandName);
    for (const parameter of signature.parameters) {
      applyParameter(subcommand, parameter);
    }
    subcommand.action(buildActionHandler(functionExport.fn, signature));
  }

  return program;
};
