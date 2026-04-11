import { describe, it, expect } from "vite-plus/test";
import { camelToKebab } from "../src/utils/camel-to-kebab.js";

describe("camelToKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebab("dryRun")).toBe("dry-run");
  });

  it("handles multiple capitals", () => {
    expect(camelToKebab("noColorOutput")).toBe("no-color-output");
  });

  it("returns lowercase strings unchanged", () => {
    expect(camelToKebab("verbose")).toBe("verbose");
  });

  it("handles single character input", () => {
    expect(camelToKebab("v")).toBe("v");
  });

  it("handles empty string", () => {
    expect(camelToKebab("")).toBe("");
  });

  it("handles leading capital without producing leading dash", () => {
    expect(camelToKebab("ForceDelete")).toBe("force-delete");
  });

  it("handles consecutive capitals (acronyms)", () => {
    expect(camelToKebab("useHTTPS")).toBe("use-https");
  });

  it("handles trailing acronym", () => {
    expect(camelToKebab("parseJSON")).toBe("parse-json");
  });

  it("handles leading acronym followed by word", () => {
    expect(camelToKebab("XMLParser")).toBe("xml-parser");
  });

  it("handles two-letter acronym", () => {
    expect(camelToKebab("IOError")).toBe("io-error");
  });

  it("handles all uppercase", () => {
    expect(camelToKebab("HTTP")).toBe("http");
  });

  it("handles digits between words", () => {
    expect(camelToKebab("level2Cache")).toBe("level2-cache");
  });
});
