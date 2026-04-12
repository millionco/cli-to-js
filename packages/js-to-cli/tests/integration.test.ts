import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertJsToCli } from "../src/build-cli.js";

interface CapturedOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const captureRun = async (runner: () => Promise<void>): Promise<CapturedOutput> => {
  const captured: CapturedOutput = { stdout: "", stderr: "", exitCode: null };

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit.bind(process);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured.stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    captured.stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;

  process.exit = ((code?: number) => {
    captured.exitCode = code ?? 0;
    throw new Error(`__process_exit__:${code ?? 0}`);
  }) as typeof process.exit;

  try {
    await runner();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("__process_exit__:")) {
      throw error;
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalExit;
  }

  return captured;
};

describe("integration", () => {
  let tempDirectory: string;

  beforeEach(() => {
    tempDirectory = mkdtempSync(join(tmpdir(), "js-to-cli-"));
  });

  afterEach(() => {
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("invokes a function and prints its return value to stdout", async () => {
    const modulePath = join(tempDirectory, "module.mjs");
    writeFileSync(
      modulePath,
      [
        "export const greet = (name, { loud = false } = {}) => {",
        "  const phrase = `Hello, ${name}!`;",
        "  return loud ? phrase.toUpperCase() : phrase;",
        "};",
      ].join("\n"),
    );

    const program = await convertJsToCli(modulePath);
    const captured = await captureRun(() =>
      program.parseAsync(["greet", "Alice", "--loud"], { from: "user" }),
    );
    expect(captured.stdout.trim()).toBe("HELLO, ALICE!");
  });

  it("formats object return values as JSON", async () => {
    const modulePath = join(tempDirectory, "module.mjs");
    writeFileSync(
      modulePath,
      "export const summarize = (label) => ({ label, length: label.length });",
    );

    const program = await convertJsToCli(modulePath);
    const captured = await captureRun(() =>
      program.parseAsync(["summarize", "claude"], { from: "user" }),
    );
    expect(JSON.parse(captured.stdout)).toEqual({ label: "claude", length: 6 });
  });

  it("reports thrown errors and exits with failure code", async () => {
    const modulePath = join(tempDirectory, "module.mjs");
    writeFileSync(modulePath, "export const boom = () => { throw new Error('boom'); };");

    const program = await convertJsToCli(modulePath);
    const captured = await captureRun(() => program.parseAsync(["boom"], { from: "user" }));
    expect(captured.stderr).toContain("boom");
    expect(captured.exitCode).toBe(1);
  });
});
