import { spawn } from "node:child_process";
import { parseHelpText, type CliSchema } from "../parse-help-text.js";
import { enrichSubcommands } from "../parse-subcommands.js";
import { selectHelpOutput } from "../utils/best-help-text.js";
import { PLUGIN_RESOLVE_TIMEOUT_MS } from "../constants.js";

export type ResolveStatus = "pending" | "ready" | "error";

export interface BinaryResolution {
  status: ResolveStatus;
  schema: CliSchema | null;
  error: string | null;
  resolvedAt: number;
}

export interface ResolverOptions {
  timeout?: number;
  helpFlag?: string;
}

const runHelpOnBinary = (
  binaryName: string,
  helpFlag: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
  new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let spawnError: Error | null = null;

    const child = spawn(binaryName, [helpFlag], {
      stdio: "pipe",
      windowsHide: true,
      timeout: timeoutMs,
    });

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
        exitCode: exitCode ?? 1,
      });
    });
  });

export const resolveBinarySchema = async (
  binaryName: string,
  options: ResolverOptions = {},
): Promise<BinaryResolution> => {
  const timeoutMs = options.timeout ?? PLUGIN_RESOLVE_TIMEOUT_MS;
  const helpFlag = options.helpFlag ?? "--help";

  try {
    const result = await runHelpOnBinary(binaryName, helpFlag, timeoutMs);
    const helpText = selectHelpOutput(result.stdout, result.stderr);
    if (!helpText.trim()) {
      return {
        status: "error",
        schema: null,
        error: `"${binaryName} ${helpFlag}" produced no output`,
        resolvedAt: Date.now(),
      };
    }
    const schema = parseHelpText(binaryName, helpText);
    if (schema.command.subcommands.length > 0) {
      await enrichSubcommands(binaryName, schema, { timeout: timeoutMs });
    }
    return {
      status: "ready",
      schema,
      error: null,
      resolvedAt: Date.now(),
    };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
    return {
      status: "error",
      schema: null,
      error: message,
      resolvedAt: Date.now(),
    };
  }
};
