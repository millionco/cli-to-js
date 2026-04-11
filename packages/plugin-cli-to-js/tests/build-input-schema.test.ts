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
    expect(buildInputSchema([], [])).toEqual({ type: "object", properties: {} });
  });

  it("converts kebab-case flag names to camelCase property keys", () => {
    const schema = buildInputSchema(
      [createFlag({ longName: "dry-run", takesValue: false, description: "Simulate" })],
      [],
    );
    expect(schema.properties.dryRun).toEqual({ type: "boolean", description: "Simulate" });
    expect(schema.properties["dry-run"]).toBeUndefined();
  });

  it("maps boolean flags to boolean type and value flags to string type", () => {
    const schema = buildInputSchema(
      [
        createFlag({ longName: "verbose", takesValue: false }),
        createFlag({ longName: "output", takesValue: true }),
      ],
      [],
    );
    expect(schema.properties.verbose.type).toBe("boolean");
    expect(schema.properties.output.type).toBe("string");
  });

  it("includes flag description and default when present", () => {
    const schema = buildInputSchema(
      [
        createFlag({
          longName: "level",
          takesValue: true,
          description: "Log level",
          defaultValue: "info",
        }),
      ],
      [],
    );
    expect(schema.properties.level).toEqual({
      type: "string",
      description: "Log level",
      default: "info",
    });
  });

  it("omits description and default when absent", () => {
    const schema = buildInputSchema(
      [createFlag({ longName: "force", takesValue: false, description: "", defaultValue: null })],
      [],
    );
    expect(schema.properties.force).toEqual({ type: "boolean" });
  });

  it("adds _ property with string type for non-variadic positionals", () => {
    const positionals: ParsedPositionalArg[] = [{ name: "file", required: true, variadic: false }];
    const schema = buildInputSchema([], positionals);
    expect(schema.properties._.type).toBe("string");
    expect(schema.properties._.description).toBe("Positional arguments: <file>");
  });

  it("adds _ property with array type when any positional is variadic", () => {
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
    expect(buildInputSchema([], positionals).required).toEqual(["_"]);
  });

  it("omits required when all positionals are optional", () => {
    const positionals: ParsedPositionalArg[] = [
      { name: "target", required: false, variadic: false },
    ];
    expect(buildInputSchema([], positionals).required).toBeUndefined();
  });

  it("builds description showing mixed required/optional positional signatures", () => {
    const positionals: ParsedPositionalArg[] = [
      { name: "source", required: true, variadic: false },
      { name: "destination", required: false, variadic: false },
    ];
    expect(buildInputSchema([], positionals).properties._.description).toBe(
      "Positional arguments: <source> [destination]",
    );
  });

  it("combines flags and positionals into one schema", () => {
    const schema = buildInputSchema(
      [createFlag({ longName: "verbose", takesValue: false })],
      [{ name: "path", required: true, variadic: false }],
    );
    expect(Object.keys(schema.properties).sort()).toEqual(["_", "verbose"]);
    expect(schema.required).toEqual(["_"]);
  });
});
