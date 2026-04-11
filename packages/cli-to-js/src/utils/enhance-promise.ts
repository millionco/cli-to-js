import type { CommandResult } from "../exec.js";
import type { CommandPromise } from "../cli-api.js";

export const enhancePromise = (promise: Promise<CommandResult>): CommandPromise =>
  Object.assign(promise, {
    text: () => promise.then((result) => result.stdout.trim()),
    lines: () =>
      promise.then((result) => (result.stdout.trim() ? result.stdout.trim().split("\n") : [])),
    json: <T = unknown>() => promise.then((result) => JSON.parse(result.stdout) as T),
  });
