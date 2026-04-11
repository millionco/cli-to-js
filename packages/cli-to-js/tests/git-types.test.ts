import { describe, it, expect, beforeAll } from "vite-plus/test";
import { convertCliToJs } from "../src/index.js";
import type { CliApi } from "../src/index.js";

describe("git typed API", () => {
  let git: CliApi;

  beforeAll(async () => {
    git = await convertCliToJs("git");
  });

  describe("$schema", () => {
    it("parses the binary name", () => {
      expect(git.$schema.binaryName).toBe("git");
    });

    it("discovers subcommands from real git --help", () => {
      const subcommandNames = git.$schema.command.subcommands.map((subcommand) => subcommand.name);
      expect(subcommandNames).toContain("commit");
      expect(subcommandNames).toContain("push");
      expect(subcommandNames).toContain("pull");
      expect(subcommandNames).toContain("clone");
      expect(subcommandNames).toContain("status");
      expect(subcommandNames).toContain("diff");
      expect(subcommandNames).toContain("log");
      expect(subcommandNames).toContain("branch");
      expect(subcommandNames).toContain("merge");
      expect(subcommandNames).toContain("fetch");
      expect(subcommandNames).toContain("rebase");
    });

    it("enriches commit with typed flags", () => {
      const commitSubcommand = git.$schema.command.subcommands.find(
        (subcommand) => subcommand.name === "commit",
      );
      expect(commitSubcommand).toBeDefined();
      expect(commitSubcommand!.flags).toBeDefined();
      expect(commitSubcommand!.flags!.length).toBeGreaterThan(0);

      const messageFlag = commitSubcommand!.flags!.find((flag) => flag.longName === "message");
      expect(messageFlag).toBeDefined();
      expect(messageFlag!.shortName).toBe("-m");
      expect(messageFlag!.takesValue).toBe(true);
    });

    it("enriches clone with typed flags", () => {
      const cloneSubcommand = git.$schema.command.subcommands.find(
        (subcommand) => subcommand.name === "clone",
      );
      expect(cloneSubcommand!.flags).toBeDefined();

      const depthFlag = cloneSubcommand!.flags!.find((flag) => flag.longName === "depth");
      expect(depthFlag).toBeDefined();
      expect(depthFlag!.takesValue).toBe(true);

      const bareFlag = cloneSubcommand!.flags!.find((flag) => flag.longName === "bare");
      expect(bareFlag).toBeDefined();
      expect(bareFlag!.takesValue).toBe(false);
    });
  });

  describe("$command", () => {
    it("builds correct shell strings for commit", () => {
      const commandString = git.$command.commit({ message: "initial commit" });
      expect(commandString).toBe("git commit --message 'initial commit'");
    });

    it("builds correct shell strings for push with flags and positional args", () => {
      const commandString = git.$command.push({
        force: true,
        setUpstream: true,
        _: ["origin", "main"],
      });
      expect(commandString).toBe("git push --force --set-upstream origin main");
    });

    it("builds correct shell strings for clone", () => {
      const commandString = git.$command.clone({
        depth: "1",
        singleBranch: true,
        _: ["https://github.com/user/repo.git"],
      });
      expect(commandString).toBe(
        "git clone --depth 1 --single-branch https://github.com/user/repo.git",
      );
    });

    it("builds correct shell strings for checkout -b", () => {
      const commandString = git.$command.checkout({ b: true, _: ["feature-branch"] });
      expect(commandString).toBe("git checkout -b feature-branch");
    });

    it("builds correct shell strings for diff --cached --name-only", () => {
      const commandString = git.$command.diff({ cached: true, nameOnly: true });
      expect(commandString).toBe("git diff --cached --name-only");
    });

    it("builds correct shell strings for log with short flags", () => {
      const commandString = git.$command.log({ n: "5", oneline: true, graph: true });
      expect(commandString).toBe("git log -n 5 --oneline --graph");
    });

    it("builds correct shell strings for reset --hard", () => {
      const commandString = git.$command.reset({ hard: true, _: ["HEAD~1"] });
      expect(commandString).toBe("git reset --hard 'HEAD~1'");
    });
  });

  describe("$validate", () => {
    it("catches typos on commit flags with did-you-mean", () => {
      const errors = git.$validate("commit", { mesage: "fix" });
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const messageError = errors.find((error) => error.name === "mesage");
      expect(messageError).toBeDefined();
      expect(messageError!.kind).toBe("unknown-flag");
      expect(messageError!.suggestion).toBe("message");
    });

    it("passes with correct commit flags", () => {
      const errors = git.$validate("commit", { message: "fix", all: true });
      const flagErrors = errors.filter((error) => error.kind !== "missing-positional");
      expect(flagErrors).toEqual([]);
    });
  });

  describe("live execution", () => {
    it("runs git status via .text()", async () => {
      const statusOutput = await git.status({ porcelain: true }).text();
      expect(typeof statusOutput).toBe("string");
    });

    it("runs git log via .lines()", async () => {
      const logLines = await git.log({ oneline: true, n: "3" }).lines();
      expect(Array.isArray(logLines)).toBe(true);
      expect(logLines.length).toBeLessThanOrEqual(3);
    });

    it("runs git branch and finds the current branch", async () => {
      const branches = await git.branch().lines();
      expect(branches.length).toBeGreaterThan(0);
      const currentBranch = branches.find((line) => line.startsWith("*"));
      expect(currentBranch).toBeDefined();
    });

    it("runs git diff HEAD HEAD with no output", async () => {
      const diffOutput = await git.diff({ stat: true, _: ["HEAD", "HEAD"] }).text();
      expect(diffOutput).toBe("");
    });
  });
});
