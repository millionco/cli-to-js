import { describe, it, expect } from "vite-plus/test";
import { text, lines, json } from "../src/utils/parse-output.js";
import { buildApi } from "../src/build-api.js";
import type { CommandResult } from "../src/exec.js";
import type { CliSchema } from "../src/parse-help-text.js";

const makeResult = (stdout: string): CommandResult => ({ stdout, stderr: "", exitCode: 0 });

const createEchoSchema = (): CliSchema => ({
  binaryName: "echo",
  command: {
    name: "echo",
    description: "",
    flags: [],
    positionalArgs: [],
    subcommands: [{ name: "hello", aliases: [], description: "" }],
    mutuallyExclusiveFlags: [],
  },
});

describe("standalone output helpers", () => {
  it("text trims stdout", () => {
    expect(text(makeResult("  hello world  \n"))).toBe("hello world");
  });

  it("lines splits stdout", () => {
    expect(lines(makeResult("one\ntwo\nthree\n"))).toEqual(["one", "two", "three"]);
  });

  it("lines returns empty array for empty stdout", () => {
    expect(lines(makeResult(""))).toEqual([]);
  });

  it("json parses stdout", () => {
    expect(json(makeResult('{"name":"test"}'))).toEqual({ name: "test" });
  });

  it("json throws on invalid JSON", () => {
    expect(() => json(makeResult("not json"))).toThrow();
  });
});

describe("chained output helpers on CommandPromise", () => {
  it(".text() returns trimmed stdout", async () => {
    const api = buildApi("echo", createEchoSchema());
    const result = await api({ _: ["hello world"] }).text();
    expect(result).toBe("hello world");
  });

  it(".lines() returns split lines", async () => {
    const api = buildApi("node", createEchoSchema());
    const result = await api["-e"]({ _: ['console.log("a");console.log("b")'] }).lines();
    expect(result).toEqual(["a", "b"]);
  });

  it(".json() parses JSON output", async () => {
    const api = buildApi("node", createEchoSchema());
    const result = await api["-e"]({ _: ["console.log(JSON.stringify({x:1}))"] }).json<{
      x: number;
    }>();
    expect(result).toEqual({ x: 1 });
  });

  it("still works as regular promise", async () => {
    const api = buildApi("echo", createEchoSchema());
    const result = await api({ _: ["test"] });
    expect(result.stdout.trim()).toBe("test");
    expect(result.exitCode).toBe(0);
  });

  it(".text() works on subcommand methods", async () => {
    const api = buildApi("echo", createEchoSchema());
    const result = await api.hello().text();
    expect(result).toBe("hello");
  });
});
