import { describe, it, expect } from "vite-plus/test";
import { buildInputSchema } from "../src/utils/build-input-schema.js";
import type { ParsedFlag, ParsedPositionalArg } from "cli-to-js";

const createFlag = (overrides: Partial<ParsedFlag> = {}): ParsedFlag => ({
  longName: "output",
  shortName: "-o",
  description: "",
  takesValue: true,
  valueName: "file",
  defaultValue: null,
  isNegated: false,
  ...overrides,
});

describe("buildInputSchema", () => {
  it("returns an empty object schema for no flags or positionals", () => {
    const schema = buildInputSchema([], []);
    expect(schema).toEqual({ type: "object", properties: {} });
  });

  it("converts flags to properties with camelCase keys", () => {
    const flags: ParsedFlag[] = [
      createFlag({ longName: "dry-run", takesValue: false, description: "Simulate" }),
      createFlag({ longName: "output", takesValue: true, description: "Output file" }),
    ];
    const schema = buildInputSchema(flags, []);
    expect(schema.properties.dryRun).toEqual({ type: "boolean", description: "Simulate" });
    expect(schema.properties.output).toEqual({ type: "string", description: "Output file" });
  });

  it("adds positional arg property with string type when not variadic", () => {
    const positionals: ParsedPositionalArg[] = [{ name: "file", required: true, variadic: false }];
    const schema = buildInputSchema([], positionals);
    expect(schema.properties._).toBeDefined();
    expect(schema.properties._.type).toBe("string");
    expect(schema.properties._.description).toContain("<file>");
  });

  it("adds positional arg property with array type when variadic", () => {
    const positionals: ParsedPositionalArg[] = [{ name: "files", required: false, variadic: true }];
    const schema = buildInputSchema([], positionals);
    expect(schema.properties._.type).toBe("array");
    expect(schema.properties._.description).toContain("files...");
  });

  it("marks _ as required when any positional is required", () => {
    const positionals: ParsedPositionalArg[] = [
      { name: "source", required: true, variadic: false },
      { name: "extras", required: false, variadic: true },
    ];
    const schema = buildInputSchema([], positionals);
    expect(schema.required).toContain("_");
  });

  it("omits required when all positionals are optional", () => {
    const positionals: ParsedPositionalArg[] = [
      { name: "target", required: false, variadic: false },
    ];
    const schema = buildInputSchema([], positionals);
    expect(schema.required).toBeUndefined();
  });

  it("combines flags and positionals in one schema", () => {
    const flags: ParsedFlag[] = [createFlag({ longName: "verbose", takesValue: false })];
    const positionals: ParsedPositionalArg[] = [{ name: "path", required: true, variadic: false }];
    const schema = buildInputSchema(flags, positionals);
    expect(Object.keys(schema.properties)).toContain("verbose");
    expect(Object.keys(schema.properties)).toContain("_");
    expect(schema.required).toEqual(["_"]);
  });

  it("builds description showing multiple positional args", () => {
    const positionals: ParsedPositionalArg[] = [
      { name: "source", required: true, variadic: false },
      { name: "destination", required: true, variadic: false },
    ];
    const schema = buildInputSchema([], positionals);
    expect(schema.properties._.description).toBe("Positional arguments: <source> <destination>");
  });
});
