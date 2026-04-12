import { describe, it, expect } from "vite-plus/test";
import { inferOptionType } from "../src/utils/infer-option-type.js";

describe("inferOptionType", () => {
  it("treats null literal as required string", () => {
    expect(inferOptionType(null)).toEqual({ commanderType: "required-string" });
  });

  it("treats false default as boolean flag", () => {
    expect(inferOptionType("false")).toEqual({ commanderType: "boolean" });
  });

  it("treats true default as negated-boolean flag", () => {
    expect(inferOptionType("true")).toEqual({ commanderType: "negated-boolean" });
  });

  it("treats integer literal as number", () => {
    expect(inferOptionType("3")).toEqual({ commanderType: "number", defaultValue: 3 });
  });

  it("treats negative float as number", () => {
    expect(inferOptionType("-1.5")).toEqual({ commanderType: "number", defaultValue: -1.5 });
  });

  it("treats array literal as array option", () => {
    expect(inferOptionType("[]")).toEqual({ commanderType: "array" });
  });

  it("unwraps double-quoted string default", () => {
    expect(inferOptionType('"hello"')).toEqual({
      commanderType: "string",
      defaultValue: "hello",
    });
  });

  it("unwraps single-quoted string default", () => {
    expect(inferOptionType("'hi'")).toEqual({ commanderType: "string", defaultValue: "hi" });
  });

  it("unwraps template literal default", () => {
    expect(inferOptionType("`yo`")).toEqual({ commanderType: "string", defaultValue: "yo" });
  });

  it("falls back to string with undefined default for unrecognized expressions", () => {
    expect(inferOptionType("{ a: 1 }")).toEqual({
      commanderType: "string",
      defaultValue: undefined,
    });
  });
});
