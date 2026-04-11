import { describe, it, expect } from "vite-plus/test";
import { parseHelpText } from "../src/parse-help-text.js";

const COMMANDER_HELP = `Usage: my-tool [options] [command]

A tool that does things.

Options:
  -v, --verbose              Enable verbose output
  -o, --output <file>        Output file path (default: "stdout")
  -t, --type <type>          Type to use
  --no-color                 Disable color output
  -h, --help                 Display help
  -V, --version              Display version

Commands:
  init [options] <name>      Initialize a new project
  build                      Build the project
  serve [options]            Start the dev server
  help [command]             Display help for command
`;

const GNU_HELP = `Usage: grep [OPTION]... PATTERNS [FILE]...
Search for PATTERNS in each FILE.

  -i, --ignore-case          ignore case distinctions in patterns and data
  -v, --invert-match         select non-matching lines
  -c, --count                print only a count of selected lines per FILE
  -l, --files-with-matches   print only names of FILEs with selected lines
  -n, --line-number          prefix each line of output with the 1-based line number
  -r, --recursive            like --directories=recurse
  -e, --regexp=PATTERNS      use PATTERNS for matching
      --include=GLOB         search only files that match GLOB
`;

const MINIMAL_HELP = `Usage: simple-tool <input> [output]

  -f, --force     Force overwrite
`;

const NO_SECTIONS_HELP = `Usage: bare-tool [options]

  -v, --verbose     Be verbose
  -q, --quiet       Be quiet
  -o, --output <file>  Output file
`;

const ARGPARSE_HELP = `usage: tool [-h] [-v] [-o OUTPUT] command

positional arguments:
  command               command to run

optional arguments:
  -o, --output <file>   output file
`;

const MULTILINE_DESCRIPTIONS = `Usage: wrapped-tool [options]

Options:
  -o, --output <file>        Output file path. If not specified,
                              defaults to stdout.
  -v, --verbose              Enable verbose output for
                              debugging purposes (default: "false")
  -f, --force                Force overwrite
`;

const ANSI_COLORED_HELP = `\x1B[1mUsage:\x1B[0m colored-tool [options]

\x1B[1mOptions:\x1B[0m
  \x1B[32m-v, --verbose\x1B[0m              Enable verbose output
  \x1B[32m-o, --output <file>\x1B[0m        Output file path
`;

const UPPERCASE_USAGE = `USAGE: loud-tool [options]

OPTIONS:
  -v, --verbose              Be verbose
`;

describe("parseHelpText", () => {
  describe("commander-style help", () => {
    it("extracts the binary name", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      expect(schema.binaryName).toBe("my-tool");
      expect(schema.command.name).toBe("my-tool");
    });

    it("extracts the description", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      expect(schema.command.description).toBe("A tool that does things.");
    });

    it("extracts flags with short and long names", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
      expect(verboseFlag!.shortName).toBe("-v");
      expect(verboseFlag!.takesValue).toBe(false);
    });

    it("extracts flags that take values", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag).toBeDefined();
      expect(outputFlag!.shortName).toBe("-o");
      expect(outputFlag!.takesValue).toBe(true);
      expect(outputFlag!.valueName).toBe("file");
    });

    it("extracts default values from descriptions", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag!.defaultValue).toBe("stdout");
    });

    it("detects negated flags", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const noColorFlag = schema.command.flags.find((flag) => flag.longName === "no-color");
      expect(noColorFlag).toBeDefined();
      expect(noColorFlag!.isNegated).toBe(true);
    });

    it("filters out --help and --version", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const helpFlag = schema.command.flags.find((flag) => flag.longName === "help");
      const versionFlag = schema.command.flags.find((flag) => flag.longName === "version");
      expect(helpFlag).toBeUndefined();
      expect(versionFlag).toBeUndefined();
    });

    it("extracts subcommands", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      expect(schema.command.subcommands).toHaveLength(3);
      expect(schema.command.subcommands.map((subcmd) => subcmd.name)).toEqual([
        "init",
        "build",
        "serve",
      ]);
    });

    it("extracts subcommand descriptions", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const initCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "init");
      expect(initCmd!.description).toBe("Initialize a new project");
    });

    it("filters out help subcommand", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const helpCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "help");
      expect(helpCmd).toBeUndefined();
    });
  });

  describe("GNU-style help", () => {
    it("extracts flags without explicit Options header", () => {
      const schema = parseHelpText("grep", GNU_HELP);
      expect(schema.command.flags.length).toBeGreaterThan(0);
    });

    it("extracts flags with = value syntax", () => {
      const schema = parseHelpText("grep", GNU_HELP);
      const regexpFlag = schema.command.flags.find((flag) => flag.longName === "regexp");
      expect(regexpFlag).toBeDefined();
      expect(regexpFlag!.takesValue).toBe(true);
      expect(regexpFlag!.valueName).toBe("PATTERNS");
    });

    it("handles flags without short names", () => {
      const schema = parseHelpText("grep", GNU_HELP);
      const includeFlag = schema.command.flags.find((flag) => flag.longName === "include");
      expect(includeFlag).toBeDefined();
      expect(includeFlag!.shortName).toBeNull();
    });
  });

  describe("minimal help text", () => {
    it("extracts positional args from usage line", () => {
      const schema = parseHelpText("simple-tool", MINIMAL_HELP);
      expect(schema.command.positionalArgs).toHaveLength(2);

      const inputArg = schema.command.positionalArgs.find((arg) => arg.name === "input");
      expect(inputArg!.required).toBe(true);

      const outputArg = schema.command.positionalArgs.find((arg) => arg.name === "output");
      expect(outputArg!.required).toBe(false);
    });
  });

  describe("help without section headers", () => {
    it("detects flags even without an Options header", () => {
      const schema = parseHelpText("bare-tool", NO_SECTIONS_HELP);
      expect(schema.command.flags.length).toBeGreaterThanOrEqual(2);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
    });
  });

  describe("argparse-style help", () => {
    it("classifies optional arguments as options", () => {
      const schema = parseHelpText("tool", ARGPARSE_HELP);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag).toBeDefined();
      expect(outputFlag!.takesValue).toBe(true);
    });
  });

  describe("multi-line descriptions", () => {
    it("appends continuation lines to the previous flag description", () => {
      const schema = parseHelpText("wrapped-tool", MULTILINE_DESCRIPTIONS);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag).toBeDefined();
      expect(outputFlag!.description).toContain("defaults to stdout");
    });

    it("re-parses default values from extended descriptions", () => {
      const schema = parseHelpText("wrapped-tool", MULTILINE_DESCRIPTIONS);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag!.defaultValue).toBe("false");
    });

    it("does not merge single-line flags into previous description", () => {
      const schema = parseHelpText("wrapped-tool", MULTILINE_DESCRIPTIONS);
      const forceFlag = schema.command.flags.find((flag) => flag.longName === "force");
      expect(forceFlag).toBeDefined();
      expect(forceFlag!.description).toBe("Force overwrite");
    });
  });

  describe("ANSI escape codes", () => {
    it("strips ANSI codes before parsing", () => {
      const schema = parseHelpText("colored-tool", ANSI_COLORED_HELP);
      expect(schema.command.flags.length).toBeGreaterThan(0);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
      expect(verboseFlag!.description).not.toContain("\x1B");
    });

    it("extracts flags from colored help text", () => {
      const schema = parseHelpText("colored-tool", ANSI_COLORED_HELP);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag).toBeDefined();
      expect(outputFlag!.takesValue).toBe(true);
    });
  });

  describe("case-insensitive usage", () => {
    it("handles uppercase USAGE and OPTIONS headers", () => {
      const schema = parseHelpText("loud-tool", UPPERCASE_USAGE);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
    });
  });

  describe("choices parsing", () => {
    it("extracts choices from curly braces in flag part", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --format {json,csv,table}  Output format\n`;
      const schema = parseHelpText("tool", helpText);
      const formatFlag = schema.command.flags.find((flag) => flag.longName === "format");
      expect(formatFlag).toBeDefined();
      expect(formatFlag!.choices).toEqual(["json", "csv", "table"]);
    });

    it("extracts choices from description with (choices: ...)", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --level <val>  Log level (choices: debug, info, warn, error)\n`;
      const schema = parseHelpText("tool", helpText);
      const levelFlag = schema.command.flags.find((flag) => flag.longName === "level");
      expect(levelFlag!.choices).toEqual(["debug", "info", "warn", "error"]);
    });

    it("extracts choices from [possible values: ...]", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --color <when>  Colorize output [possible values: auto, always, never]\n`;
      const schema = parseHelpText("tool", helpText);
      const colorFlag = schema.command.flags.find((flag) => flag.longName === "color");
      expect(colorFlag!.choices).toEqual(["auto", "always", "never"]);
    });

    it("returns null choices when none are present", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag!.choices).toBeNull();
    });
  });

  describe("required flag detection", () => {
    it("detects (required) in description", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --token <key>  API token (required)\n`;
      const schema = parseHelpText("tool", helpText);
      const tokenFlag = schema.command.flags.find((flag) => flag.longName === "token");
      expect(tokenFlag!.isRequired).toBe(true);
    });

    it("marks non-required flags as false", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag!.isRequired).toBe(false);
    });
  });

  describe("equals separator detection", () => {
    it("detects --flag=VALUE syntax", () => {
      const schema = parseHelpText("grep", GNU_HELP);
      const regexpFlag = schema.command.flags.find((flag) => flag.longName === "regexp");
      expect(regexpFlag!.usesEquals).toBe(true);
    });

    it("does not mark space-separated flags", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      const outputFlag = schema.command.flags.find((flag) => flag.longName === "output");
      expect(outputFlag!.usesEquals).toBe(false);
    });
  });

  describe("global options", () => {
    it("marks flags under Global Options section as isGlobal", () => {
      const helpText = `Usage: tool [command]\n\nCommands:\n  deploy  Deploy the app\n\nGlobal Options:\n  --verbose  Enable verbose logging\n  --region <name>  AWS region\n`;
      const schema = parseHelpText("tool", helpText);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      const regionFlag = schema.command.flags.find((flag) => flag.longName === "region");
      expect(verboseFlag!.isGlobal).toBe(true);
      expect(regionFlag!.isGlobal).toBe(true);
    });

    it("marks flags under regular Options section as not global", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      for (const flag of schema.command.flags) {
        expect(flag.isGlobal).toBe(false);
      }
    });
  });

  describe("subcommand aliases", () => {
    it("preserves aliases on subcommands", () => {
      const helpText = `Usage: grab [command]\n\nCommands:\n  init|setup     Initialize\n  add|install    Add a package\n`;
      const schema = parseHelpText("grab", helpText);
      const initCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "init");
      expect(initCmd!.aliases).toEqual(["setup"]);
      const addCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "add");
      expect(addCmd!.aliases).toEqual(["install"]);
    });

    it("sets empty aliases for non-aliased subcommands", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      for (const subcmd of schema.command.subcommands) {
        expect(subcmd.aliases).toEqual([]);
      }
    });
  });

  describe("kubectl-style command sections", () => {
    it("parses commands from multi-section headers", () => {
      const helpText = `Usage: kubectl [command]

Basic Commands (Beginner):
  create        Create a resource
  expose        Expose a resource as a service

Basic Commands (Intermediate):
  get           Display resources
  delete        Delete resources

Deploy Commands:
  rollout       Manage rollouts
  scale         Set a new size for a deployment

Cluster Management Commands:
  certificate   Modify certificate resources

Options:
  --kubeconfig string  Path to kubeconfig
`;
      const schema = parseHelpText("kubectl", helpText);
      const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
      expect(subcommandNames).toContain("create");
      expect(subcommandNames).toContain("expose");
      expect(subcommandNames).toContain("get");
      expect(subcommandNames).toContain("delete");
      expect(subcommandNames).toContain("rollout");
      expect(subcommandNames).toContain("scale");
      expect(subcommandNames).toContain("certificate");
      expect(schema.command.flags.length).toBeGreaterThan(0);
    });
  });

  describe("exclusive groups from usage line", () => {
    it("parses [-a | -b] from usage line", () => {
      const helpText = `Usage: tool [-a | -b] [options]\n\nOptions:\n  -a, --alpha  Alpha mode\n  -b, --beta  Beta mode\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.mutuallyExclusiveFlags).toHaveLength(1);
      expect(schema.command.mutuallyExclusiveFlags[0]).toEqual(["a", "b"]);
    });

    it("parses (--json | --csv) from usage line", () => {
      const helpText = `Usage: tool (--json | --csv | --table) [options]\n\nOptions:\n  --json  JSON output\n  --csv   CSV output\n  --table Table output\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.mutuallyExclusiveFlags).toHaveLength(1);
      expect(schema.command.mutuallyExclusiveFlags[0]).toEqual(["json", "csv", "table"]);
    });

    it("returns empty array when no exclusive groups", () => {
      const schema = parseHelpText("my-tool", COMMANDER_HELP);
      expect(schema.command.mutuallyExclusiveFlags).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles empty help text", () => {
      const schema = parseHelpText("empty", "");
      expect(schema.command.flags).toEqual([]);
      expect(schema.command.subcommands).toEqual([]);
      expect(schema.command.positionalArgs).toEqual([]);
    });

    it("handles help text with only a usage line", () => {
      const schema = parseHelpText("minimal", "Usage: minimal [options]");
      expect(schema.command.flags).toEqual([]);
      expect(schema.command.subcommands).toEqual([]);
    });

    it("handles Windows-style line endings", () => {
      const windowsHelp =
        "Usage: win-tool [options]\r\n\r\nOptions:\r\n  -v, --verbose  Be verbose\r\n";
      const schema = parseHelpText("win-tool", windowsHelp);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
    });

    it("handles flags with only short names (no long equivalent)", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  -v  Be verbose\n  -q  Be quiet\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.flags).toHaveLength(2);
      expect(schema.command.flags[0].longName).toBe("v");
      expect(schema.command.flags[0].shortName).toBe("-v");
    });

    it("handles pipe-separated choices in flag part", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --format {json|csv|table}  Output format\n`;
      const schema = parseHelpText("tool", helpText);
      const formatFlag = schema.command.flags.find((flag) => flag.longName === "format");
      expect(formatFlag!.choices).toEqual(["json", "csv", "table"]);
    });

    it("handles descriptions with unicode characters", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --lang <code>  Language code (e.g. "日本語")\n`;
      const schema = parseHelpText("tool", helpText);
      const langFlag = schema.command.flags.find((flag) => flag.longName === "lang");
      expect(langFlag).toBeDefined();
      expect(langFlag!.takesValue).toBe(true);
    });

    it("does not crash on malformed flag lines", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  ---broken  Bad flag\n  -- also bad\n  -  empty\n  -v, --verbose  Real flag\n`;
      const schema = parseHelpText("tool", helpText);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
    });

    it("handles empty choices in curly braces", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --format {}  Output format\n`;
      const schema = parseHelpText("tool", helpText);
      const formatFlag = schema.command.flags.find((flag) => flag.longName === "format");
      expect(formatFlag!.choices).toBeNull();
    });

    it("handles help text that is only whitespace", () => {
      const schema = parseHelpText("empty", "   \n  \n  ");
      expect(schema.command.flags).toEqual([]);
      expect(schema.command.subcommands).toEqual([]);
    });

    it("does not treat indented text before first section as flags", () => {
      const helpText = `Usage: tool [options]\n\nA longer description that\nspans multiple lines.\n\nOptions:\n  -v, --verbose  Be verbose\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.flags).toHaveLength(1);
      expect(schema.command.description).toContain("spans multiple lines");
    });

    it("handles novel command section headers via trailing 'commands' word", () => {
      const helpText = `Usage: tool [command]\n\nPrimary Commands:\n  init  Initialize\n\nResource Commands:\n  get   Get resource\n`;
      const schema = parseHelpText("tool", helpText);
      const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
      expect(subcommandNames).toContain("init");
      expect(subcommandNames).toContain("get");
    });

    it("handles help text with no trailing newline", () => {
      const schema = parseHelpText(
        "tool",
        "Usage: tool [options]\n\nOptions:\n  -v, --verbose  Verbose",
      );
      expect(schema.command.flags).toHaveLength(1);
    });

    it("handles flags with digits in long name", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --ipv6  Use IPv6\n  --h2  Use HTTP/2\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.flags.find((flag) => flag.longName === "ipv6")).toBeDefined();
      expect(schema.command.flags.find((flag) => flag.longName === "h2")).toBeDefined();
    });

    it("handles tabs as column separators", () => {
      const helpText = "Usage: tool [options]\n\nOptions:\n  -v, --verbose\tBe verbose\n";
      const schema = parseHelpText("tool", helpText);
      const verboseFlag = schema.command.flags.find((flag) => flag.longName === "verbose");
      expect(verboseFlag).toBeDefined();
    });

    it("handles description with parentheses that are not defaults or choices", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --mode <val>  Operation mode (see docs for details)\n`;
      const schema = parseHelpText("tool", helpText);
      const modeFlag = schema.command.flags.find((flag) => flag.longName === "mode");
      expect(modeFlag!.defaultValue).toBeNull();
      expect(modeFlag!.choices).toBeNull();
      expect(modeFlag!.isRequired).toBe(false);
    });

    it("handles empty command section (header with no entries)", () => {
      const helpText = `Usage: tool [command]\n\nCommands:\n\nOptions:\n  -v, --verbose  Verbose\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.subcommands).toHaveLength(0);
      expect(schema.command.flags).toHaveLength(1);
    });

    it("handles options section appearing after commands section", () => {
      const helpText = `Usage: tool [command]\n\nCommands:\n  init  Initialize\n  build  Build\n\nOptions:\n  -v, --verbose  Verbose\n  -q, --quiet    Quiet\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.subcommands).toHaveLength(2);
      expect(schema.command.flags).toHaveLength(2);
    });

    it("handles flag descriptions wrapping three or more lines", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --long-flag <val>        First line of description\n                           second line continues here\n                           third line with (default: "x")\n  --other  Other flag\n`;
      const schema = parseHelpText("tool", helpText);
      const longFlag = schema.command.flags.find((flag) => flag.longName === "long-flag");
      expect(longFlag!.description).toContain("third line");
      expect(longFlag!.defaultValue).toBe("x");
      const otherFlag = schema.command.flags.find((flag) => flag.longName === "other");
      expect(otherFlag).toBeDefined();
    });

    it("handles subcommands with multi-word descriptions containing colons", () => {
      const helpText = `Usage: tool [command]\n\nCommands:\n  deploy  Deploy app: production mode\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.subcommands[0].description).toBe("Deploy app: production mode");
    });

    it("handles help text starting with flags and no usage line", () => {
      const helpText = `Options:\n  -v, --verbose  Verbose\n  -q, --quiet    Quiet\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.flags).toHaveLength(2);
    });

    it("stops parsing flags from unknown section once a known section starts", () => {
      const helpText = `Usage: tool [command]\n\nExamples:\n  -v flag is for verbose\n\nCommands:\n  init  Initialize\n\nOptions:\n  -q, --quiet  Quiet mode\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.subcommands).toHaveLength(1);
      const quietFlag = schema.command.flags.find((flag) => flag.longName === "quiet");
      expect(quietFlag).toBeDefined();
    });

    it("parses multiple exclusive groups from one usage line", () => {
      const helpText = `Usage: tool [-a | -b] (--json | --csv) [options]\n\nOptions:\n  -a  Alpha\n  -b  Beta\n  --json  JSON\n  --csv  CSV\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.mutuallyExclusiveFlags).toHaveLength(2);
    });

    it("does not treat [optional-arg] as exclusive group", () => {
      const helpText = `Usage: tool [file] [options]\n\nOptions:\n  -v, --verbose  Verbose\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.mutuallyExclusiveFlags).toHaveLength(0);
    });

    it("handles choices on continuation line", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --format <fmt>  Output format\n                  (choices: json, csv, yaml)\n`;
      const schema = parseHelpText("tool", helpText);
      const formatFlag = schema.command.flags.find((flag) => flag.longName === "format");
      expect(formatFlag!.choices).toEqual(["json", "csv", "yaml"]);
    });

    it("handles required detected on continuation line", () => {
      const helpText = `Usage: tool [options]\n\nOptions:\n  --token <val>  API token\n                 (required)\n`;
      const schema = parseHelpText("tool", helpText);
      const tokenFlag = schema.command.flags.find((flag) => flag.longName === "token");
      expect(tokenFlag!.isRequired).toBe(true);
    });

    it("handles Global Flags header (not just Global Options)", () => {
      const helpText = `Usage: tool [command]\n\nGlobal Flags:\n  --verbose  Verbose\n`;
      const schema = parseHelpText("tool", helpText);
      expect(schema.command.flags[0].isGlobal).toBe(true);
    });
  });
});
