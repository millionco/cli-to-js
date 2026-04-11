import type { CommandResult } from "../exec.js";

export const text = (result: CommandResult): string => result.stdout.trim();

export const lines = (result: CommandResult): string[] =>
  result.stdout.trim() ? result.stdout.trim().split("\n") : [];

export const json = <T = unknown>(result: CommandResult): T => JSON.parse(result.stdout);
