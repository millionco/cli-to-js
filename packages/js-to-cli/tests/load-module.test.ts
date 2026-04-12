import { describe, it, expect } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import { loadModule } from "../src/load-module.js";

const fixturePath = (relativePath: string): string =>
  fileURLToPath(new URL(`./fixtures/${relativePath}`, import.meta.url));

describe("loadModule", () => {
  it("loads a .mjs module and lists named function exports", async () => {
    const loaded = await loadModule(fixturePath("sample.mjs"));
    const commandNames = loaded.functionExports.map((entry) => entry.commandName).sort();
    expect(commandNames).toEqual(["add", "greet", "tags"]);
  });

  it("filters out class exports while keeping functions", async () => {
    const loaded = await loadModule(fixturePath("classes-and-funcs.mjs"));
    expect(loaded.functionExports.map((entry) => entry.exportName)).toEqual(["describe"]);
  });

  it("throws when no function exports exist", async () => {
    await expect(loadModule(fixturePath("empty.mjs"))).rejects.toThrow(
      /no exported functions found/,
    );
  });

  it("throws on unsupported extensions", async () => {
    await expect(loadModule(fixturePath("README.md"))).rejects.toThrow(
      /unsupported module extension/,
    );
  });
});
