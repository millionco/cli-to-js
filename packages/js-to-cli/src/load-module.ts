import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { camelToKebab } from "./utils/camel-to-kebab.js";

export interface LoadedFunctionExport {
  exportName: string;
  commandName: string;
  fn: (...args: unknown[]) => unknown;
}

export interface LoadedModule {
  modulePath: string;
  absolutePath: string;
  namespace: Record<string, unknown>;
  functionExports: LoadedFunctionExport[];
}

const SUPPORTED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const RESERVED_COMMAND_NAMES = new Set(["help", "version"]);

const isCallableValue = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === "function";

const isClassConstructor = (value: (...args: unknown[]) => unknown): boolean =>
  /^\s*class\b/.test(Function.prototype.toString.call(value));

export const loadModule = async (modulePath: string): Promise<LoadedModule> => {
  const absolutePath = resolve(process.cwd(), modulePath);
  const extension = extname(absolutePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`unsupported module extension: "${extension}"`);
  }

  const moduleHref = pathToFileURL(absolutePath).href;
  const importedNamespace: Record<string, unknown> = await import(moduleHref);

  const functionExports: LoadedFunctionExport[] = [];
  for (const [exportName, exportedValue] of Object.entries(importedNamespace)) {
    if (exportName === "__esModule") continue;
    if (!isCallableValue(exportedValue)) continue;
    if (isClassConstructor(exportedValue)) continue;

    const commandName = exportName === "default" ? "default" : camelToKebab(exportName);

    if (RESERVED_COMMAND_NAMES.has(commandName)) {
      process.stderr.write(
        `js-to-cli: skipping export "${exportName}" — collides with reserved command name\n`,
      );
      continue;
    }

    functionExports.push({ exportName, commandName, fn: exportedValue });
  }

  if (functionExports.length === 0) {
    throw new Error(`no exported functions found in ${modulePath}`);
  }

  return { modulePath, absolutePath, namespace: importedNamespace, functionExports };
};
