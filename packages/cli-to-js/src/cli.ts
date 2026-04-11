#!/usr/bin/env node

import { Command } from "commander";
import { loadSchema } from "./load-schema.js";
import { generate, generateTypes } from "./generate.js";
import { writeFileSync } from "node:fs";

interface CliActionOptions {
  output?: string;
  json?: boolean;
  dts?: boolean;
  js?: boolean;
  subcommands?: boolean;
}

const program = new Command()
  .name("cli-to-js")
  .description("Turn any CLI tool into a Node.js API")
  .argument("<binary>", "CLI binary to convert")
  .option("-o, --output <file>", "write to file instead of stdout")
  .option("--json", "output parsed schema as JSON")
  .option("--dts", "output TypeScript type declarations (.d.ts) for use with convertCliToJs")
  .option("--js", "generate JavaScript instead of TypeScript")
  .option("--subcommands", "parse subcommand help texts for flag details")
  .action(async (binaryName: string, actionOptions: CliActionOptions) => {
    try {
      const schema = await loadSchema(binaryName, { subcommands: actionOptions.subcommands });

      let generatedOutput: string;
      if (actionOptions.json) {
        generatedOutput = JSON.stringify(schema, null, 2) + "\n";
      } else if (actionOptions.dts) {
        generatedOutput = generateTypes(schema);
      } else {
        generatedOutput = generate(schema, { typescript: !actionOptions.js });
      }

      if (actionOptions.output) {
        writeFileSync(actionOptions.output, generatedOutput);
        console.log(`Generated ${actionOptions.output}`);
      } else {
        console.log(generatedOutput);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to process "${binaryName}": ${message}`);
      process.exit(1);
    }
  });

program.parse();
