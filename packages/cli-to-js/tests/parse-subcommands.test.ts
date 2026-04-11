import { describe, it, expect } from "vite-plus/test";
import { parseSubcommandHelp, enrichSubcommands } from "../src/parse-subcommands.js";
import { parseHelpText } from "../src/parse-help-text.js";
import { buildApi } from "../src/build-api.js";
import { convertCliToJs } from "../src/index.js";

describe("parseSubcommandHelp", () => {
  it("parses git commit flags via -h", async () => {
    const parsed = await parseSubcommandHelp("git", "commit");
    expect(parsed).not.toBeNull();
    expect(parsed!.flags.length).toBeGreaterThan(0);

    const messageFlag = parsed!.flags.find((f) => f.longName === "message");
    expect(messageFlag).toBeDefined();
    expect(messageFlag!.shortName).toBe("-m");
    expect(messageFlag!.takesValue).toBe(true);
  });

  it("parses git clone flags", async () => {
    const parsed = await parseSubcommandHelp("git", "clone");
    expect(parsed).not.toBeNull();
    expect(parsed!.flags.length).toBeGreaterThan(0);
  });

  it("returns null for nonexistent subcommands", async () => {
    const parsed = await parseSubcommandHelp("git", "__nonexistent_subcmd__");
    expect(parsed).toBeNull();
  });

  it("returns null for nonexistent binaries", async () => {
    const parsed = await parseSubcommandHelp("__nonexistent_binary_77__", "sub");
    expect(parsed).toBeNull();
  });

  it("strips [no-] prefix from flag names", async () => {
    const parsed = await parseSubcommandHelp("git", "commit");
    expect(parsed).not.toBeNull();

    const quietFlag = parsed!.flags.find((f) => f.longName === "quiet");
    expect(quietFlag).toBeDefined();
  });
});

describe("enrichSubcommands", () => {
  it("populates flags on discovered subcommands", async () => {
    const schema = parseHelpText(
      "git",
      `Usage: git [options] [command]

Commands:
  commit      Record changes
  status      Show status
`,
    );

    await enrichSubcommands("git", schema);

    const commitSubcmd = schema.command.subcommands.find((s) => s.name === "commit");
    expect(commitSubcmd).toBeDefined();
    expect(commitSubcmd!.flags).toBeDefined();
    expect(commitSubcmd!.flags!.length).toBeGreaterThan(0);

    const statusSubcmd = schema.command.subcommands.find((s) => s.name === "status");
    expect(statusSubcmd).toBeDefined();
    expect(statusSubcmd!.flags).toBeDefined();
  });

  it("handles empty subcommand list gracefully", async () => {
    const schema = parseHelpText("git", "Usage: git [options]");
    await enrichSubcommands("git", schema);
    expect(schema.command.subcommands).toEqual([]);
  });

  it("skips subcommands that produce no help", async () => {
    const schema = parseHelpText(
      "git",
      `Usage: git [command]

Commands:
  __nope__    Not a real command
`,
    );

    await enrichSubcommands("git", schema);

    const nopeSubcmd = schema.command.subcommands.find((s) => s.name === "__nope__");
    expect(nopeSubcmd).toBeDefined();
    expect(nopeSubcmd!.flags).toBeUndefined();
  });
});

describe("$parse on API", () => {
  it("lazily parses a single subcommand", async () => {
    const schema = parseHelpText(
      "git",
      `Usage: git [command]

Commands:
  commit      Record changes
`,
    );
    const api = buildApi("git", schema);

    const parsed = await api.$parse("commit");
    expect(parsed).toBeDefined();
    expect(parsed!.flags.length).toBeGreaterThan(0);

    const commitSubcmd = api.$schema.command.subcommands.find((s) => s.name === "commit");
    expect(commitSubcmd!.flags).toBeDefined();
    expect(commitSubcmd!.flags!.length).toBeGreaterThan(0);
  });

  it("adds unknown subcommands to schema when parsed", async () => {
    const schema = parseHelpText("git", "Usage: git [command]");
    const api = buildApi("git", schema);

    expect(api.$schema.command.subcommands).toHaveLength(0);

    await api.$parse("status");

    const statusSubcmd = api.$schema.command.subcommands.find((s) => s.name === "status");
    expect(statusSubcmd).toBeDefined();
    expect(statusSubcmd!.flags).toBeDefined();
  });

  it("parses all subcommands when called with no arguments", async () => {
    const schema = parseHelpText(
      "git",
      `Usage: git [command]

Commands:
  commit      Record changes
  status      Show status
`,
    );
    const api = buildApi("git", schema);

    await api.$parse();

    for (const subcmd of api.$schema.command.subcommands) {
      expect(subcmd.flags).toBeDefined();
      expect(subcmd.flags!.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for bogus subcommands", async () => {
    const schema = parseHelpText("git", "Usage: git [command]");
    const api = buildApi("git", schema);
    const parsed = await api.$parse("__totally_fake__");
    expect(parsed).toBeUndefined();
  });
});

describe("convertCliToJs with subcommands option", () => {
  it("eagerly parses subcommand help texts by default", async () => {
    const api = await convertCliToJs("git");

    const commitSubcmd = api.$schema.command.subcommands.find((s) => s.name === "commit");
    if (commitSubcmd) {
      expect(commitSubcmd.flags).toBeDefined();
      expect(commitSubcmd.flags!.length).toBeGreaterThan(0);
    }
  });

  it("skips subcommand parsing when subcommands: false", async () => {
    const api = await convertCliToJs("git", { subcommands: false });

    const commitSubcmd = api.$schema.command.subcommands.find((s) => s.name === "commit");
    if (commitSubcmd) {
      expect(commitSubcmd.flags).toBeUndefined();
    }
  });
});
