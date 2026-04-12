import { describe, it, expect } from "vite-plus/test";
import { splitTopLevel } from "../src/utils/split-top-level.js";

describe("splitTopLevel", () => {
  it("splits a flat list at the separator", () => {
    expect(splitTopLevel("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });

  it("preserves nested braces", () => {
    expect(splitTopLevel("a, { x: 1, y: 2 }, b", ",")).toEqual(["a", " { x: 1, y: 2 }", " b"]);
  });

  it("preserves nested brackets", () => {
    expect(splitTopLevel("a, [1, 2, 3], b", ",")).toEqual(["a", " [1, 2, 3]", " b"]);
  });

  it("preserves nested parens", () => {
    expect(splitTopLevel("a, fn(1, 2), b", ",")).toEqual(["a", " fn(1, 2)", " b"]);
  });

  it("preserves separators inside double-quoted strings", () => {
    expect(splitTopLevel('a, ",", b', ",")).toEqual(["a", ' ","', " b"]);
  });

  it("preserves separators inside single-quoted strings", () => {
    expect(splitTopLevel("a, ',', b", ",")).toEqual(["a", " ','", " b"]);
  });

  it("preserves separators inside template strings", () => {
    expect(splitTopLevel("a, `,`, b", ",")).toEqual(["a", " `,`", " b"]);
  });

  it("respects backslash escapes inside strings", () => {
    expect(splitTopLevel("a, '\\'', b", ",")).toEqual(["a", " '\\''", " b"]);
  });

  it("returns the input unchanged when separator is absent", () => {
    expect(splitTopLevel("hello world", ",")).toEqual(["hello world"]);
  });

  it("supports multi-character separators", () => {
    expect(splitTopLevel("a => b => c", "=>")).toEqual(["a ", " b ", " c"]);
  });
});
