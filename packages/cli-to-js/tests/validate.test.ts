import { describe, it, expect } from "vite-plus/test";
import { validateOptions } from "../src/validate.js";
import { buildApi } from "../src/build-api.js";
import type { CliSchema, ParsedCommand, ParsedFlag } from "../src/parse-help-text.js";

const testFlag = (overrides: Partial<ParsedFlag> & { longName: string }): ParsedFlag => ({
  shortName: null,
  description: "",
  takesValue: false,
  valueName: null,
  defaultValue: null,
  isNegated: false,
  isRequired: false,
  choices: null,
  usesEquals: false,
  isGlobal: false,
  ...overrides,
});

const createTestCommand = (): ParsedCommand => ({
  name: "test-cli",
  description: "A test CLI",
  flags: [
    testFlag({
      longName: "output",
      shortName: "-o",
      description: "Output file",
      takesValue: true,
      valueName: "file",
    }),
    testFlag({ longName: "verbose", shortName: "-v", description: "Enable verbose mode" }),
    testFlag({
      longName: "message",
      shortName: "-m",
      description: "Commit message",
      takesValue: true,
      valueName: "text",
    }),
    testFlag({ longName: "dry-run", description: "Simulate the operation" }),
    testFlag({
      longName: "format",
      shortName: "-f",
      description: "Output format",
      takesValue: true,
      valueName: "fmt",
      choices: ["json", "csv", "table"],
    }),
    testFlag({
      longName: "token",
      description: "Auth token (required)",
      takesValue: true,
      valueName: "token",
      isRequired: true,
    }),
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
      token: "abc",
      format: "json",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("returns empty array for empty options with no required positionals", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      positionalArgs: [],
      flags: createTestCommand().flags.filter((flag) => !flag.isRequired),
    };
    const errors = validateOptions(command, {});
    expect(errors).toEqual([]);
  });

  it("detects unknown flags", () => {
    const errors = validateOptions(createTestCommand(), {
      unknownFlag: "value",
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown-flag");
    expect(errors[0].name).toBe("unknownFlag");
  });

  it('suggests closest flag with "did you mean?"', () => {
    const errors = validateOptions(createTestCommand(), {
      massage: "fix typo",
      token: "abc",
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
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].suggestion).toBeUndefined();
  });

  it("detects boolean passed to value-taking flag", () => {
    const errors = validateOptions(createTestCommand(), {
      output: true,
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("type-mismatch");
    expect(errors[0].message).toContain("expects a value but received a boolean");
  });

  it("detects string passed to boolean flag", () => {
    const errors = validateOptions(createTestCommand(), {
      verbose: "yes",
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("type-mismatch");
    expect(errors[0].message).toContain("boolean flag but received a string");
  });

  it("detects missing required positional arguments", () => {
    const errors = validateOptions(createTestCommand(), { token: "abc" });
    expect(
      errors.some((error) => error.kind === "missing-positional" && error.name === "source"),
    ).toBe(true);
    expect(
      errors.some((error) => error.kind === "missing-positional" && error.name === "destination"),
    ).toBe(true);
  });

  it("detects partially missing required positionals", () => {
    const errors = validateOptions(createTestCommand(), { token: "abc", _: ["src"] });
    const missingErrors = errors.filter((error) => error.kind === "missing-positional");
    expect(missingErrors).toHaveLength(1);
    expect(missingErrors[0].name).toBe("destination");
  });

  it("ignores keys starting with dash (raw flags)", () => {
    const errors = validateOptions(createTestCommand(), {
      "--custom": "value",
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("handles camelCase flag names from kebab-case schema", () => {
    const errors = validateOptions(createTestCommand(), {
      dryRun: true,
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("reports multiple errors at once", () => {
    const errors = validateOptions(createTestCommand(), {
      unknownFlag: "value",
      verbose: "wrong",
      token: "abc",
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const kinds = errors.map((error) => error.kind);
    expect(kinds).toContain("unknown-flag");
    expect(kinds).toContain("type-mismatch");
  });

  it("detects invalid choice value", () => {
    const errors = validateOptions(createTestCommand(), {
      format: "xml",
      token: "abc",
      _: ["src", "dst"],
    });
    const choiceErrors = errors.filter((error) => error.kind === "invalid-choice");
    expect(choiceErrors).toHaveLength(1);
    expect(choiceErrors[0].name).toBe("format");
    expect(choiceErrors[0].message).toContain("json, csv, table");
    expect(choiceErrors[0].choices).toEqual(["json", "csv", "table"]);
  });

  it("accepts valid choice value", () => {
    const errors = validateOptions(createTestCommand(), {
      format: "csv",
      token: "abc",
      _: ["src", "dst"],
    });
    const choiceErrors = errors.filter((error) => error.kind === "invalid-choice");
    expect(choiceErrors).toHaveLength(0);
  });

  it("detects missing required flag", () => {
    const errors = validateOptions(createTestCommand(), {
      _: ["src", "dst"],
    });
    const requiredErrors = errors.filter((error) => error.kind === "missing-required-flag");
    expect(requiredErrors).toHaveLength(1);
    expect(requiredErrors[0].name).toBe("token");
    expect(requiredErrors[0].message).toContain("--token");
  });

  it("passes when required flag is provided", () => {
    const errors = validateOptions(createTestCommand(), {
      token: "abc123",
      _: ["src", "dst"],
    });
    const requiredErrors = errors.filter((error) => error.kind === "missing-required-flag");
    expect(requiredErrors).toHaveLength(0);
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

  it("detects mutually exclusive flag conflict", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [
        testFlag({ longName: "json", description: "JSON output" }),
        testFlag({ longName: "csv", description: "CSV output" }),
      ],
      positionalArgs: [],
      mutuallyExclusiveFlags: [["json", "csv"]],
    };
    const errors = validateOptions(command, { json: true, csv: true });
    const exclusiveErrors = errors.filter((error) => error.kind === "exclusive-conflict");
    expect(exclusiveErrors).toHaveLength(1);
    expect(exclusiveErrors[0].message).toContain("mutually exclusive");
  });

  it("passes when only one flag from exclusive group is used", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [
        testFlag({ longName: "json", description: "JSON output" }),
        testFlag({ longName: "csv", description: "CSV output" }),
      ],
      positionalArgs: [],
      mutuallyExclusiveFlags: [["json", "csv"]],
    };
    const errors = validateOptions(command, { json: true });
    const exclusiveErrors = errors.filter((error) => error.kind === "exclusive-conflict");
    expect(exclusiveErrors).toHaveLength(0);
  });

  it("allows extra positionals when a variadic arg exists", () => {
    const errors = validateOptions(createTestCommand(), {
      _: ["src", "dst", "extra1", "extra2"],
    });
    const variadicErrors = errors.filter((error) => error.kind === "variadic-mismatch");
    expect(variadicErrors).toHaveLength(0);
  });

  it("validates with empty flags array and empty options", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [],
      positionalArgs: [],
    };
    const errors = validateOptions(command, {});
    expect(errors).toEqual([]);
  });

  it("validates with no positional args defined and none provided", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [],
      positionalArgs: [],
    };
    const errors = validateOptions(command, { _: [] });
    expect(errors).toEqual([]);
  });

  it("reports variadic-mismatch even with zero positional args defined", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [],
      positionalArgs: [],
    };
    const errors = validateOptions(command, { _: ["unexpected"] });
    const variadicErrors = errors.filter((error) => error.kind === "variadic-mismatch");
    expect(variadicErrors).toHaveLength(1);
    expect(variadicErrors[0].name).toBe("_");
  });

  it("validates choice with array values (each item checked)", () => {
    const errors = validateOptions(createTestCommand(), {
      format: ["json", "xml"],
      token: "abc",
      _: ["src", "dst"],
    });
    const choiceErrors = errors.filter((error) => error.kind === "invalid-choice");
    expect(choiceErrors).toHaveLength(1);
    expect(choiceErrors[0].message).toContain("xml");
  });

  it("validates choice with all-valid array values", () => {
    const errors = validateOptions(createTestCommand(), {
      format: ["json", "csv"],
      token: "abc",
      _: ["src", "dst"],
    });
    const choiceErrors = errors.filter((error) => error.kind === "invalid-choice");
    expect(choiceErrors).toHaveLength(0);
  });

  it("skips choice validation for boolean and number values", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [testFlag({ longName: "level", takesValue: true, choices: ["1", "2", "3"] })],
      positionalArgs: [],
    };
    const errors = validateOptions(command, { level: 2 });
    const choiceErrors = errors.filter((error) => error.kind === "invalid-choice");
    expect(choiceErrors).toHaveLength(0);
  });

  it("handles exclusive groups with kebab-case flag names", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [testFlag({ longName: "dry-run" }), testFlag({ longName: "wet-run" })],
      positionalArgs: [],
      mutuallyExclusiveFlags: [["dry-run", "wet-run"]],
    };
    const errors = validateOptions(command, { dryRun: true, wetRun: true });
    const exclusiveErrors = errors.filter((error) => error.kind === "exclusive-conflict");
    expect(exclusiveErrors).toHaveLength(1);
  });

  it("handles multiple exclusive groups independently", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [
        testFlag({ longName: "json" }),
        testFlag({ longName: "csv" }),
        testFlag({ longName: "gzip" }),
        testFlag({ longName: "bzip" }),
      ],
      positionalArgs: [],
      mutuallyExclusiveFlags: [
        ["json", "csv"],
        ["gzip", "bzip"],
      ],
    };
    const errors = validateOptions(command, { json: true, bzip: true });
    const exclusiveErrors = errors.filter((error) => error.kind === "exclusive-conflict");
    expect(exclusiveErrors).toHaveLength(0);
  });

  it("handles exclusive groups where no flags from the group are present", () => {
    const command: ParsedCommand = {
      ...createTestCommand(),
      flags: [testFlag({ longName: "json" }), testFlag({ longName: "csv" })],
      positionalArgs: [],
      mutuallyExclusiveFlags: [["json", "csv"]],
    };
    const errors = validateOptions(command, {});
    const exclusiveErrors = errors.filter((error) => error.kind === "exclusive-conflict");
    expect(exclusiveErrors).toHaveLength(0);
  });

  it("handles undefined flag values gracefully", () => {
    const errors = validateOptions(createTestCommand(), {
      verbose: undefined,
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("handles null flag values gracefully", () => {
    const errors = validateOptions(createTestCommand(), {
      verbose: null,
      token: "abc",
      _: ["src", "dst"],
    });
    expect(errors).toEqual([]);
  });

  it("validates without mutuallyExclusiveFlags on command (backwards compat)", () => {
    const command = {
      name: "test",
      description: "",
      flags: [],
      positionalArgs: [],
      subcommands: [],
    } as ParsedCommand;
    const errors = validateOptions(command, {});
    expect(errors).toEqual([]);
  });
});

const createSchemaWithSubcommands = (): CliSchema => ({
  binaryName: "echo",
  command: {
    name: "echo",
    description: "Print arguments",
    flags: [
      testFlag({
        longName: "newline",
        shortName: "-n",
        description: "Do not output trailing newline",
      }),
    ],
    positionalArgs: [],
    subcommands: [
      {
        name: "greet",
        aliases: ["hi"],
        description: "Say hello",
        flags: [
          testFlag({
            longName: "name",
            description: "Name to greet",
            takesValue: true,
            valueName: "name",
          }),
        ],
        positionalArgs: [],
      },
      { name: "unenriched", aliases: [], description: "Not enriched yet" },
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

  it("resolves subcommand aliases for validation", () => {
    const api = buildApi("echo", createSchemaWithSubcommands());
    const errors = api.$validate("hi", { name: "world" });
    expect(errors).toEqual([]);
  });
});
