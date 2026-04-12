import { describe, it, expect } from "vite-plus/test";
import { parseFunctionSignature } from "../src/parse-function.js";

describe("parseFunctionSignature", () => {
  it("parses two primitive params with no defaults", () => {
    const signature = parseFunctionSignature((a: number, b: number) => a + b, "add");
    expect(signature.isAsync).toBe(false);
    expect(signature.parameters).toHaveLength(2);
    expect(signature.parameters[0]).toMatchObject({
      name: "a",
      kind: "primitive",
      hasDefault: false,
      defaultLiteral: null,
    });
    expect(signature.parameters[1]).toMatchObject({
      name: "b",
      kind: "primitive",
      hasDefault: false,
    });
  });

  it("captures primitive default literals", () => {
    const signature = parseFunctionSignature((a = 1, b = "x") => `${a}${b}`, "concat");
    expect(signature.parameters[0]).toMatchObject({
      name: "a",
      hasDefault: true,
      defaultLiteral: "1",
    });
    expect(signature.parameters[1]).toMatchObject({
      name: "b",
      hasDefault: true,
      defaultLiteral: '"x"',
    });
  });

  it("detects async functions", () => {
    const signature = parseFunctionSignature(async (x: number) => x, "echo");
    expect(signature.isAsync).toBe(true);
    expect(signature.parameters[0]).toMatchObject({ name: "x", kind: "primitive" });
  });

  it("parses a destructured options parameter", () => {
    const fn = ({ verbose = false, count = 0 }: { verbose?: boolean; count?: number }) =>
      `${verbose}-${count}`;
    const signature = parseFunctionSignature(fn, "describe");
    expect(signature.parameters).toHaveLength(1);
    const optionsParam = signature.parameters[0];
    expect(optionsParam.kind).toBe("options");
    expect(optionsParam.optionFields).toEqual([
      { name: "verbose", hasDefault: true, defaultLiteral: "false" },
      { name: "count", hasDefault: true, defaultLiteral: "0" },
    ]);
  });

  it("recognizes a defaulted options parameter", () => {
    const fn = ({ x = 1 }: { x?: number } = {}) => x;
    const signature = parseFunctionSignature(fn, "foo");
    expect(signature.parameters[0]).toMatchObject({
      kind: "options",
      hasDefault: true,
    });
  });

  it("parses rest parameters", () => {
    const signature = parseFunctionSignature((...items: string[]) => items.join(","), "join");
    expect(signature.parameters).toHaveLength(1);
    expect(signature.parameters[0]).toMatchObject({ name: "items", kind: "rest" });
  });

  it("preserves nested braces in primitive default literals", () => {
    const signature = parseFunctionSignature((config = { x: 1 }) => JSON.stringify(config), "wrap");
    expect(signature.parameters[0].defaultLiteral).toBe("{ x: 1 }");
  });

  it("preserves commas inside string defaults", () => {
    const signature = parseFunctionSignature((separator = ",") => separator, "delim");
    expect(signature.parameters[0].defaultLiteral).toBe('","');
  });

  it("parses mixed primitive + options parameters", () => {
    const fn = (name: string, { loud = false, times = 1 } = {}) =>
      Array.from({ length: times }, () => (loud ? name.toUpperCase() : name)).join("\n");
    const signature = parseFunctionSignature(fn, "greet");
    expect(signature.parameters).toHaveLength(2);
    expect(signature.parameters[0]).toMatchObject({ name: "name", kind: "primitive" });
    expect(signature.parameters[1].kind).toBe("options");
    expect(signature.parameters[1].optionFields).toEqual([
      { name: "loud", hasDefault: true, defaultLiteral: "false" },
      { name: "times", hasDefault: true, defaultLiteral: "1" },
    ]);
  });

  it("handles named function declarations", () => {
    const deductImpl = (amount: number, balance: number) => balance - amount;
    Object.defineProperty(deductImpl, "toString", {
      value: () => "function deduct(amount, balance = 0) { return balance - amount; }",
    });
    const signature = parseFunctionSignature(deductImpl, "deduct");
    expect(signature.parameters).toEqual([
      {
        name: "amount",
        kind: "primitive",
        hasDefault: false,
        defaultLiteral: null,
        optionFields: null,
      },
      {
        name: "balance",
        kind: "primitive",
        hasDefault: true,
        defaultLiteral: "0",
        optionFields: null,
      },
    ]);
  });

  it("throws when an options parameter is not last", () => {
    const sourceFunction = () => null;
    Object.defineProperty(sourceFunction, "toString", {
      value: () => "({ a = 1 }, tail) => null",
    });
    expect(() => parseFunctionSignature(sourceFunction, "bad")).toThrow(/must be last/);
  });

  it("throws on array destructuring patterns", () => {
    const sourceFunction = () => 0;
    Object.defineProperty(sourceFunction, "toString", {
      value: () => "([a, b]) => 0",
    });
    expect(() => parseFunctionSignature(sourceFunction, "tuple")).toThrow(
      /array destructuring not supported/,
    );
  });
});
