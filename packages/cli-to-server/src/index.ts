import { convertCliToJs, type CliToJsOptions } from "cli-to-js";
import type { CliApi } from "cli-to-js";
import type { Hono } from "hono";
import { buildServer } from "./build-server.js";

export const convertCliToServer = async (
  binaryName: string,
  options: CliToJsOptions = {},
): Promise<Hono> => {
  const cliApi = await convertCliToJs(binaryName, options);
  return buildServer(cliApi);
};

export const fromCliApi = (cliApi: CliApi): Hono => {
  return buildServer(cliApi);
};

export { buildServer } from "./build-server.js";
export { DEFAULT_PORT, SSE_HEARTBEAT_INTERVAL_MS } from "./constants.js";
