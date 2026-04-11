import type { ParsedFlag, ParsedPositionalArg } from "cli-to-js";

interface JsonSchemaProperty {
  type: string;
  description?: string;
  default?: string;
}

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

const kebabToCamel = (input: string): string =>
  input.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());

const flagToProperty = (flag: ParsedFlag): JsonSchemaProperty => ({
  type: flag.takesValue ? "string" : "boolean",
  ...(flag.description ? { description: flag.description } : {}),
  ...(flag.defaultValue ? { default: flag.defaultValue } : {}),
});

const formatPositionalSignature = (positionalArg: ParsedPositionalArg): string => {
  const open = positionalArg.required ? "<" : "[";
  const close = positionalArg.required ? ">" : "]";
  const ellipsis = positionalArg.variadic ? "..." : "";
  return `${open}${positionalArg.name}${ellipsis}${close}`;
};

export const buildInputSchema = (
  flags: ParsedFlag[],
  positionalArgs: ParsedPositionalArg[],
): JsonSchemaObject => {
  const properties: Record<string, JsonSchemaProperty> = {};

  for (const flag of flags) {
    properties[kebabToCamel(flag.longName)] = flagToProperty(flag);
  }

  if (positionalArgs.length > 0) {
    const hasVariadic = positionalArgs.some((positionalArg) => positionalArg.variadic);
    const signature = positionalArgs.map(formatPositionalSignature).join(" ");

    properties._ = {
      type: hasVariadic ? "array" : "string",
      description: `Positional arguments: ${signature}`,
    };
  }

  const hasRequiredPositional = positionalArgs.some((positionalArg) => positionalArg.required);

  return {
    type: "object",
    properties,
    ...(hasRequiredPositional ? { required: ["_"] } : {}),
  };
};
