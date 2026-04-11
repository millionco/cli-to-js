import { describe, it, expect } from "vite-plus/test";
import { kebabToCamel } from "../src/utils/kebab-to-camel.js";

describe("kebabToCamel", () => {
  it("converts a simple kebab-case string", () => {
    expect(kebabToCamel("dry-run")).toBe("dryRun");
  });

  it("converts multiple hyphens", () => {
    expect(kebabToCamel("no-verify-ssl")).toBe("noVerifySsl");
  });

  it("returns single-word strings unchanged", () => {
    expect(kebabToCamel("verbose")).toBe("verbose");
  });

  it("returns an empty string unchanged", () => {
    expect(kebabToCamel("")).toBe("");
  });

  it("handles trailing hyphen gracefully", () => {
    expect(kebabToCamel("some-")).toBe("some-");
  });

  it("only converts lowercase letters after hyphens", () => {
    expect(kebabToCamel("no-SSL")).toBe("no-SSL");
  });
});
