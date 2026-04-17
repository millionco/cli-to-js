import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { server, LanguageService } from "typescript";
import type { CliSchema } from "../parse-help-text.js";
import { scanCliCalls } from "./scan.js";
import { resolveBinarySchema, type BinaryResolution } from "./resolve.js";
import { emitAugmentation, type EmitInput } from "./emit.js";
import { PLUGIN_RESOLVE_TIMEOUT_MS, PLUGIN_REGENERATE_DEBOUNCE_MS } from "../constants.js";

interface PluginConfig {
  disabled?: boolean;
  timeout?: number;
  helpFlag?: string;
  allowList?: string[];
  denyList?: string[];
}

interface BinaryCacheEntry extends BinaryResolution {
  helpFlag: string;
}

const SUPPRESS_ENV_VAR = "CLI_TO_JS_PLUGIN_DISABLE";

const projectHash = (projectDirectory: string): string =>
  crypto.createHash("sha1").update(projectDirectory).digest("hex").slice(0, 16);

const pluginInit: server.PluginModuleFactory = ({ typescript: tsModule }) => {
  return {
    create(info) {
      const rawConfig = (info.config ?? {}) as PluginConfig;
      const disabled = Boolean(rawConfig.disabled) || process.env[SUPPRESS_ENV_VAR] === "1";
      if (disabled) {
        return info.languageService;
      }

      const resolveTimeout = rawConfig.timeout ?? PLUGIN_RESOLVE_TIMEOUT_MS;
      const helpFlag = rawConfig.helpFlag ?? "--help";
      const allowList = rawConfig.allowList ? new Set(rawConfig.allowList) : null;
      const denyList = rawConfig.denyList ? new Set(rawConfig.denyList) : null;

      const projectDirectory = info.project.getCurrentDirectory();
      const virtualDirectory = path.join(
        os.tmpdir(),
        "cli-to-js-plugin",
        projectHash(projectDirectory),
      );
      const virtualFilePath = path.join(virtualDirectory, "augmentations.d.ts");

      const binaryCache = new Map<string, BinaryCacheEntry>();
      const inflightResolutions = new Map<string, Promise<void>>();
      let lastWrittenContent = "";
      let lastScanSignature = "";
      let debounceHandle: NodeJS.Timeout | null = null;

      try {
        fs.mkdirSync(virtualDirectory, { recursive: true });
        const initialContent = buildCurrentContent(binaryCache);
        fs.writeFileSync(virtualFilePath, initialContent);
        lastWrittenContent = initialContent;
      } catch (initError) {
        info.project.projectService.logger.info(
          `cli-to-js/plugin could not create augmentations file: ${String(initError)}`,
        );
        return info.languageService;
      }

      const host = info.languageServiceHost;
      const originalGetScriptFileNames = host.getScriptFileNames.bind(host);
      host.getScriptFileNames = () => {
        const existing = originalGetScriptFileNames();
        if (existing.includes(virtualFilePath)) return existing;
        return [...existing, virtualFilePath];
      };

      const isBinaryPermitted = (binaryName: string): boolean => {
        if (denyList?.has(binaryName)) return false;
        if (allowList && !allowList.has(binaryName)) return false;
        return /^[A-Za-z0-9_.-]+$/.test(binaryName);
      };

      const refreshVirtualFile = (): void => {
        const nextContent = buildCurrentContent(binaryCache);
        if (nextContent === lastWrittenContent) return;
        try {
          fs.writeFileSync(virtualFilePath, nextContent);
          lastWrittenContent = nextContent;
        } catch (writeError) {
          info.project.projectService.logger.info(
            `cli-to-js/plugin could not update augmentations file: ${String(writeError)}`,
          );
          return;
        }
        info.project.refreshDiagnostics();
      };

      const beginResolution = (binaryName: string): void => {
        if (inflightResolutions.has(binaryName)) return;
        binaryCache.set(binaryName, {
          status: "pending",
          schema: null,
          error: null,
          resolvedAt: 0,
          helpFlag,
        });
        const pending = resolveBinarySchema(binaryName, {
          timeout: resolveTimeout,
          helpFlag,
        })
          .then((resolution) => {
            binaryCache.set(binaryName, { ...resolution, helpFlag });
            refreshVirtualFile();
          })
          .catch((caught) => {
            const message = caught instanceof Error ? caught.message : String(caught);
            binaryCache.set(binaryName, {
              status: "error",
              schema: null,
              error: message,
              resolvedAt: Date.now(),
              helpFlag,
            });
            refreshVirtualFile();
          })
          .finally(() => {
            inflightResolutions.delete(binaryName);
          });
        inflightResolutions.set(binaryName, pending);
      };

      const scanAndQueue = (): void => {
        const program = info.languageService.getProgram();
        if (!program) return;
        const calls = scanCliCalls(program, tsModule);
        const unique = new Set<string>();
        for (const call of calls) {
          if (isBinaryPermitted(call.binaryName)) {
            unique.add(call.binaryName);
          }
        }

        const signature = [...unique].sort().join("\u0000");
        if (signature === lastScanSignature) return;
        lastScanSignature = signature;

        for (const binaryName of unique) {
          if (!binaryCache.has(binaryName)) {
            beginResolution(binaryName);
          }
        }
      };

      const scheduleScan = (): void => {
        if (debounceHandle) return;
        debounceHandle = setTimeout(() => {
          debounceHandle = null;
          try {
            scanAndQueue();
          } catch (scanError) {
            info.project.projectService.logger.info(
              `cli-to-js/plugin scan failed: ${String(scanError)}`,
            );
          }
        }, PLUGIN_REGENERATE_DEBOUNCE_MS);
      };

      scheduleScan();

      const proxy: LanguageService = Object.create(null);
      const methodNames = Object.keys(info.languageService) as Array<keyof LanguageService>;
      for (const methodName of methodNames) {
        const originalMethod = info.languageService[methodName];
        if (typeof originalMethod !== "function") {
          (proxy[methodName] as unknown) = originalMethod;
          continue;
        }
        (proxy[methodName] as unknown) = (...callArgs: unknown[]) => {
          scheduleScan();
          return (originalMethod as (...innerArgs: unknown[]) => unknown).apply(
            info.languageService,
            callArgs,
          );
        };
      }

      return proxy;
    },
  };
};

const buildCurrentContent = (
  binaryCache: ReadonlyMap<string, { schema: CliSchema | null; error: string | null }>,
): string => {
  const inputs: EmitInput[] = [];
  for (const [binaryName, entry] of binaryCache) {
    inputs.push({ binaryName, schema: entry.schema, error: entry.error });
  }
  return emitAugmentation(inputs);
};

export default pluginInit;
