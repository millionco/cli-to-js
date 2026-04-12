#!/usr/bin/env node

import { convertJsToCli } from "./build-cli.js";
import { DEFAULT_FAILURE_EXIT_CODE } from "./constants.js";

const HELP_TEXT =
  "Usage: js-to-cli <module-path> <subcommand> [args...]\n" +
  "\n" +
  "Loads the given JS/TS module and exposes its exported functions as subcommands.\n" +
  "Each function becomes a subcommand. Primitive parameters become positional args;\n" +
  "a trailing destructured options object becomes --flags.\n";

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const modulePath = argv[0];
  const remainingArgv = argv.slice(1);

  try {
    const program = await convertJsToCli(modulePath);
    await program.parseAsync(remainingArgv, { from: "user" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`js-to-cli: ${message}\n`);
    process.exit(DEFAULT_FAILURE_EXIT_CODE);
  }
};

main();
