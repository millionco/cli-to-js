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
  });
});
