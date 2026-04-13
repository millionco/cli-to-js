import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { CliApi, CommandResult } from "cli-to-js";
import { SSE_HEARTBEAT_INTERVAL_MS } from "./constants.js";

interface RequestBody {
  options?: Record<string, unknown>;
  config?: {
    timeout?: number;
    cwd?: string;
  };
}

type OutputFormat = "raw" | "text" | "lines" | "json";

const resolveFormat = (
  queryFormat: string | undefined,
  acceptHeader: string | undefined,
): OutputFormat => {
  if (queryFormat === "text" || queryFormat === "lines" || queryFormat === "json") {
    return queryFormat;
  }
  if (acceptHeader?.includes("text/plain")) return "text";
  if (acceptHeader?.includes("application/json")) return "json";
  return "raw";
};

const formatResult = (result: CommandResult, format: OutputFormat) => {
  const trimmedStdout = result.stdout.trim();

  switch (format) {
    case "text":
      return { contentType: "text" as const, body: trimmedStdout };
    case "lines":
      return {
        contentType: "json" as const,
        body: trimmedStdout ? trimmedStdout.split("\n") : [],
      };
    case "json": {
      return { contentType: "json" as const, body: JSON.parse(trimmedStdout) };
    }
    default:
      return {
        contentType: "json" as const,
        body: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      };
  }
};

const isKnownSubcommand = (cliApi: CliApi, subcommand: string): boolean => {
  const subcommands = cliApi.$schema.command.subcommands;
  return subcommands.some(
    (entry) => entry.name === subcommand || entry.aliases?.includes(subcommand),
  );
};

const parseBodySafe = async (request: Request): Promise<RequestBody> => {
  try {
    return (await request.json()) as RequestBody;
  } catch {
    return {};
  }
};

export const buildServer = (cliApi: CliApi): Hono => {
  const app = new Hono();

  app.get("/_schema", (context) => {
    return context.json(cliApi.$schema);
  });

  app.post("/_validate", async (context) => {
    const body = (await context.req.json()) as RequestBody & { subcommand?: string };
    const errors =
      body.subcommand !== undefined
        ? cliApi.$validate(body.subcommand, body.options ?? {})
        : cliApi.$validate(body.options ?? {});
    return context.json({ errors });
  });

  app.post("/_command", async (context) => {
    const body = (await context.req.json()) as RequestBody & { subcommand?: string };
    const command =
      body.subcommand !== undefined
        ? cliApi.$command(body.subcommand, body.options ?? {})
        : cliApi.$command(body.options ?? {});
    return context.json({ command });
  });

  app.post("/_spawn/:subcommand?", (context) => {
    const subcommand = context.req.param("subcommand");

    if (subcommand !== undefined && !isKnownSubcommand(cliApi, subcommand)) {
      return context.json({ error: `Unknown subcommand: "${subcommand}"` }, 400);
    }

    return streamSSE(context, async (stream) => {
      const body = await parseBodySafe(context.req.raw);

      const commandProcess =
        subcommand !== undefined
          ? cliApi.$spawn[subcommand](body.options ?? {}, body.config ?? {})
          : cliApi.$spawn(body.options ?? {}, body.config ?? {});

      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {});
      }, SSE_HEARTBEAT_INTERVAL_MS);

      try {
        for await (const line of commandProcess) {
          await stream.writeSSE({ event: "stdout", data: line });
        }

        const exitCode = await commandProcess.exitCode;
        await stream.writeSSE({ event: "exit", data: String(exitCode) });
      } finally {
        clearInterval(heartbeat);
      }
    });
  });

  const handleExecution = async (
    context: Parameters<Parameters<typeof app.post>[1]>[0],
    subcommand: string | undefined,
  ) => {
    const body = await parseBodySafe(context.req.raw);
    const format = resolveFormat(context.req.query("format"), context.req.header("accept"));

    try {
      const result =
        subcommand !== undefined
          ? await cliApi[subcommand](body.options ?? {}, body.config ?? {})
          : await cliApi(body.options ?? {}, body.config ?? {});

      const formatted = formatResult(result, format);

      if (formatted.contentType === "text") {
        return context.text(formatted.body);
      }
      return context.json(formatted.body);
    } catch (executionError) {
      const errorMessage =
        executionError instanceof Error ? executionError.message : String(executionError);
      return context.json({ error: errorMessage }, 500);
    }
  };

  app.post("/:subcommand", (context) => {
    const subcommand = context.req.param("subcommand");

    if (!isKnownSubcommand(cliApi, subcommand)) {
      return context.json({ error: `Unknown subcommand: "${subcommand}"` }, 400);
    }

    return handleExecution(context, subcommand);
  });

  app.post("/", (context) => {
    return handleExecution(context, undefined);
  });

  return app;
};
