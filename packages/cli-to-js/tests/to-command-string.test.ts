import { describe, it, expect } from "vite-plus/test";
import { toCommandString } from "../src/utils/to-command-string.js";
import { script } from "../src/utils/script.js";
import { buildApi } from "../src/build-api.js";
import type { CliSchema } from "../src/parse-help-text.js";

describe("toCommandString", () => {
  it("builds a simple command with no options", () => {
    expect(toCommandString("git", ["status"])).toBe("git status");
  });

  it("builds a command with boolean flags", () => {
    expect(toCommandString("git", ["commit"], { all: true, amend: true })).toBe(
      "git commit --all --amend",
    );
  });

  it("builds a command with string values", () => {
    expect(toCommandString("git", ["commit"], { message: "initial commit" })).toBe(
      "git commit --message 'initial commit'",
    );
  });

  it("builds a command with positional args", () => {
    expect(toCommandString("git", ["log"], { oneline: true, _: ["main..HEAD"] })).toBe(
      "git log --oneline main..HEAD",
    );
  });

  it("escapes values with spaces", () => {
    expect(toCommandString("echo", [], { _: ["hello world"] })).toBe("echo 'hello world'");
  });

  it("escapes values with single quotes", () => {
    expect(toCommandString("echo", [], { _: ["it's here"] })).toBe("echo 'it'\\''s here'");
  });

  it("handles empty string values", () => {
    expect(toCommandString("tool", [], { name: "" })).toBe('tool --name ""');
  });

  it("uses = for equals flags", () => {
    const equalsFlags = new Set(["include"]);
    expect(toCommandString("grep", [], { include: "*.ts" }, equalsFlags)).toBe(
      "grep '--include=*.ts'",
    );
  });

  it("handles safe characters without quoting", () => {
    expect(toCommandString("tool", [], { _: ["file.txt", "/usr/bin/node", "@scope/pkg"] })).toBe(
      "tool file.txt /usr/bin/node @scope/pkg",
    );
  });

  it("handles no subcommands and no options", () => {
    expect(toCommandString("ls", [])).toBe("ls");
  });
});

const createTestSchema = (): CliSchema => ({
  binaryName: "git",
  command: {
    name: "git",
    description: "",
    flags: [],
    positionalArgs: [],
    subcommands: [
      { name: "commit", aliases: ["ci"], description: "Record changes" },
      { name: "push", aliases: [], description: "Update remote" },
    ],
    mutuallyExclusiveFlags: [],
  },
});

describe("$command via buildApi", () => {
  it("returns command string for root command", () => {
    const api = buildApi("git", createTestSchema());
    expect(api.$command({ _: ["status"] })).toBe("git status");
  });

  it("returns command string for subcommand via string arg", () => {
    const api = buildApi("git", createTestSchema());
    expect(api.$command("commit", { message: "fix", all: true })).toBe(
      "git commit --message fix --all",
    );
  });

  it("returns command string via property access", () => {
    const api = buildApi("git", createTestSchema());
    expect(api.$command.push({ force: true })).toBe("git push --force");
  });

  it("resolves aliases in $command", () => {
    const api = buildApi("git", createTestSchema());
    expect(api.$command.ci({ message: "fix" })).toBe("git commit --message fix");
  });

  it("returns just binary + subcommand with no options", () => {
    const api = buildApi("git", createTestSchema());
    expect(api.$command.push()).toBe("git push");
  });

  it("uses = for flags with usesEquals in schema", () => {
    const schemaWithEquals: CliSchema = {
      binaryName: "grep",
      command: {
        name: "grep",
        description: "",
        flags: [
          {
            longName: "include",
            shortName: null,
            description: "Search only matching files",
            takesValue: true,
            valueName: "GLOB",
            defaultValue: null,
            isNegated: false,
            isRequired: false,
            choices: null,
            usesEquals: true,
            isGlobal: false,
          },
        ],
        positionalArgs: [],
        subcommands: [],
        mutuallyExclusiveFlags: [],
      },
    };
    const api = buildApi("grep", schemaWithEquals);
    expect(api.$command({ include: "pattern" })).toBe("grep --include=pattern");
  });
});

describe("shell escaping", () => {
  it("quotes glob characters", () => {
    expect(toCommandString("grep", [], { _: ["*.ts"] })).toBe("grep '*.ts'");
    expect(toCommandString("find", [], { name: "test?.js" })).toBe("find --name 'test?.js'");
  });

  it("does not quote safe characters", () => {
    expect(toCommandString("tool", [], { _: ["file.txt", "/usr/bin", "@scope/pkg"] })).toBe(
      "tool file.txt /usr/bin @scope/pkg",
    );
  });
});

describe("script", () => {
  it("produces a string via toString()", () => {
    const deploy = script("echo hello", "echo world");
    expect(String(deploy)).toBe("echo hello && echo world");
    expect(`${deploy}`).toBe("echo hello && echo world");
  });

  it("composes $command outputs", () => {
    const api = buildApi("git", createTestSchema());
    const deploy = script(
      api.$command.commit({ message: "deploy", all: true }),
      api.$command.push({ force: true }),
    );
    expect(String(deploy)).toBe("git commit --message deploy --all && git push --force");
  });

  it("runs via .run()", () => {
    expect(() => script("echo ok", "echo done").run()).not.toThrow();
  });

  it("throws on failure in .run()", () => {
    expect(() => script("echo ok", "node -e 'process.exit(1)'").run()).toThrow();
  });

  it("works across different CLIs", () => {
    const dockerSchema: CliSchema = {
      binaryName: "docker",
      command: {
        name: "docker",
        description: "",
        flags: [],
        positionalArgs: [],
        subcommands: [{ name: "build", aliases: [], description: "Build image" }],
        mutuallyExclusiveFlags: [],
      },
    };
    const gitApi = buildApi("git", createTestSchema());
    const dockerApi = buildApi("docker", dockerSchema);

    const deploy = script(
      gitApi.$command.push(),
      dockerApi.$command.build({ tag: "app", _: ["."] }),
    );
    expect(String(deploy)).toBe("git push && docker build --tag app .");
  });

  it("handles a single step", () => {
    expect(String(script("ls"))).toBe("ls");
  });

  it("handles empty script", () => {
    expect(String(script())).toBe("");
  });
});
