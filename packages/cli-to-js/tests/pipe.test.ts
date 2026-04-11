import { describe, it, expect } from "vite-plus/test";
import { Pipeline, createCommandStep, createPipelineProxy } from "../src/pipe.js";
import { map, filter, take } from "../src/utils/async-iterable.js";
import { buildApi } from "../src/build-api.js";
import type { CliSchema } from "../src/parse-help-text.js";

const nodeScript = (code: string) => createCommandStep("node", ["-e", code], {}, {});

const createNodeSchema = (): CliSchema => ({
  binaryName: "node",
  command: {
    name: "node",
    description: "Node.js",
    flags: [],
    positionalArgs: [],
    subcommands: [],
  },
});

describe("Pipeline", () => {
  it("collects output from a single command step", async () => {
    const step = createCommandStep("echo", [], { _: ["hello world"] }, {});
    const pipeline = new Pipeline("echo", [step]);
    const result = await pipeline.collect();
    expect(result).toEqual(["hello world"]);
  });

  it("returns first line", async () => {
    const step = nodeScript('console.log("a");console.log("b")');
    const pipeline = new Pipeline("node", [step]);
    const result = await pipeline.first();
    expect(result).toBe("a");
  });

  it("returns last line", async () => {
    const step = nodeScript('console.log("a");console.log("b")');
    const pipeline = new Pipeline("node", [step]);
    const result = await pipeline.last();
    expect(result).toBe("b");
  });

  it("returns undefined for first/last on empty pipeline", async () => {
    const pipeline = new Pipeline("echo");
    const firstResult = await pipeline.first();
    const lastResult = await pipeline.last();
    expect(firstResult).toBeUndefined();
    expect(lastResult).toBeUndefined();
  });

  it("chains transform steps with pipe()", async () => {
    const step = nodeScript('console.log("hello");console.log("world");console.log("test")');
    const result = await new Pipeline("node", [step])
      .pipe(filter((line) => line !== "world"))
      .pipe(map((line) => line.toUpperCase()))
      .collect();
    expect(result).toEqual(["HELLO", "TEST"]);
  });

  it("supports take() to limit output", async () => {
    const step = nodeScript('console.log("a");console.log("b");console.log("c")');
    const result = await new Pipeline("node", [step]).pipe(take(2)).collect();
    expect(result).toEqual(["a", "b"]);
  });

  it("pipe() returns a new immutable Pipeline", () => {
    const original = new Pipeline("echo");
    const piped = original.pipe(map((line) => line));
    expect(piped).not.toBe(original);
  });

  it("pipes stdout of one command into stdin of another via pipe(binary, subcommands)", async () => {
    const sourceStep = nodeScript('console.log("line1");console.log("line2");console.log("line3")');
    const result = await new Pipeline("node", [sourceStep])
      .pipe("node", [
        "-e",
        'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(d.trim().split("\\n").length))',
      ])
      .collect();
    expect(result).toEqual(["3"]);
  });
});

describe("createPipelineProxy", () => {
  it("creates a pipeline via subcommand property access", async () => {
    const proxy = createPipelineProxy("echo");
    const result = await proxy.hello().collect();
    expect(result[0]).toContain("hello");
  });

  it("exposes Pipeline methods on the proxy itself", () => {
    const proxy = createPipelineProxy("echo");
    expect(typeof proxy.pipe).toBe("function");
    expect(typeof proxy.run).toBe("function");
    expect(typeof proxy.collect).toBe("function");
    expect(typeof proxy.first).toBe("function");
    expect(typeof proxy.last).toBe("function");
  });
});

describe("$pipe integration via buildApi", () => {
  it("exposes $pipe on the built API", () => {
    const api = buildApi("echo", createNodeSchema());
    expect(api.$pipe).toBeDefined();
    expect(typeof api.$pipe.pipe).toBe("function");
  });

  it("runs a pipeline through $pipe subcommand access", async () => {
    const api = buildApi("node", createNodeSchema());
    const result = await api.$pipe["-e"]({ _: ['console.log("piped")'] }).collect();
    expect(result).toEqual(["piped"]);
  });

  it("chains transforms on $pipe subcommand pipeline", async () => {
    const api = buildApi("node", createNodeSchema());
    const result = await api.$pipe["-e"]({
      _: ['console.log("foo");console.log("bar");console.log("baz")'],
    })
      .pipe(filter((line) => line.startsWith("b")))
      .collect();
    expect(result).toEqual(["bar", "baz"]);
  });
});
