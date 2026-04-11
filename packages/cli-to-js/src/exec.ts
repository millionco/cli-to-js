import { spawn, type SpawnOptions } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";
import { optionsToArgs } from "./utils/options-to-args.js";
import { COMMAND_TIMEOUT_MS, DEFAULT_FAILURE_EXIT_CODE } from "./constants.js";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunConfig {
  timeout?: number;
  signal?: AbortSignal;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: "pipe" | "inherit";
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface CommandProcess {
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  pid: number | undefined;
  kill: (signal?: NodeJS.Signals) => boolean;
  exitCode: Promise<number>;
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;
}

const shouldForceColor = (config: RunConfig): boolean =>
  Boolean(process.stdout.isTTY && (config.onStdout || config.onStderr));

const prepareSpawn = (
  binaryName: string,
  subcommands: string[],
  options: Record<string, unknown>,
  config: RunConfig,
  equalsFlags: Set<string> = new Set(),
): { allArgs: string[]; spawnOptions: SpawnOptions } => {
  const { timeout = COMMAND_TIMEOUT_MS, signal, cwd, env, stdio = "pipe" } = config;
  const args = optionsToArgs(options, equalsFlags);

  let finalEnv = env;
  if (shouldForceColor(config)) {
    finalEnv = { ...process.env, ...env, FORCE_COLOR: "1", CLICOLOR_FORCE: "1" };
    if (finalEnv.NO_COLOR) delete finalEnv.NO_COLOR;
  }

  return {
    allArgs: [...subcommands, ...args],
    spawnOptions: {
      cwd,
      env: finalEnv,
      signal,
      timeout,
      stdio: stdio === "inherit" ? "inherit" : "pipe",
      windowsHide: true,
    },
  };
};

export const runCommand = async (
  binaryName: string,
  subcommands: string[],
  options: Record<string, unknown> = {},
  config: RunConfig = {},
  equalsFlags: Set<string> = new Set(),
): Promise<CommandResult> => {
  const { allArgs, spawnOptions } = prepareSpawn(
    binaryName,
    subcommands,
    options,
    config,
    equalsFlags,
  );
  const { onStdout, onStderr } = config;

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let spawnError: Error | null = null;
    const stdoutDecoder = onStdout ? new StringDecoder("utf-8") : null;
    const stderrDecoder = onStderr ? new StringDecoder("utf-8") : null;

    const child = spawn(binaryName, allArgs, spawnOptions);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      if (onStdout && stdoutDecoder) {
        try {
          onStdout(stdoutDecoder.write(chunk));
        } catch {
          /* callback errors must not crash the process */
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (onStderr && stderrDecoder) {
        try {
          onStderr(stderrDecoder.write(chunk));
        } catch {
          /* callback errors must not crash the process */
        }
      }
    });

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (exitCode) => {
      if (spawnError) {
        reject(spawnError);
        return;
      }
      if (onStdout && stdoutDecoder) {
        const remaining = stdoutDecoder.end();
        if (remaining)
          try {
            onStdout(remaining);
          } catch {}
      }
      if (onStderr && stderrDecoder) {
        const remaining = stderrDecoder.end();
        if (remaining)
          try {
            onStderr(remaining);
          } catch {}
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: exitCode ?? DEFAULT_FAILURE_EXIT_CODE,
      });
    });
  });
};

export const spawnCommand = (
  binaryName: string,
  subcommands: string[],
  options: Record<string, unknown> = {},
  config: RunConfig = {},
  equalsFlags: Set<string> = new Set(),
): CommandProcess => {
  const { allArgs, spawnOptions } = prepareSpawn(
    binaryName,
    subcommands,
    options,
    config,
    equalsFlags,
  );

  const child = spawn(binaryName, allArgs, spawnOptions);

  const exitCodePromise = new Promise<number>((resolve, reject) => {
    let spawnError: Error | null = null;
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (code) => {
      if (spawnError) {
        reject(spawnError);
        return;
      }
      resolve(code ?? DEFAULT_FAILURE_EXIT_CODE);
    });
  });

  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    pid: child.pid,
    kill: (killSignal?: NodeJS.Signals) => child.kill(killSignal),
    exitCode: exitCodePromise,

    async *[Symbol.asyncIterator]() {
      if (!child.stdout) return;

      const decoder = new StringDecoder("utf-8");
      let buffer = "";

      for await (const chunk of child.stdout) {
        buffer += decoder.write(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          yield line;
        }
      }

      buffer += decoder.end();
      if (buffer) {
        yield buffer;
      }
    },
  };
};
