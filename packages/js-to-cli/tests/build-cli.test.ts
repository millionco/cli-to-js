import { describe, it, expect } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { convertJsToCli } from "../src/build-cli.js";

const fixturePath = (relativePath: string): string =>
  fileURLToPath(new URL(`./fixtures/${relativePath}`, import.meta.url));

describe("convertJsToCli", () => {
  it("creates a subcommand for each exported function", async () => {
    const program = await convertJsToCli(fixturePath("sample.mjs"));
    const subcommandNames = program.commands.map((command) => command.name()).sort();
    expect(subcommandNames).toEqual(["add", "greet", "tags"]);
  });

  it("declares positional arguments for primitive parameters", async () => {
    const program = await convertJsToCli(fixturePath("sample.mjs"));
    const greet = program.commands.find((command) => command.name() === "greet");
    expect(greet).toBeDefined();
    expect(greet?.registeredArguments.map((argument) => argument.name())).toEqual(["name"]);
  });

  it("declares kebab-cased flags for destructured options fields", async () => {
    const program = await convertJsToCli(fixturePath("sample.mjs"));
    const greet = program.commands.find((command) => command.name() === "greet");
    const flagNames = greet?.options.map((option) => option.long);
    expect(flagNames).toContain("--loud");
    expect(flagNames).toContain("--times");
  });

  it("collects repeatable array options", async () => {
    const program = await convertJsToCli(fixturePath("sample.mjs"));
    const writes: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["tags", "--tag", "a", "--tag", "b"], { from: "user" });
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(writes.join("")).toBe("a,b\n");
  });
});
