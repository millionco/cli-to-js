import { describe, it, expect } from "vite-plus/test";
import { runCommand } from "../src/exec.js";

describe("runCommand", () => {
  it("captures stdout from a successful command", async () => {
    const result = await runCommand("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("returns exit code for failing commands", async () => {
    const result = await runCommand("node", ["-e", "process.exit(42)"]);
    expect(result.exitCode).toBe(42);
  });

  it("captures stderr output", async () => {
    const result = await runCommand("node", ["-e", "console.error('oops')"]);
    expect(result.stderr.trim()).toBe("oops");
  });

  it("passes options through as CLI args", async () => {
    const result = await runCommand("echo", [], { _: ["one", "two", "three"] });
    expect(result.stdout.trim()).toBe("one two three");
  });

  it("rejects for non-existent binaries", async () => {
    await expect(runCommand("__nonexistent_binary_42__", [])).rejects.toThrow();
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runCommand("sleep", ["10"], {}, { signal: controller.signal })).rejects.toThrow();
  });

  it("passes cwd to the spawned process", async () => {
    const result = await runCommand("pwd", [], {}, { cwd: "/tmp" });
    expect(result.stdout.trim()).toMatch(/\/tmp|\/private\/tmp/);
    expect(result.exitCode).toBe(0);
  });

  it("handles commands with mixed stdout and stderr", async () => {
    const result = await runCommand("node", ["-e", 'console.log("out"); console.error("err")']);
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
  });

  describe("onStdout / onStderr callbacks", () => {
    it("calls onStdout with real-time data", async () => {
      const chunks: string[] = [];
      await runCommand(
        "echo",
        ["hello streaming"],
        {},
        {
          onStdout: (data) => chunks.push(data),
        },
      );
      expect(chunks.join("").trim()).toBe("hello streaming");
    });

    it("calls onStderr with real-time data", async () => {
      const chunks: string[] = [];
      await runCommand(
        "node",
        ["-e", "console.error('err chunk')"],
        {},
        {
          onStderr: (data) => chunks.push(data),
        },
      );
      expect(chunks.join("").trim()).toBe("err chunk");
    });

    it("still buffers stdout when onStdout is set", async () => {
      const result = await runCommand(
        "echo",
        ["buffered too"],
        {},
        {
          onStdout: () => {},
        },
      );
      expect(result.stdout.trim()).toBe("buffered too");
    });

    it("does not crash when onStdout callback throws", async () => {
      const result = await runCommand(
        "echo",
        ["survive"],
        {},
        {
          onStdout: () => {
            throw new Error("callback boom");
          },
        },
      );
      expect(result.stdout.trim()).toBe("survive");
      expect(result.exitCode).toBe(0);
    });

    it("does not crash when onStderr callback throws", async () => {
      const result = await runCommand(
        "node",
        ["-e", "console.error('x'); process.exit(0)"],
        {},
        {
          onStderr: () => {
            throw new Error("stderr boom");
          },
        },
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe("stdio inherit", () => {
    it("returns empty stdout/stderr with stdio inherit", async () => {
      const result = await runCommand("node", ["-e", "process.exit(0)"], {}, { stdio: "inherit" });
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("auto tty detection", () => {
    it("does not override FORCE_COLOR when no callbacks are set", async () => {
      const result = await runCommand(
        "node",
        ["-e", "console.log(process.env.FORCE_COLOR ?? 'inherited')"],
        {},
        { env: { ...process.env, FORCE_COLOR: undefined } },
      );
      expect(result.stdout.trim()).toBe("inherited");
    });

    it("can receive FORCE_COLOR via explicit env override", async () => {
      const result = await runCommand(
        "node",
        ["-e", "console.log(process.env.FORCE_COLOR)"],
        {},
        { env: { ...process.env, FORCE_COLOR: "1" } },
      );
      expect(result.stdout.trim()).toBe("1");
    });
  });
});
