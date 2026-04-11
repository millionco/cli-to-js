import type { ParsedFlag } from "cli-to-js";

export const flagToJsonSchemaProperty = (
  flag: ParsedFlag,
): { type: string; description?: string; default?: string } => {
  const property: { type: string; description?: string; default?: string } = {
    type: flag.takesValue ? "string" : "boolean",
  };

  if (flag.description) {
    property.description = flag.description;
  }

  if (flag.defaultValue) {
    property.default = flag.defaultValue;
  }

  return property;
};
