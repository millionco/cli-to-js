#!/usr/bin/env node

import { serve } from "@hono/node-server";
import { Command } from "commander";
import { convertCliToServer } from "./index.js";
import { DEFAULT_PORT } from "./constants.js";

interface CliActionOptions {
  port?: string;
  subcommands?: boolean;
}

const program = new Command()
  .name("cli-to-server")
  .description("Turn any CLI tool into an HTTP server")
  .argument("<binary>", "CLI binary to serve")
  .option("-p, --port <port>", `port to listen on (default: ${DEFAULT_PORT})`)
  .option("--subcommands", "parse subcommand help texts for flag details")
  .action(async (binaryName: string, actionOptions: CliActionOptions) => {
    try {
      const port = actionOptions.port ? Number(actionOptions.port) : DEFAULT_PORT;
      const app = await convertCliToServer(binaryName, {
        subcommands: actionOptions.subcommands,
      });

      console.log(`Serving "${binaryName}" on http://localhost:${port}`);
      console.log();
      console.log("Routes:");
      console.log(`  POST /              Run root command`);
      console.log(`  POST /:subcommand   Run a subcommand`);
      console.log(`  POST /_spawn/:sub   Stream subcommand output (SSE)`);
      console.log(`  GET  /_schema       Get CLI schema`);
      console.log(`  POST /_validate     Validate options`);
      console.log(`  POST /_command      Get shell command string`);

      serve({ fetch: app.fetch, port });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to serve "${binaryName}": ${message}`);
      process.exit(1);
    }
  });

program.parse();
