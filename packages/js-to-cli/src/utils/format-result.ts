import { JSON_INDENT_SPACES } from "../constants.js";

export const formatResult = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value, null, JSON_INDENT_SPACES);
};
