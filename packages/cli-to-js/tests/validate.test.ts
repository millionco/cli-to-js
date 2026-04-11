import { describe, it, expect } from "vite-plus/test";
import { validateOptions } from "../src/validate.js";
import { buildApi } from "../src/build-api.js";
import type { CliSchema, ParsedCommand } from "../src/parse-help-text.js";

const createTestCommand = (): ParsedCommand => ({
  name: "test-cli",
  description: "A test CLI",
  flags: [
    {
      longName: "output",
      shortName: "-o",
      description: "Output file",
      takesValue: true,
      valueName: "file",
      defaultValue: null,
      isNegated: false,
    },
    {
      longName: "verbose",
      shortName: "-v",
      description: "Enable verbose mode",
      takesValue: false,
      valueName: null,
      defaultValue: null,
      isNegated: false,
    },
    {
      longName: "message",
      shortName: "-m",
      description: "Commit message",
      takesValue: true,
      valueName: "text",
      defaultValue: null,
      isNegated: false,
    },
    {
      longName: "dry-run",
      shortName: null,
      description: "Simulate the operation",
      takesValue: false,
      valueName: null,
      defaultValue: null,
      isNegated: false,
    },
  ],
  positionalArgs: [
    { name: "source", required: true, variadic: false },
    { name: "destination", required: true, variadic: false },
    { name: "extras", required: false, variadic: true },
  ],
  subcommands: [],
});

describe("validateOptions", () => {
  it("returns empty array for valid options", () => {
    const errors = validateOptions(createTestCommand(), {
      output: "out.txt",
      verbose: true,
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("returns empty array for empty options with no required positionals", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      positionalArgs: [],
    };
    const errors = validateOptions(command, {});
    expect(errors).toEqual([]);
  });

  it("detects unknown flags", () => {
    const errors = validateOptions(createTestCommand(), {
      unknownFlag: "value",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown-flag");
    expect(errors[0].name).toBe("unknownFlag");
  });

  it('suggests closest flag with "did you mean?"', () => {
    const errors = validateOptions(createTestCommand(), {
      massage: "fix typo",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown-flag");
    expect(errors[0].suggestion).toBe("message");
    expect(errors[0].message).toContain('Did you mean "message"');
  });

  it("does not suggest when distance is too large", () => {
    const errors = validateOptions(createTestCommand(), {
      completelyWrongName: "value",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].suggestion).toBeUndefined();
  });

  it("detects boolean passed to value-taking flag", () => {
    const errors = validateOptions(createTestCommand(), {
      output: true,
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("type-mismatch");
    expect(errors[0].message).toContain("expects a value but received a boolean");
  });

  it("detects string passed to boolean flag", () => {
    const errors = validateOptions(createTestCommand(), {
      verbose: "yes",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("type-mismatch");
    expect(errors[0].message).toContain("boolean flag but received a string");
  });

  it("detects missing required positional arguments", () => {
    const errors = validateOptions(createTestCommand(), {});
    expect(
      errors.some((error) => error.kind === "missing-positional" && error.name === "source"),
    ).toBe(true);
    expect(
      errors.some((error) => error.kind === "missing-positional" && error.name === "destination"),
    ).toBe(true);
  });

  it("detects partially missing required positionals", () => {
    const errors = validateOptions(createTestCommand(), { _: ["src"] });
    const missingErrors = errors.filter((error) => error.kind === "missing-positional");
    expect(missingErrors).toHaveLength(1);
    expect(missingErrors[0].name).toBe("destination");
  });

  it("ignores keys starting with dash (raw flags)", () => {
    const errors = validateOptions(createTestCommand(), {
      "--custom": "value",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("handles camelCase flag names from kebab-case schema", () => {
    const errors = validateOptions(createTestCommand(), {
      dryRun: true,
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("reports multiple errors at once", () => {
    const errors = validateOptions(createTestCommand(), {
      unknownFlag: "value",
      verbose: "wrong",
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const kinds = errors.map((error) => error.kind);
    expect(kinds).toContain("unknown-flag");
    expect(kinds).toContain("type-mismatch");
  });

  it("detects too many positionals when none are variadic", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      positionalArgs: [{ name: "file", required: true, variadic: false }],
    };
    const errors = validateOptions(command, { _: ["a.txt", "b.txt", "c.txt"] });
    const variadicErrors = errors.filter((error) => error.kind === "variadic-mismatch");
    expect(variadicErrors).toHaveLength(1);
    expect(variadicErrors[0].message).toContain("at most 1");
    expect(variadicErrors[0].message).toContain("received 3");
  });

  it("allows extra positionals when a variadic arg exists", () => {
    const errors = validateOptions(createTestCommand(), {
      _: ["src", "dst", "extra1", "extra2"],
    });
    const variadicErrors = errors.filter((error) => error.kind === "variadic-mismatch");
    expect(variadicErrors).toHaveLength(0);
  });
});

const createSchemaWithSubcommands = (): CliSchema => ({
  binaryName: "echo",
  command: {
    name: "echo",
    description: "Print arguments",
    flags: [
      {
        longName: "newline",
        shortName: "-n",
        description: "Do not output trailing newline",
        takesValue: false,
        valueName: null,
        defaultValue: null,
        isNegated: false,
      },
    ],
    positionalArgs: [],
    subcommands: [
      {
        name: "greet",
        description: "Say hello",
        flags: [
          {
            longName: "name",
            shortName: null,
            description: "Name to greet",
            takesValue: true,
            valueName: "name",
            defaultValue: null,
            isNegated: false,
          },
        ],
        positionalArgs: [],
      },
      { name: "unenriched", description: "Not enriched yet" },
    ],
  },
});

describe("$validate integration via buildApi", () => {
  it("validates root command options", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    const errors = api.$validate({ newline: true });
    expect(errors).toEqual([]);
  });

  it("detects unknown flags on root command", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    const errors = api.$validate({ bogus: "value" });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown-flag");
  });

  it("validates enriched subcommand options", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    const errors = api.$validate("greet", { name: "world" });
    expect(errors).toEqual([]);
  });

  it("detects unknown flags on enriched subcommand", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    const errors = api.$validate("greet", { nme: "world" });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown-flag");
    expect(errors[0].suggestion).toBe("name");
  });

  it("throws for unknown subcommand name", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    expect(() => api.$validate("nonexistent", {})).toThrow("Unknown subcommand");
  });

  it("throws for subcommand that has not been enriched with flags", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    expect(() => api.$validate("unenriched", {})).toThrow("has not been enriched");
  });
});
