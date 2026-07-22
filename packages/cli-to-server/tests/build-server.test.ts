import { describe, it, expect } from "vite-plus/test";
import { fromHelpText } from "cli-to-js";
import { buildServer, fromCliApi, convertCliToServer } from "../src/index.js";

const ECHO_HELP = `Usage: echo [options] [text...]

Print arguments to stdout.

Options:
  -n, --no-newline  Do not output trailing newline
  -e, --escape      Enable interpretation of backslash escapes
  -h, --help        Display help

Commands:
  greet [options] [name]  Say hello to someone
`;

describe("buildServer", () => {
  const createApi = () => fromHelpText("echo", ECHO_HELP);

  it("returns a Hono app with a fetch function", () => {
    const api = createApi();
    const app = buildServer(api);
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");
  });

  describe("GET /_schema", () => {
    it("returns the CLI schema as JSON", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_schema");

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("application/json");

      const schema = await response.json();
      expect(schema.binaryName).toBe("echo");
      expect(schema.command.description).toBe("Print arguments to stdout.");
      expect(schema.command.subcommands.length).toBeGreaterThanOrEqual(1);
      expect(schema.command.flags.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("POST /_validate", () => {
    it("validates root command options and returns empty errors", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_validate", {
        method: "POST",
        body: JSON.stringify({ options: { noNewline: true } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.errors).toEqual([]);
    });

    it("returns error for unenriched subcommand validation", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_validate", {
        method: "POST",
        body: JSON.stringify({ subcommand: "greet", options: { name: "world" } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(500);
    });

    it("detects unknown flags", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_validate", {
        method: "POST",
        body: JSON.stringify({ options: { bogusFlag: true } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0].kind).toBe("unknown-flag");
    });
  });

  describe("POST /_command", () => {
    it("returns shell command string for root command", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_command", {
        method: "POST",
        body: JSON.stringify({ options: { noNewline: true } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.command).toBe("echo --no-newline");
    });

    it("returns shell command string for subcommand", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/_command", {
        method: "POST",
        body: JSON.stringify({ subcommand: "greet", options: { name: "world" } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.command).toBe("echo greet --name world");
    });
  });

  describe("POST / (root command execution)", () => {
    it("executes the root command and returns raw result", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["hello world"] } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.stdout).toContain("hello world");
      expect(body).toHaveProperty("stderr");
      expect(body).toHaveProperty("exitCode");
      expect(body.exitCode).toBe(0);
    });

    it("handles multiple positional arguments", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/", {
        method: "POST",
        body: JSON.stringify({
          options: { _: ["hello", "world"] },
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.stdout).toContain("hello");
      expect(body.stdout).toContain("world");
      expect(body.exitCode).toBe(0);
    });
  });

  describe("POST /:subcommand", () => {
    it("executes a subcommand with arguments", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/greet", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["World"] } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.stdout).toContain("World");
      expect(body.exitCode).toBe(0);
    });

    it("returns 400 for unknown subcommand", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/nonexistent", {
        method: "POST",
        body: JSON.stringify({ options: {} }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Unknown subcommand");
    });
  });

  describe("format resolution", () => {
    it("returns plain text when ?format=text is specified", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/?format=text", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["hello"] } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/plain");
      const text = await response.text();
      expect(text.trim()).toBe("hello");
    });

    it("returns JSON array when ?format=lines is specified", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/?format=lines", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["hello", "world"] } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("returns plain text when Accept: text/plain is sent", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["hello"] } }),
        headers: {
          "Content-Type": "application/json",
          Accept: "text/plain",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/plain");
    });

    it("returns raw JSON by default (no format override)", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ options: { _: ["hello"] } }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("stdout");
      expect(body).toHaveProperty("stderr");
      expect(body).toHaveProperty("exitCode");
    });
  });

  describe("error handling", () => {
    it("returns 500 when execution fails with invalid config", async () => {
      const app = buildServer(createApi());
      const response = await app.request("/", {
        method: "POST",
        body: JSON.stringify({
          options: { _: ["hello"] },
          config: { cwd: "/nonexistent/path/12345" },
        }),
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });
  });
});

describe("fromCliApi", () => {
  it("creates a Hono app from a CliApi instance", () => {
    const api = fromHelpText("echo", ECHO_HELP);
    const app = fromCliApi(api);
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");
  });

  it("produced app can handle requests", async () => {
    const api = fromHelpText("echo", ECHO_HELP);
    const app = fromCliApi(api);
    const response = await app.request("/_schema");
    expect(response.status).toBe(200);
    const schema = await response.json();
    expect(schema.binaryName).toBe("echo");
  });
});

describe("convertCliToServer", () => {
  it("converts a real binary to a Hono app", async () => {
    const app = await convertCliToServer("echo");
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe("function");

    const response = await app.request("/", {
      method: "POST",
      body: JSON.stringify({ options: { _: ["hello from cli-to-server"] } }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stdout).toContain("hello from cli-to-server");
    expect(body.exitCode).toBe(0);
  });
});

describe("constants", () => {
  it("exports DEFAULT_PORT as 3456", async () => {
    const { DEFAULT_PORT } = await import("../src/constants.js");
    expect(DEFAULT_PORT).toBe(3456);
  });

  it("exports SSE_HEARTBEAT_INTERVAL_MS as 15000", async () => {
    const { SSE_HEARTBEAT_INTERVAL_MS } = await import("../src/constants.js");
    expect(SSE_HEARTBEAT_INTERVAL_MS).toBe(15000);
  });
});
