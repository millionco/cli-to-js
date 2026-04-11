import { describe, it, expect } from "vite-plus/test";
import { createExecutor } from "@executor-js/sdk";
import { cliPlugin } from "../src/plugin.js";

const ECHO_HELP_TEXT = `Usage: echo [OPTION]... [STRING]...

Echo the STRING(s) to standard output.

Options:
  -n                 do not output the trailing newline
  -e                 enable interpretation of backslash escapes
  -E                 disable interpretation of backslash escapes
  --help             display this help and exit
  --version          output version information and exit`;

const GIT_STYLE_HELP_TEXT = `Usage: test-cli [options] <command>

A fictional CLI for testing

Options:
  -v, --verbose          Enable verbose output
  -o, --output <file>    Output file path

Commands:
  init           Initialize a new project
  build          Build the project
  deploy         Deploy to production`;

describe("cliPlugin", () => {
  it("registers under the 'cli' key", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    expect(executor.cli).toBeDefined();
    expect(typeof executor.cli.addBinary).toBe("function");
    expect(typeof executor.cli.addHelpText).toBe("function");
    expect(typeof executor.cli.removeBinary).toBe("function");
    expect(typeof executor.cli.list).toBe("function");

    await executor.close();
  });

  it("starts with an empty list", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    expect(executor.cli.list()).toEqual([]);
    await executor.close();
  });
});

describe("cliPlugin.addHelpText", () => {
  it("registers tools from help text", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });

    expect(executor.cli.list()).toEqual(["echo"]);

    const tools = await executor.tools.list();
    const echoTools = tools.filter((tool) => String(tool.sourceId) === "cli:echo");
    expect(echoTools.length).toBeGreaterThanOrEqual(1);

    const rootTool = echoTools.find((tool) => tool.name === "run");
    expect(rootTool).toBeDefined();
    expect(rootTool!.description).toContain("echo");

    await executor.close();
  });

  it("registers subcommand tools from help text with commands", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: GIT_STYLE_HELP_TEXT,
      namespace: "testcli",
    });

    const tools = await executor.tools.list();
    const cliTools = tools.filter((tool) => String(tool.sourceId) === "cli:testcli");

    const toolNames = cliTools.map((tool) => tool.name);
    expect(toolNames).toContain("run");
    expect(toolNames).toContain("init");
    expect(toolNames).toContain("build");
    expect(toolNames).toContain("deploy");

    await executor.close();
  });

  it("uses binary name as namespace when namespace is omitted", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "my-tool",
      helpText: ECHO_HELP_TEXT,
    });

    expect(executor.cli.list()).toEqual(["my-tool"]);
    await executor.close();
  });

  it("generates input schema with flags as properties", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: GIT_STYLE_HELP_TEXT,
      namespace: "tc",
    });

    const schema = await executor.tools.schema("tc.run");
    expect(schema).toBeDefined();
    expect(schema.inputSchema).toBeDefined();

    const inputSchema = schema.inputSchema as {
      type: string;
      properties: Record<string, { type: string }>;
    };
    expect(inputSchema.type).toBe("object");
    expect(inputSchema.properties.verbose).toBeDefined();
    expect(inputSchema.properties.verbose.type).toBe("boolean");
    expect(inputSchema.properties.output).toBeDefined();
    expect(inputSchema.properties.output.type).toBe("string");

    await executor.close();
  });
});

describe("cliPlugin.addBinary", () => {
  it("registers tools by running echo --help", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addBinary({ binary: "echo" });

    expect(executor.cli.list()).toEqual(["echo"]);

    const tools = await executor.tools.list();
    const echoTools = tools.filter((tool) => String(tool.sourceId) === "cli:echo");
    expect(echoTools.length).toBeGreaterThanOrEqual(1);

    await executor.close();
  });
});

describe("cliPlugin tool invocation", () => {
  it("invokes the root tool and returns stdout", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });

    const result = await executor.tools.invoke(
      "echo.run",
      { _: "hello world" },
      {
        onElicitation: "accept-all",
      },
    );
    const data = result.data as { stdout: string; stderr: string; exitCode: number };
    expect(data.stdout.trim()).toBe("hello world");
    expect(data.exitCode).toBe(0);

    await executor.close();
  });

  it("invokes a subcommand tool via the executor", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "node",
      helpText: `Usage: node [options] [script]

Options:
  -e, --eval <script>    evaluate script
  -p, --print <script>   evaluate and print
  --help                 display this help and exit
  --version              output version info

Commands:
  run                    run a script`,
      namespace: "node",
    });

    const result = await executor.tools.invoke(
      "node.run",
      { eval: 'console.log("executor-test")' },
      { onElicitation: "accept-all" },
    );
    const data = result.data as { stdout: string; stderr: string; exitCode: number };
    expect(data.stdout.trim()).toBe("executor-test");

    await executor.close();
  });

  it("throws ToolNotFoundError for unregistered tool ID", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });

    await expect(
      executor.tools.invoke("missing.run", {}, { onElicitation: "accept-all" }),
    ).rejects.toThrow();

    await executor.close();
  });
});

describe("cliPlugin.removeBinary", () => {
  it("removes a registered binary and its tools", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });
    expect(executor.cli.list()).toEqual(["echo"]);

    await executor.cli.removeBinary("echo");
    expect(executor.cli.list()).toEqual([]);

    const tools = await executor.tools.list();
    const echoTools = tools.filter((tool) => String(tool.sourceId) === "cli:echo");
    expect(echoTools).toHaveLength(0);

    await executor.close();
  });
});

describe("cliPlugin.close", () => {
  it("cleans up all registered tools on executor close", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });
    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: GIT_STYLE_HELP_TEXT,
      namespace: "tc",
    });

    const toolsBefore = await executor.tools.list();
    expect(toolsBefore.length).toBeGreaterThan(0);

    await executor.close();
  });

  it("supports registering multiple binaries simultaneously", async () => {
    const executor = await createExecutor({
      scope: { name: "test" },
      plugins: [cliPlugin()] as const,
    });

    await executor.cli.addHelpText({
      binary: "echo",
      helpText: ECHO_HELP_TEXT,
      namespace: "echo",
    });
    await executor.cli.addHelpText({
      binary: "test-cli",
      helpText: GIT_STYLE_HELP_TEXT,
      namespace: "tc",
    });

    const registered = executor.cli.list();
    expect(registered).toContain("echo");
    expect(registered).toContain("tc");
    expect(registered).toHaveLength(2);

    const tools = await executor.tools.list();
    const echoTools = tools.filter((tool) => String(tool.sourceId) === "cli:echo");
    const tcTools = tools.filter((tool) => String(tool.sourceId) === "cli:tc");
    expect(echoTools.length).toBeGreaterThan(0);
    expect(tcTools.length).toBeGreaterThan(0);

    await executor.close();
  });
});
