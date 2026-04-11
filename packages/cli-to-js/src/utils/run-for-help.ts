import { spawn, type SpawnOptions } from "node:child_process";
import type { CommandResult } from "../exec.js";
import { HELP_TIMEOUT_MS, DEFAULT_FAILURE_EXIT_CODE } from "../constants.js";

export const runForHelp = (
  binaryName: string,
  subcommands: string[],
  timeout: number = HELP_TIMEOUT_MS,
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> => {
  const spawnOptions: SpawnOptions = {
    cwd,
    env,
    timeout,
    stdio: "pipe",
    windowsHide: true,
  };

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let spawnError: Error | null = null;

    const child = spawn(binaryName, subcommands, spawnOptions);

    child.stdin?.end();

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (exitCode) => {
      if (spawnError) {
        reject(spawnError);
        return;
      }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: exitCode ?? DEFAULT_FAILURE_EXIT_CODE,
      });
    });
  });
};
