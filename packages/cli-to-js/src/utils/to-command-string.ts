import { optionsToArgs } from "./options-to-args.js";

const shellEscape = (argument: string): string => {
  if (argument === "") return '""';
  if (/^[\w./:@=+-]+$/.test(argument)) return argument;
  return `'${argument.replace(/'/g, "'\\''")}'`;
};

export const toCommandString = (
  binaryName: string,
  subcommands: string[],
  options: Record<string, unknown> = {},
  equalsFlags: Set<string> = new Set(),
): string => {
  const args = optionsToArgs(options, equalsFlags);
  const allParts = [binaryName, ...subcommands, ...args];
  return allParts.map(shellEscape).join(" ");
};
