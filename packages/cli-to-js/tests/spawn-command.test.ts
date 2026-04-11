import { describe, it, expect } from "vite-plus/test";
import { spawnCommand } from "../src/exec.js";

describe("spawnCommand", () => {
  it("returns a CommandProcess with stdout stream", () => {
    const proc = spawnCommand("echo", ["hello"]);
    expect(proc.stdout).not.toBeNull();
    expect(proc.pid).toBeDefined();
  });

  it("resolves exitCode on completion", async () => {
    const proc = spawnCommand("echo", ["hello"]);
    const exitCode = await proc.exitCode;
    expect(exitCode).toBe(0);
  });

  it("resolves non-zero exitCode", async () => {
    const proc = spawnCommand("node", ["-e", "process.exit(3)"]);
    const exitCode = await proc.exitCode;
    expect(exitCode).toBe(3);
  });

  it("rejects exitCode for non-existent binaries", async () => {
    const proc = spawnCommand("__nonexistent_binary_99__", []);
    await expect(proc.exitCode).rejects.toThrow();
  });

  it("kill terminates the process", async () => {
    const proc = spawnCommand("sleep", ["60"]);
    expect(proc.pid).toBeDefined();

    proc.kill("SIGTERM");
    const exitCode = await proc.exitCode;
    expect(exitCode).not.toBe(0);
  });

  it("returns null streams with stdio inherit", () => {
    const proc = spawnCommand("echo", ["hello"], {}, { stdio: "inherit" });
    expect(proc.stdout).toBeNull();
    expect(proc.stderr).toBeNull();
  });

  describe("async iterator", () => {
    it("yields lines from stdout", async () => {
      const proc = spawnCommand("node", [
        "-e",
        'console.log("line1"); console.log("line2"); console.log("line3");',
      ]);
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual(["line1", "line2", "line3"]);
    });

    it("yields single line without trailing newline", async () => {
      const proc = spawnCommand("node", ["-e", 'process.stdout.write("no newline")']);
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual(["no newline"]);
    });

    it("yields nothing for empty output", async () => {
      const proc = spawnCommand("node", ["-e", ""]);
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual([]);
    });

    it("handles multiline output with blank lines", async () => {
      const proc = spawnCommand("node", [
        "-e",
        'console.log("a"); console.log(""); console.log("b");',
      ]);
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual(["a", "", "b"]);
    });

    it("handles multi-byte UTF-8 characters", async () => {
      const proc = spawnCommand("node", ["-e", 'console.log("hello 🎉 world")']);
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toBe("hello 🎉 world");
    });

    it("yields nothing when stdio is inherit", async () => {
      const proc = spawnCommand("echo", ["invisible"], {}, { stdio: "inherit" });
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines).toEqual([]);
    });
  });

  describe("env override", () => {
    it("passes explicit FORCE_COLOR via env", async () => {
      const proc = spawnCommand(
        "node",
        ["-e", "console.log(process.env.FORCE_COLOR)"],
        {},
        { env: { ...process.env, FORCE_COLOR: "1" } },
      );
      const lines: string[] = [];
      for await (const line of proc) {
        lines.push(line);
      }
      expect(lines[0]).toBe("1");
    });
  });
});
