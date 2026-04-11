import { describe, it, expect } from "vite-plus/test";
import { flagToJsonSchemaProperty } from "../src/utils/flag-to-json-schema.js";
import type { ParsedFlag } from "cli-to-js";

const createFlag = (overrides: Partial<ParsedFlag> = {}): ParsedFlag => ({
  longName: "output",
  shortName: "-o",
  description: "",
  takesValue: false,
  valueName: null,
  defaultValue: null,
  isNegated: false,
  ...overrides,
});

describe("flagToJsonSchemaProperty", () => {
  it("returns boolean type for non-value flags", () => {
    const result = flagToJsonSchemaProperty(createFlag({ takesValue: false }));
    expect(result.type).toBe("boolean");
  });

  it("returns string type for value-taking flags", () => {
    const result = flagToJsonSchemaProperty(createFlag({ takesValue: true }));
    expect(result.type).toBe("string");
  });

  it("includes description when present", () => {
    const result = flagToJsonSchemaProperty(createFlag({ description: "Output file path" }));
    expect(result.description).toBe("Output file path");
  });

  it("omits description when empty", () => {
    const result = flagToJsonSchemaProperty(createFlag({ description: "" }));
    expect(result.description).toBeUndefined();
  });

  it("includes default value when present", () => {
    const result = flagToJsonSchemaProperty(createFlag({ defaultValue: "stdout" }));
    expect(result.default).toBe("stdout");
  });

  it("omits default when null", () => {
    const result = flagToJsonSchemaProperty(createFlag({ defaultValue: null }));
    expect(result.default).toBeUndefined();
  });

  it("combines all properties for a fully specified flag", () => {
    const result = flagToJsonSchemaProperty(
      createFlag({
        takesValue: true,
        description: "Log level",
        defaultValue: "info",
      }),
    );
    expect(result).toEqual({
      type: "string",
      description: "Log level",
      default: "info",
    });
  });
});
