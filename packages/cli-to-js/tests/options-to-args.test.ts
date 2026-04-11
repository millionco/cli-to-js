import { describe, it, expect } from "vite-plus/test";
import { optionsToArgs } from "../src/utils/options-to-args.js";

describe("optionsToArgs", () => {
  it("converts boolean true to a flag", () => {
    expect(optionsToArgs({ verbose: true })).toEqual(["--verbose"]);
  });

  it("omits boolean false flags", () => {
    expect(optionsToArgs({ verbose: false })).toEqual([]);
  });

  it("converts string values to flag + value pairs", () => {
    expect(optionsToArgs({ output: "file.txt" })).toEqual(["--output", "file.txt"]);
  });

  it("converts number values to flag + value pairs", () => {
    expect(optionsToArgs({ timeout: 5000 })).toEqual(["--timeout", "5000"]);
  });

  it("converts camelCase keys to kebab-case flags", () => {
    expect(optionsToArgs({ dryRun: true })).toEqual(["--dry-run"]);
  });

  it("converts single-character keys to short flags", () => {
    expect(optionsToArgs({ v: true })).toEqual(["-v"]);
  });

  it("converts single-character keys with values", () => {
    expect(optionsToArgs({ o: "file.txt" })).toEqual(["-o", "file.txt"]);
  });

  it("repeats flags for array values", () => {
    expect(optionsToArgs({ include: ["src", "lib"] })).toEqual([
      "--include",
      "src",
      "--include",
      "lib",
    ]);
  });

  it("places positional args at the end via _ key", () => {
    expect(optionsToArgs({ verbose: true, _: ["file.txt"] })).toEqual(["--verbose", "file.txt"]);
  });

  it("handles _ as a single string value", () => {
    expect(optionsToArgs({ _: "file.txt" })).toEqual(["file.txt"]);
  });

  it("handles multiple positional args", () => {
    expect(optionsToArgs({ _: ["a.txt", "b.txt", "c.txt"] })).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("skips undefined values", () => {
    expect(optionsToArgs({ output: undefined })).toEqual([]);
  });

  it("skips null values", () => {
    expect(optionsToArgs({ output: null })).toEqual([]);
  });

  it("passes through keys already starting with -", () => {
    expect(optionsToArgs({ "--force": true })).toEqual(["--force"]);
  });

  it("passes through raw short flags", () => {
    expect(optionsToArgs({ "-v": true })).toEqual(["-v"]);
  });

  it("handles an empty options object", () => {
    expect(optionsToArgs({})).toEqual([]);
  });

  it("combines flags and positionals correctly", () => {
    expect(optionsToArgs({ message: "hello world", amend: true, _: ["--", "file.txt"] })).toEqual([
      "--message",
      "hello world",
      "--amend",
      "--",
      "file.txt",
    ]);
  });

  it("skips _ when value is undefined", () => {
    expect(optionsToArgs({ _: undefined })).toEqual([]);
  });

  it("skips _ when value is null", () => {
    expect(optionsToArgs({ _: null })).toEqual([]);
  });

  it("handles empty string values", () => {
    expect(optionsToArgs({ output: "" })).toEqual(["--output", ""]);
  });

  it("handles zero as a value", () => {
    expect(optionsToArgs({ count: 0 })).toEqual(["--count", "0"]);
  });

  it("handles empty array values", () => {
    expect(optionsToArgs({ tags: [] })).toEqual([]);
  });
});
