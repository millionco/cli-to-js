import { describe, it, expect, beforeAll } from "vite-plus/test";
import { fromHelpText } from "../src/index.js";
import { parseHelpText } from "../src/parse-help-text.js";
import { generate } from "../src/generate.js";

const REACT_GRAB_HELP = `Usage: grab [options] [command]

add React Grab to your project

Options:
  -v, --version                  display the version number
  -h, --help                     display help for command

Commands:
  init|setup [options]           initialize React Grab in your project
  add|install [options] [agent]  connect React Grab to your agent via MCP
  remove [options] [agent]       disconnect React Grab from your agent
  configure|config [options]     configure React Grab options
  upgrade|update [options]       upgrade react-grab to the latest version
  help [command]                 display help for command
`;

const REACT_GRAB_INIT_HELP = `Usage: grab init|setup [options]

initialize React Grab in your project

Options:
  -y, --yes        skip confirmation prompts (default: false)
  -f, --force      force overwrite existing config (default: false)
  -k, --key <key>  activation key (e.g., Meta+K, Ctrl+Shift+G, Space)
  --skip-install   skip package installation (default: false)
  --pkg <pkg>      custom package URL for CLI (e.g., grab)
  -c, --cwd <cwd>  working directory (defaults to current directory)
  -h, --help       display help for command
`;

const REACT_DOCTOR_HELP = `Usage: react-doctor [options] [directory]

Diagnose React codebase health

Arguments:
  directory          project directory to scan (default: ".")

Options:
  -v, --version      display the version number
  --lint             enable linting
  --no-lint          skip linting
  --dead-code        enable dead code detection
  --no-dead-code     skip dead code detection
  --verbose          show file details per rule
  --score            output only the score
  -y, --yes          skip prompts, scan all workspace projects
  -n, --no           skip prompts, always run a full scan (decline diff-only)
  --project <name>   select workspace project (comma-separated for multiple)
  --diff [base]      scan only files changed vs base branch
  --offline          skip telemetry (anonymous, not stored, only used to
                     calculate score)
  --staged           scan only staged (git index) files for pre-commit hooks
  --fail-on <level>  exit with error code on diagnostics: error, warning, none
                     (default: "none")
  --annotations      output diagnostics as GitHub Actions annotations
  -h, --help         display help for command
`;

describe("react-grab", () => {
  describe("help text parsing", () => {
    it("extracts the description", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      expect(schema.command.description).toBe("add React Grab to your project");
    });

    it("extracts subcommands including those with aliases", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
      expect(subcommandNames).toContain("init");
      expect(subcommandNames).toContain("add");
      expect(subcommandNames).toContain("remove");
      expect(subcommandNames).toContain("configure");
      expect(subcommandNames).toContain("upgrade");
    });

    it("uses primary name for aliased commands (not the alias)", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
      expect(subcommandNames).not.toContain("setup");
      expect(subcommandNames).not.toContain("install");
      expect(subcommandNames).not.toContain("config");
      expect(subcommandNames).not.toContain("update");
    });

    it("preserves aliases on subcommands", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const initCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "init");
      expect(initCmd!.aliases).toEqual(["setup"]);
      const addCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "add");
      expect(addCmd!.aliases).toEqual(["install"]);
      const removeCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "remove");
      expect(removeCmd!.aliases).toEqual([]);
    });

    it("filters out help subcommand", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
      expect(subcommandNames).not.toContain("help");
    });

    it("extracts subcommand descriptions", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const initCmd = schema.command.subcommands.find((subcmd) => subcmd.name === "init");
      expect(initCmd!.description).toBe("initialize React Grab in your project");
    });

    it("filters out --version and --help flags", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const flagNames = schema.command.flags.map((flag) => flag.longName);
      expect(flagNames).not.toContain("version");
      expect(flagNames).not.toContain("help");
    });
  });

  describe("subcommand help text parsing", () => {
    it("parses init subcommand flags from help text", () => {
      const schema = parseHelpText("init", REACT_GRAB_INIT_HELP);

      const keyFlag = schema.command.flags.find((flag) => flag.longName === "key");
      expect(keyFlag).toBeDefined();
      expect(keyFlag!.shortName).toBe("-k");
      expect(keyFlag!.takesValue).toBe(true);
      expect(keyFlag!.valueName).toBe("key");

      const forceFlag = schema.command.flags.find((flag) => flag.longName === "force");
      expect(forceFlag).toBeDefined();
      expect(forceFlag!.shortName).toBe("-f");
      expect(forceFlag!.takesValue).toBe(false);
      expect(forceFlag!.defaultValue).toBe("false");

      const skipInstallFlag = schema.command.flags.find((flag) => flag.longName === "skip-install");
      expect(skipInstallFlag).toBeDefined();
      expect(skipInstallFlag!.defaultValue).toBe("false");
    });
  });

  describe("code generation", () => {
    it("generates valid TypeScript with subcommand exports", () => {
      const schema = parseHelpText("grab", REACT_GRAB_HELP);
      const code = generate(schema);

      expect(code).toContain('const BINARY = "grab"');
      expect(code).toContain("export const init");
      expect(code).toContain("export const add");
      expect(code).toContain("export const remove");
      expect(code).toContain("export const configure");
      expect(code).toContain("export const upgrade");
      expect(code).toContain("export const grab");
      expect(code).toContain("export default grab");
    });
  });

  describe("runtime API", () => {
    it("creates a typed API from help text", () => {
      const api = fromHelpText("grab", REACT_GRAB_HELP);

      expect(api.$schema.binaryName).toBe("grab");
      expect(api.$schema.command.subcommands.length).toBe(5);
    });
  });
});

describe("react-doctor", () => {
  describe("help text parsing", () => {
    it("extracts the description", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      expect(schema.command.description).toBe("Diagnose React codebase health");
    });

    it("extracts positional args from usage line", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const directoryArg = schema.command.positionalArgs.find((arg) => arg.name === "directory");
      expect(directoryArg).toBeDefined();
      expect(directoryArg!.required).toBe(false);
    });

    it("extracts all flags", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const flagNames = schema.command.flags.map((flag) => flag.longName);
      expect(flagNames).toContain("lint");
      expect(flagNames).toContain("dead-code");
      expect(flagNames).toContain("verbose");
      expect(flagNames).toContain("score");
      expect(flagNames).toContain("yes");
      expect(flagNames).toContain("no");
      expect(flagNames).toContain("project");
      expect(flagNames).toContain("diff");
      expect(flagNames).toContain("offline");
      expect(flagNames).toContain("staged");
      expect(flagNames).toContain("fail-on");
      expect(flagNames).toContain("annotations");
    });

    it("detects negated flags", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const noLint = schema.command.flags.find((flag) => flag.longName === "no-lint");
      expect(noLint).toBeDefined();
      expect(noLint!.isNegated).toBe(true);

      const noDeadCode = schema.command.flags.find((flag) => flag.longName === "no-dead-code");
      expect(noDeadCode).toBeDefined();
      expect(noDeadCode!.isNegated).toBe(true);
    });

    it("extracts flags with values", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);

      const projectFlag = schema.command.flags.find((flag) => flag.longName === "project");
      expect(projectFlag).toBeDefined();
      expect(projectFlag!.takesValue).toBe(true);
      expect(projectFlag!.valueName).toBe("name");

      const failOnFlag = schema.command.flags.find((flag) => flag.longName === "fail-on");
      expect(failOnFlag).toBeDefined();
      expect(failOnFlag!.takesValue).toBe(true);
      expect(failOnFlag!.valueName).toBe("level");
    });

    it("extracts default values from multi-line descriptions", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const failOnFlag = schema.command.flags.find((flag) => flag.longName === "fail-on");
      expect(failOnFlag!.defaultValue).toBe("none");
    });

    it("has no subcommands", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      expect(schema.command.subcommands).toHaveLength(0);
    });

    it("handles short flag with value", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const yesFlag = schema.command.flags.find((flag) => flag.longName === "yes");
      expect(yesFlag).toBeDefined();
      expect(yesFlag!.shortName).toBe("-y");
    });
  });

  describe("code generation", () => {
    it("generates valid TypeScript with typed root options", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const code = generate(schema);

      expect(code).toContain('const BINARY = "react-doctor"');
      expect(code).toContain("export const reactDoctor");
      expect(code).toContain("export default reactDoctor");

      expect(code).toContain("interface ReactDoctorOptions");
      expect(code).toContain("lint?: boolean");
      expect(code).toContain("deadCode?: boolean");
      expect(code).toContain("verbose?: boolean");
      expect(code).toContain("staged?: boolean");
      expect(code).toContain("annotations?: boolean");
      expect(code).toContain("failOn?: string");
    });

    it("generates valid JavaScript", () => {
      const schema = parseHelpText("react-doctor", REACT_DOCTOR_HELP);
      const code = generate(schema, { typescript: false });

      expect(code).not.toContain("interface");
      expect(code).not.toContain(": Record<string, unknown>");
      expect(code).toContain("export const reactDoctor");
    });
  });

  describe("runtime API", () => {
    it("creates a typed API from help text", () => {
      const api = fromHelpText("react-doctor", REACT_DOCTOR_HELP);

      expect(api.$schema.binaryName).toBe("react-doctor");
      expect(api.$schema.command.subcommands.length).toBe(0);
      expect(api.$schema.command.flags.length).toBeGreaterThan(10);
    });
  });
});

import { execSync } from "node:child_process";

const hasClaudeCli = (() => {
  try {
    execSync("claude --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

const describeIfClaude = hasClaudeCli ? describe : describe.skip;

describeIfClaude("claude (live CLI)", () => {
  let claude: Awaited<ReturnType<typeof import("../src/index.js").convertCliToJs>>;

  beforeAll(async () => {
    const { convertCliToJs } = await import("../src/index.js");
    claude = await convertCliToJs("claude");
  });

  it("parses claude --help into a schema with flags and subcommands", () => {
    const schema = claude.$schema;

    expect(schema.binaryName).toBe("claude");
    expect(schema.command.description).toContain("Claude Code");

    const flagNames = schema.command.flags.map((flag) => flag.longName);
    expect(flagNames).toContain("model");
    expect(flagNames).toContain("print");
    expect(flagNames).toContain("verbose");
    expect(flagNames).not.toContain("help");
    expect(flagNames).not.toContain("version");

    const modelFlag = schema.command.flags.find((flag) => flag.longName === "model");
    expect(modelFlag!.takesValue).toBe(true);

    const subcommandNames = schema.command.subcommands.map((subcmd) => subcmd.name);
    expect(subcommandNames).toContain("auth");
    expect(subcommandNames).toContain("doctor");
    expect(subcommandNames).toContain("mcp");
  });

  it("$validate catches typos with did-you-mean", () => {
    const errors = claude.$validate({ modle: "sonnet", prnt: true });
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const modelError = errors.find((error) => error.name === "modle");
    expect(modelError!.kind).toBe("unknown-flag");
    expect(modelError!.suggestion).toBe("model");
  });

  it("$validate passes with correct options", () => {
    const errors = claude.$validate({ print: true, model: "sonnet" });
    expect(errors).toEqual([]);
  });

  it("$command produces correct shell strings", () => {
    const commandString = claude.$command({ print: true, model: "sonnet", _: ["hello"] });
    expect(commandString).toBe("claude --print --model sonnet hello");
    expect(claude.$command.doctor()).toBe("claude doctor");
    expect(claude.$command.auth()).toBe("claude auth");
  });

  it("runs claude --print with .text() and gets a response", async () => {
    const response = await claude({
      print: true,
      model: "sonnet",
      maxBudgetUsd: 0.05,
      _: ["respond with exactly the word: pong"],
    }).text();

    expect(response.toLowerCase()).toContain("pong");
  }, 60_000);

  it("runs claude --print --output-format json and parses with .json()", async () => {
    const result = await claude({
      print: true,
      model: "sonnet",
      outputFormat: "json",
      maxBudgetUsd: 0.05,
      _: ["respond with exactly: hello"],
    }).json<{ result: string }>();

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  }, 60_000);
});
