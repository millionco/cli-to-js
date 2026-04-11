import { describe, it, expect } from "vite-plus/test";
import { buildApi } from "../src/build-api.js";
import type { CliSchema } from "../src/parse-help-text.js";

const createTestSchema = (): CliSchema => ({
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
        isRequired: false,
        choices: null,
        usesEquals: false,
        isGlobal: false,
      },
    ],
    positionalArgs: [],
    subcommands: [
      { name: "hello", aliases: ["hi"], description: "Say hello" },
      { name: "world", aliases: [], description: "Say world" },
    ],
  },
});

describe("buildApi", () => {
  it("exposes the schema via $schema", () => {
    const schema = createTestSchema();
    const api = buildApi("echo", schema);
    expect(api.$schema).toBe(schema);
  });

  it("returns undefined for then to prevent auto-thenable", () => {
    const api = buildApi("echo", createTestSchema());
    expect(api.then).toBeUndefined();
  });

  it("executes root command with positional args", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api({ _: ["hello world"] });
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.exitCode).toBe(0);
  });

  it("executes root command with a string subcommand", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api("greetings");
    expect(result.stdout.trim()).toBe("greetings");
  });

  it("executes subcommand via property access", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api.hello();
    expect(result.stdout.trim()).toBe("hello");
  });

  it("resolves subcommand alias to primary name", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api.hi();
    expect(result.stdout.trim()).toBe("hello");
  });

  it("executes dynamic subcommands not in schema", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api.anything();
    expect(result.stdout.trim()).toBe("anything");
  });

  it("passes options to subcommand methods", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api.sub({ _: ["extra"] });
    expect(result.stdout.trim()).toBe("sub extra");
  });

  it("passes per-call RunConfig to subcommand methods", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api.test({}, { cwd: "/tmp" });
    expect(result.stdout.trim()).toBe("test");
    expect(result.exitCode).toBe(0);
  });

  it("merges default config with per-call config", async () => {
    const api = buildApi("pwd", createTestSchema(), { cwd: "/tmp" });
    const result = await api();
    expect(result.stdout.trim()).toMatch(/\/tmp|\/private\/tmp/);
  });

  describe("$spawn", () => {
    it("returns a CommandProcess for subcommands", async () => {
      const api = buildApi("echo", createTestSchema());
      const proc = api.$spawn.hello();
      expect(proc.stdout).not.toBeNull();
      const exitCode = await proc.exitCode;
      expect(exitCode).toBe(0);
    });

    it("supports async iteration on spawned subcommands", async () => {
      const api = buildApi("node", createTestSchema());
      const proc = api.$spawn["-e"]({ _: ['console.log("streamed")'] });
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual(["streamed"]);
    });

    it("spawns root command when called as function", async () => {
      const api = buildApi("echo", createTestSchema());
      const proc = api.$spawn({ _: ["root spawn"] });
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toBe("root spawn");
    });

    it("spawns with string subcommand when called as function", async () => {
      const api = buildApi("echo", createTestSchema());
      const proc = api.$spawn("via-string");
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toBe("via-string");
    });

    it("merges default config into spawn calls", async () => {
      const api = buildApi("pwd", createTestSchema(), { cwd: "/tmp" });
      const proc = api.$spawn();
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toMatch(/\/tmp|\/private\/tmp/);
    });

    it("resolves aliases in $spawn proxy", async () => {
      const api = buildApi("echo", createTestSchema());
      const proc = api.$spawn.hi();
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toBe("hello");
    });
  });

  it("does not crash when accessing reserved properties", () => {
    const api = buildApi("echo", createTestSchema());
    expect(() => api.toString()).not.toThrow();
    expect(() => api.valueOf()).not.toThrow();
  });

  it("returns consistent $schema across multiple accesses", () => {
    const api = buildApi("echo", createTestSchema());
    expect(api.$schema).toBe(api.$schema);
  });

  it("executes root command with no arguments", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api();
    expect(result.exitCode).toBe(0);
  });

  it("handles subcommand names with hyphens", async () => {
    const api = buildApi("echo", createTestSchema());
    const result = await api["dry-run"]();
    expect(result.stdout.trim()).toBe("dry-run");
  });
});
