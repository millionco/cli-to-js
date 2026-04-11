import { describe, it, expect, afterEach } from "vite-plus/test";
import { createExecutor, type Executor } from "@executor-js/sdk";
import { cliPlugin } from "../src/plugin.js";

const ECHO_HELP_TEXT = `Usage: echo [OPTION]... [STRING]...

Echo the STRING(s) to standard output.

Options:
  -n                 do not output the trailing newline
  -e                 enable interpretation of backslash escapes
  -E                 disable interpretation of backslash escapes
  --help             display this help and exit
  --version          output version information and exit`;

const MULTI_COMMAND_HELP_TEXT = `Usage: test-cli [options] <command>

A fictional CLI for testing

Options:
  -v, --verbose          Enable verbose output
  -o, --output <file>    Output file path

Commands:
  init           Initialize a new project
  build          Build the project
  deploy         Deploy to production`;

let executor: Executor<readonly [ReturnType<typeof cliPlugin>]>;

const startExecutor = async () => {
  executor = await createExecutor({
    scope: { name: "test" },
    plugins: [cliPlugin()] as const,
  });
  return executor;
};

afterEach(async () => {
  await executor?.close();
});

const toolNamesForSource = async (sourceId: string): Promise<string[]> => {
  const tools = await executor.tools.list();
  return tools.filter((tool) => String(tool.sourceId) === sourceId).map((tool) => tool.name);
};

describe("cliPlugin", () => {
  it("exposes the full extension API under the 'cli' key", async () => {
    await startExecutor();
    expect(executor.cli).toBeDefined();
    expect(typeof executor.cli.addBinary).toBe("function");
    expect(typeof executor.cli.addHelpText).toBe("function");
    expect(typeof executor.cli.removeBinary).toBe("function");
    expect(typeof executor.cli.list).toBe("function");
  });

  it("starts with an empty list", async () => {
    await startExecutor();
    expect(executor.cli.list()).toEqual([]);
  });
});

describe("addHelpText", () => {
  it("registers a root tool from help text", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "echo", helpText: ECHO_HELP_TEXT, namespace: "echo" });

    expect(executor.cli.list()).toEqual(["echo"]);
    expect(await toolNamesForSource("cli:echo")).toContain("run");
  });

  it("registers subcommand tools alongside the root tool", async () => {
    await startExecutor();
    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: MULTI_COMMAND_HELP_TEXT,
      namespace: "tc",
    });

    const toolNames = await toolNamesForSource("cli:tc");
    expect(toolNames).toContain("run");
    expect(toolNames).toContain("init");
    expect(toolNames).toContain("build");
    expect(toolNames).toContain("deploy");
  });

  it("defaults namespace to the binary name", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "my-tool", helpText: ECHO_HELP_TEXT });
    expect(executor.cli.list()).toEqual(["my-tool"]);
  });

  it("generates JSON Schema inputSchema with typed flag properties", async () => {
    await startExecutor();
    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: MULTI_COMMAND_HELP_TEXT,
      namespace: "tc",
    });

    const schema = await executor.tools.schema("tc.run");
    const inputSchema = schema.inputSchema as {
      type: string;
      properties: Record<string, { type: string }>;
    };

    expect(inputSchema.type).toBe("object");
    expect(inputSchema.properties.verbose.type).toBe("boolean");
    expect(inputSchema.properties.output.type).toBe("string");
  });
});

describe("addBinary", () => {
  it("auto-discovers tools by running the binary's --help", async () => {
    await startExecutor();
    await executor.cli.addBinary({ binary: "echo" });

    expect(executor.cli.list()).toEqual(["echo"]);
    expect((await toolNamesForSource("cli:echo")).length).toBeGreaterThanOrEqual(1);
  });
});

describe("tool invocation", () => {
  it("invokes the root tool and returns stdout/stderr/exitCode", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "echo", helpText: ECHO_HELP_TEXT, namespace: "echo" });

    const result = await executor.tools.invoke(
      "echo.run",
      { _: "hello world" },
      { onElicitation: "accept-all" },
    );
    const data = result.data as { stdout: string; exitCode: number };
    expect(data.stdout.trim()).toBe("hello world");
    expect(data.exitCode).toBe(0);
  });

  it("invokes a subcommand tool", async () => {
    await startExecutor();
    await executor.cli.addHelpText({
      binary: "node",
      helpText: `Usage: node [options] [script]

Options:
  -e, --eval <script>    evaluate script
  --help                 display this help and exit

Commands:
  run                    run a script`,
      namespace: "node",
    });

    const result = await executor.tools.invoke(
      "node.run",
      { eval: 'console.log("executor-test")' },
      { onElicitation: "accept-all" },
    );
    const data = result.data as { stdout: string };
    expect(data.stdout.trim()).toBe("executor-test");
  });

  it("throws ToolNotFoundError for an unregistered tool ID", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "echo", helpText: ECHO_HELP_TEXT, namespace: "echo" });

    await expect(
      executor.tools.invoke("missing.run", {}, { onElicitation: "accept-all" }),
    ).rejects.toThrow();
  });
});

describe("removeBinary", () => {
  it("removes a registered binary and all its tools", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "echo", helpText: ECHO_HELP_TEXT, namespace: "echo" });

    await executor.cli.removeBinary("echo");

    expect(executor.cli.list()).toEqual([]);
    expect(await toolNamesForSource("cli:echo")).toHaveLength(0);
  });
});

describe("multiple binaries", () => {
  it("registers and isolates tools from separate binaries", async () => {
    await startExecutor();
    await executor.cli.addHelpText({ binary: "echo", helpText: ECHO_HELP_TEXT, namespace: "echo" });
    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: MULTI_COMMAND_HELP_TEXT,
      namespace: "tc",
    });

    expect(executor.cli.list().sort()).toEqual(["echo", "tc"]);
    expect((await toolNamesForSource("cli:echo")).length).toBeGreaterThan(0);
    expect((await toolNamesForSource("cli:tc")).length).toBeGreaterThan(0);
  });
});
