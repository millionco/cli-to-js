import {
  definePlugin,
  ToolRegistration,
  ToolId,
  ToolInvocationResult,
  type PluginContext,
  type InvokeOptions,
} from "@executor-js/sdk";
import {
  convertCliToJs,
  fromHelpText,
  type CliApi,
  type CliSchema,
  type CliToJsOptions,
  type CommandResult,
} from "cli-to-js";
import { PLUGIN_KEY, SOURCE_PREFIX, ROOT_TOOL_SUFFIX } from "./constants.js";
import { buildInputSchema } from "./utils/build-input-schema.js";

interface AddBinaryConfig {
  binary: string;
  namespace?: string;
  options?: CliToJsOptions;
}

interface AddHelpTextConfig {
  binary: string;
  helpText: string;
  namespace?: string;
  options?: CliToJsOptions;
}

interface CliPluginExtension {
  addBinary: (config: AddBinaryConfig) => Promise<void>;
  addHelpText: (config: AddHelpTextConfig) => Promise<void>;
  removeBinary: (namespace: string) => Promise<void>;
  list: () => string[];
}

const makeSourceId = (namespace: string): string => `${SOURCE_PREFIX}${namespace}`;

const makeToolId = (namespace: string, toolName: string): string => `${namespace}.${toolName}`;

const formatCommandResult = (
  result: CommandResult,
): { stdout: string; stderr: string; exitCode: number } => ({
  stdout: result.stdout,
  stderr: result.stderr,
  exitCode: result.exitCode,
});

export const cliPlugin = () =>
  definePlugin({
    key: PLUGIN_KEY,
    init: async (ctx: PluginContext) => {
      const registeredApis = new Map<string, CliApi>();

      await ctx.tools.registerInvoker(PLUGIN_KEY, {
        invoke: async (toolIdString: string, args: unknown, _options: InvokeOptions) => {
          const toolId = String(toolIdString);
          const dotIndex = toolId.indexOf(".");
          if (dotIndex === -1) {
            return new ToolInvocationResult({
              data: null,
              error: `Invalid tool ID format: "${toolId}". Expected "namespace.command".`,
            });
          }

          const namespace = toolId.slice(0, dotIndex);
          const commandName = toolId.slice(dotIndex + 1);
          const api = registeredApis.get(namespace);

          if (!api) {
            return new ToolInvocationResult({
              data: null,
              error: `No CLI binary registered under namespace "${namespace}".`,
            });
          }

          const options = (args ?? {}) as Record<string, unknown>;

          try {
            let result: CommandResult;

            if (commandName === ROOT_TOOL_SUFFIX) {
              result = await api(options);
            } else {
              result = await api(commandName, options);
            }

            return new ToolInvocationResult({
              data: formatCommandResult(result),
              error: null,
            });
          } catch (invocationError) {
            return new ToolInvocationResult({
              data: null,
              error:
                invocationError instanceof Error
                  ? invocationError.message
                  : String(invocationError),
            });
          }
        },
      });

      const registerToolsFromSchema = async (
        namespace: string,
        schema: CliSchema,
      ): Promise<void> => {
        const sourceId = makeSourceId(namespace);
        const toolRegistrations: ToolRegistration[] = [];

        const rootToolId = makeToolId(namespace, ROOT_TOOL_SUFFIX);
        const rootInputSchema = buildInputSchema(
          schema.command.flags,
          schema.command.positionalArgs,
        );

        toolRegistrations.push(
          new ToolRegistration({
            id: ToolId.make(rootToolId),
            pluginKey: PLUGIN_KEY,
            sourceId,
            name: ROOT_TOOL_SUFFIX,
            description: schema.command.description
              ? `Run ${schema.binaryName}: ${schema.command.description}`
              : `Run ${schema.binaryName}`,
            inputSchema: rootInputSchema,
          }),
        );

        for (const subcommand of schema.command.subcommands) {
          const subcommandToolId = makeToolId(namespace, subcommand.name);
          const subcommandFlags = subcommand.flags ?? [];
          const subcommandPositionals = subcommand.positionalArgs ?? [];
          const subcommandInputSchema = buildInputSchema(subcommandFlags, subcommandPositionals);

          toolRegistrations.push(
            new ToolRegistration({
              id: ToolId.make(subcommandToolId),
              pluginKey: PLUGIN_KEY,
              sourceId,
              name: subcommand.name,
              description: subcommand.description
                ? `${schema.binaryName} ${subcommand.name}: ${subcommand.description}`
                : `${schema.binaryName} ${subcommand.name}`,
              inputSchema: subcommandInputSchema,
            }),
          );
        }

        await ctx.tools.register(toolRegistrations);
      };

      const addBinary = async (config: AddBinaryConfig): Promise<void> => {
        const namespace = config.namespace ?? config.binary;
        const api = await convertCliToJs(config.binary, config.options);
        registeredApis.set(namespace, api);
        await registerToolsFromSchema(namespace, api.$schema);
      };

      const addHelpText = async (config: AddHelpTextConfig): Promise<void> => {
        const namespace = config.namespace ?? config.binary;
        const api = fromHelpText(config.binary, config.helpText, config.options);
        registeredApis.set(namespace, api);
        await registerToolsFromSchema(namespace, api.$schema);
      };

      const removeBinary = async (namespace: string): Promise<void> => {
        registeredApis.delete(namespace);
        const sourceId = makeSourceId(namespace);
        await ctx.tools.unregisterBySource(sourceId);
      };

      const listRegistered = (): string[] => [...registeredApis.keys()];

      return {
        extension: {
          addBinary,
          addHelpText,
          removeBinary,
          list: listRegistered,
        } satisfies CliPluginExtension,
        close: async () => {
          for (const namespace of registeredApis.keys()) {
            const sourceId = makeSourceId(namespace);
            await ctx.tools.unregisterBySource(sourceId);
          }
          registeredApis.clear();
        },
      };
    },
  });

export type { AddBinaryConfig, AddHelpTextConfig, CliPluginExtension };
