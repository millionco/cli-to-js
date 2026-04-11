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
  type ParsedSubcommand,
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

const parseToolId = (toolId: string): { namespace: string; command: string } | null => {
  const dotIndex = toolId.indexOf(".");
  if (dotIndex === -1) return null;
  return { namespace: toolId.slice(0, dotIndex), command: toolId.slice(dotIndex + 1) };
};

const describeCommand = (binaryName: string, label: string, description: string): string =>
  description ? `${binaryName} ${label}: ${description}` : `${binaryName} ${label}`;

const subcommandToRegistration = (
  namespace: string,
  sourceId: string,
  binaryName: string,
  subcommand: ParsedSubcommand,
): ToolRegistration =>
  new ToolRegistration({
    id: ToolId.make(`${namespace}.${subcommand.name}`),
    pluginKey: PLUGIN_KEY,
    sourceId,
    name: subcommand.name,
    description: describeCommand(binaryName, subcommand.name, subcommand.description),
    inputSchema: buildInputSchema(subcommand.flags ?? [], subcommand.positionalArgs ?? []),
  });

export const cliPlugin = () =>
  definePlugin({
    key: PLUGIN_KEY,
    init: async (ctx: PluginContext) => {
      const registeredApis = new Map<string, CliApi>();

      await ctx.tools.registerInvoker(PLUGIN_KEY, {
        invoke: async (toolIdString: string, args: unknown, _options: InvokeOptions) => {
          const parsed = parseToolId(toolIdString);
          if (!parsed) {
            return new ToolInvocationResult({
              data: null,
              error: `Invalid tool ID format: "${toolIdString}". Expected "namespace.command".`,
            });
          }

          const api = registeredApis.get(parsed.namespace);
          if (!api) {
            return new ToolInvocationResult({
              data: null,
              error: `No CLI binary registered under namespace "${parsed.namespace}".`,
            });
          }

          try {
            const options = (args ?? {}) as Record<string, unknown>;
            const result =
              parsed.command === ROOT_TOOL_SUFFIX
                ? await api(options)
                : await api(parsed.command, options);

            return new ToolInvocationResult({ data: result, error: null });
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
        const sourceId = `${SOURCE_PREFIX}${namespace}`;
        const { binaryName, command } = schema;

        const rootRegistration = new ToolRegistration({
          id: ToolId.make(`${namespace}.${ROOT_TOOL_SUFFIX}`),
          pluginKey: PLUGIN_KEY,
          sourceId,
          name: ROOT_TOOL_SUFFIX,
          description: describeCommand(binaryName, ROOT_TOOL_SUFFIX, command.description),
          inputSchema: buildInputSchema(command.flags, command.positionalArgs),
        });

        const subcommandRegistrations = command.subcommands.map((subcommand) =>
          subcommandToRegistration(namespace, sourceId, binaryName, subcommand),
        );

        await ctx.tools.register([rootRegistration, ...subcommandRegistrations]);
      };

      const registerApi = async (namespace: string, api: CliApi): Promise<void> => {
        registeredApis.set(namespace, api);
        await registerToolsFromSchema(namespace, api.$schema);
      };

      const addBinary = async (config: AddBinaryConfig): Promise<void> => {
        const namespace = config.namespace ?? config.binary;
        const api = await convertCliToJs(config.binary, config.options);
        await registerApi(namespace, api);
      };

      const addHelpText = async (config: AddHelpTextConfig): Promise<void> => {
        const namespace = config.namespace ?? config.binary;
        const api = fromHelpText(config.binary, config.helpText, config.options);
        await registerApi(namespace, api);
      };

      const removeBinary = async (namespace: string): Promise<void> => {
        registeredApis.delete(namespace);
        await ctx.tools.unregisterBySource(`${SOURCE_PREFIX}${namespace}`);
      };

      return {
        extension: {
          addBinary,
          addHelpText,
          removeBinary,
          list: () => [...registeredApis.keys()],
        } satisfies CliPluginExtension,
        close: async () => {
          await Promise.all(
            [...registeredApis.keys()].map((namespace) =>
              ctx.tools.unregisterBySource(`${SOURCE_PREFIX}${namespace}`),
            ),
          );
          registeredApis.clear();
        },
      };
    },
  });

export type { AddBinaryConfig, AddHelpTextConfig, CliPluginExtension };
