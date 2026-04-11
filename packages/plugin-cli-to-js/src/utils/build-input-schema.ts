import type { ParsedFlag, ParsedPositionalArg } from "cli-to-js";
import { kebabToCamel } from "./kebab-to-camel.js";
import { flagToJsonSchemaProperty } from "./flag-to-json-schema.js";

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, { type: string; description?: string; default?: string }>;
  required?: string[];
}

export const buildInputSchema = (
  flags: ParsedFlag[],
  positionalArgs: ParsedPositionalArg[],
): JsonSchemaObject => {
  const properties: Record<string, { type: string; description?: string; default?: string }> = {};
  const required: string[] = [];

  for (const flag of flags) {
    const propertyName = kebabToCamel(flag.longName);
    properties[propertyName] = flagToJsonSchemaProperty(flag);
  }

  if (positionalArgs.length > 0) {
    const hasVariadic = positionalArgs.some((positionalArg) => positionalArg.variadic);
    const positionalDescription = positionalArgs
      .map(
        (positionalArg) =>
          `${positionalArg.required ? "<" : "["}${positionalArg.name}${positionalArg.variadic ? "..." : ""}${positionalArg.required ? ">" : "]"}`,
      )
      .join(" ");

    properties._ = {
      type: hasVariadic ? "array" : "string",
      description: `Positional arguments: ${positionalDescription}`,
    };

    const hasRequiredPositional = positionalArgs.some((positionalArg) => positionalArg.required);
    if (hasRequiredPositional) {
      required.push("_");
    }
  }

  const schema: JsonSchemaObject = { type: "object", properties };
  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
};
