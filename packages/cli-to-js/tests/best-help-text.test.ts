import { describe, it, expect } from "vite-plus/test";
import { selectHelpOutput } from "../src/utils/best-help-text.js";

describe("selectHelpOutput", () => {
  it("returns stdout when stderr is empty", () => {
    expect(selectHelpOutput("Usage: tool [options]\n", "")).toBe("Usage: tool [options]\n");
  });

  it("returns stderr when stdout is empty", () => {
    expect(selectHelpOutput("", "Usage: tool [options]\n")).toBe("Usage: tool [options]\n");
  });

  it("returns empty string when both are empty", () => {
    expect(selectHelpOutput("", "")).toBe("");
  });

  it("prefers stdout when it has help signals and stderr does not", () => {
    const stdout = "Usage: tool [options]\n\nOptions:\n  -v, --verbose  Be verbose\n";
    const stderr = "Warning: something happened\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stdout);
  });

  it("prefers stderr when it has help signals and stdout does not", () => {
    const stdout = "Error: not authenticated\n";
    const stderr = "Usage: tool [options]\n\nOptions:\n  -v, --verbose  Be verbose\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stderr);
  });

  it("picks the stream with more help signals when both have them", () => {
    const stdout = "Usage: tool [options]\n\nOptions:\n  -v  verbose\n\nCommands:\n  init  Init\n";
    const stderr = "Usage: tool\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stdout);
  });

  it("prefers stdout when both have equal help signals", () => {
    const stdout = "Usage: tool [options]\n\nOptions:\n  -v  verbose\n";
    const stderr = "Usage: tool [options]\n\nOptions:\n  -q  quiet\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stdout);
  });

  it("picks longer text when neither has help signals", () => {
    const stdout = "some output that is longer text here";
    const stderr = "short";
    expect(selectHelpOutput(stdout, stderr)).toBe(stdout);
  });

  it("handles both streams being only whitespace", () => {
    expect(selectHelpOutput("   ", "  \n  ")).toBe("");
  });

  it("picks content stream when other is only whitespace", () => {
    expect(selectHelpOutput("   ", "Usage: tool\n")).toBe("Usage: tool\n");
    expect(selectHelpOutput("Usage: tool\n", "   ")).toBe("Usage: tool\n");
  });

  it("prefers stderr when stdout has usage but stderr has more detail", () => {
    const stdout = "Usage: tool\n";
    const stderr = "Usage: tool [options]\n\nOptions:\n  -v  verbose\n\nCommands:\n  init  Init\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stderr);
  });

  it("picks stderr when it has equal length but more signals", () => {
    const stdout = "x".repeat(200);
    const stderr = "Usage: tool [options]\n\nOptions:\n  -v  verbose\n";
    expect(selectHelpOutput(stdout, stderr)).toBe(stderr);
  });
});
