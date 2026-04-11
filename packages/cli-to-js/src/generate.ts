import type { CliSchema, ParsedFlag, ParsedSubcommand } from "./parse-help-text.js";
import { kebabToCamel } from "./utils/kebab-to-camel.js";
import { SHORT_FLAG_MAX_LENGTH } from "./constants.js";

interface GenerateOptions {
  typescript?: boolean;
}

const toIdentifier = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, character) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[0-9]/, "_$&");

const toPascalCase = (name: string): string => {
  const identifier = toIdentifier(name);
  return identifier.charAt(0).toUpperCase() + identifier.slice(1);
};

const formatFlagComment = (flag: ParsedFlag): string => {
  const nameParts = [];
  if (flag.shortName) nameParts.push(flag.shortName);
  nameParts.push(`--${flag.longName}`);
  const nameStr = nameParts.join(", ");
  if (flag.takesValue && flag.valueName) return `${nameStr} <${flag.valueName}>`;
  return nameStr;
};

const formatSubcommandJsdoc = (
  binaryName: string,
  subcommand: ParsedSubcommand,
  hasTypedInterface: boolean,
): string => {
  const lines = [`/** ${binaryName} ${subcommand.name}`];

  if (subcommand.description) {
    lines.push(` * ${subcommand.description}`);
  }

  if (!hasTypedInterface && subcommand.flags && subcommand.flags.length > 0) {
    lines.push(` *`);
    for (const flag of subcommand.flags) {
      const flagStr = formatFlagComment(flag);
      const desc = flag.description ? ` — ${flag.description}` : "";
      lines.push(` * @param ${flagStr}${desc}`);
    }
  }

  lines.push(` */`);
  return lines.join("\n");
};

const flagToTypeString = (flag: ParsedFlag): string => {
  if (!flag.takesValue) return "boolean";
  if (flag.choices && flag.choices.length > 0) {
    return flag.choices.map((choice) => `"${choice}"`).join(" | ");
  }
  return "string";
};

const generateOptionsInterface = (interfaceName: string, flags: ParsedFlag[]): string => {
  const lines: string[] = [`interface ${interfaceName} {`];

  for (const flag of flags) {
    const propertyName = kebabToCamel(flag.longName);
    const propertyType = flagToTypeString(flag);
    const optionalMarker = flag.isRequired ? "" : "?";

    if (flag.description) {
      lines.push(`  /** ${flag.description} */`);
    }
    lines.push(`  ${propertyName}${optionalMarker}: ${propertyType};`);
  }

  lines.push(`  _?: string | string[];`);
  lines.push(`  [key: string]: unknown;`);
  lines.push(`}`);
  return lines.join("\n");
};

const buildRuntimeTemplate = (typescript: boolean, binaryName: string): string => {
  const typeAnnotation = (annotation: string) => (typescript ? `: ${annotation}` : "");

  let template = `import { spawn } from "node:child_process";\n`;

  if (typescript) {
    template += `
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
`;
  }

  template += `
const BINARY = ${JSON.stringify(binaryName)};

const toArgs = (options${typeAnnotation("Record<string, unknown>")})${typeAnnotation("string[]")} => {
  const flagArgs${typeAnnotation("string[]")} = [];
  const positionalArgs${typeAnnotation("string[]")} = [];
  for (const [key, value] of Object.entries(options)) {
    if (key === "_") {
      if (value == null) continue;
      const pos = Array.isArray(value) ? value : [value];
      positionalArgs.push(...pos.map(String));
      continue;
    }
    const flag = key.startsWith("-")
      ? key
      : key.length <= ${SHORT_FLAG_MAX_LENGTH}
        ? \`-\${key}\`
        : \`--\${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase()}\`;
    if (typeof value === "boolean") {
      if (value) flagArgs.push(flag);
    } else if (Array.isArray(value)) {
      for (const item of value) flagArgs.push(flag, String(item));
    } else if (value != null) {
      flagArgs.push(flag, String(value));
    }
  }
  return [...flagArgs, ...positionalArgs];
};

const run = (subcommand${typeAnnotation("string[]")}, options${typeAnnotation("Record<string, unknown>")} = {})${typeAnnotation("Promise<CommandResult>")} =>
  new Promise((resolve, reject) => {
    const stdoutChunks${typeAnnotation("Buffer[]")} = [];
    const stderrChunks${typeAnnotation("Buffer[]")} = [];
    let spawnError${typeAnnotation("Error | null")} = null;
    const child = spawn(BINARY, [...subcommand, ...toArgs(options)], { windowsHide: true });
    child.stdout?.on("data", (chunk${typeAnnotation("Buffer")}) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk${typeAnnotation("Buffer")}) => stderrChunks.push(chunk));
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (exitCode) => {
      if (spawnError) { reject(spawnError); return; }
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: exitCode ?? 1,
      });
    });
  });`;

  return template;
};

export const generateTypes = (schema: CliSchema): string => {
  const binaryName = schema.binaryName;
  const apiInterfaceName = `${toPascalCase(binaryName)}Api`;

  const lines: string[] = [
    `// Generated by cli-to-js — https://github.com/aidenybai/cli-to-js`,
    ``,
    `import type { CommandResult, RunConfig, CliSchema, CommandProcess, ParsedCommand } from "cli-to-js";`,
    ``,
  ];

  const subcommandMethodLines: string[] = [];
  const spawnMethodLines: string[] = [];

  for (const subcommand of schema.command.subcommands) {
    const identifier = toIdentifier(subcommand.name);
    const hasFlags = Boolean(subcommand.flags && subcommand.flags.length > 0);

    if (hasFlags && subcommand.flags) {
      const interfaceName = `${toPascalCase(subcommand.name)}Options`;
      lines.push(`export ${generateOptionsInterface(interfaceName, subcommand.flags)}`);
      lines.push(``);
      subcommandMethodLines.push(
        `  ${identifier}(options?: ${interfaceName}, config?: RunConfig): Promise<CommandResult>;`,
      );
      spawnMethodLines.push(
        `    ${identifier}(options?: ${interfaceName}, config?: RunConfig): CommandProcess;`,
      );
    } else {
      subcommandMethodLines.push(
        `  ${identifier}(options?: Record<string, unknown>, config?: RunConfig): Promise<CommandResult>;`,
      );
      spawnMethodLines.push(
        `    ${identifier}(options?: Record<string, unknown>, config?: RunConfig): CommandProcess;`,
      );
    }
  }

  const rootHasFlags = Boolean(schema.command.flags && schema.command.flags.length > 0);
  if (rootHasFlags) {
    const rootInterfaceName = `${toPascalCase(binaryName)}Options`;
    lines.push(`export ${generateOptionsInterface(rootInterfaceName, schema.command.flags)}`);
    lines.push(``);
  }

  const rootOptionsType = rootHasFlags
    ? `${toPascalCase(binaryName)}Options`
    : "Record<string, unknown>";

  lines.push(`export interface ${apiInterfaceName} {`);
  lines.push(`  (options?: ${rootOptionsType}, config?: RunConfig): Promise<CommandResult>;`);
  lines.push(
    `  (subcommand: string, options?: Record<string, unknown>, config?: RunConfig): Promise<CommandResult>;`,
  );
  lines.push(``);

  for (const methodLine of subcommandMethodLines) {
    lines.push(methodLine);
  }

  if (subcommandMethodLines.length > 0) lines.push(``);

  lines.push(`  $schema: CliSchema;`);
  lines.push(`  $parse(subcommandName: string): Promise<ParsedCommand | undefined>;`);
  lines.push(`  $parse(): Promise<void>;`);

  lines.push(`  $spawn: {`);
  lines.push(`    (options?: ${rootOptionsType}, config?: RunConfig): CommandProcess;`);
  lines.push(
    `    (subcommand: string, options?: Record<string, unknown>, config?: RunConfig): CommandProcess;`,
  );
  for (const spawnLine of spawnMethodLines) {
    lines.push(spawnLine);
  }
  lines.push(`  };`);

  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
};

export const generate = (schema: CliSchema, options: GenerateOptions = {}): string => {
  const { typescript = true } = options;
  const binaryName = schema.binaryName;
  const rootIdentifier = toIdentifier(binaryName);
  const untypedOptions = typescript ? ": Record<string, unknown> = {}" : " = {}";
  const returnType = typescript ? ": Promise<CommandResult>" : "";

  const lines: string[] = [
    `// Generated by cli-to-js — https://github.com/aidenybai/cli-to-js`,
    ``,
    buildRuntimeTemplate(typescript, binaryName),
  ];

  if (schema.command.subcommands.length > 0) {
    lines.push(``);

    for (const subcommand of schema.command.subcommands) {
      const identifier = toIdentifier(subcommand.name);
      const hasFlags = Boolean(typescript && subcommand.flags && subcommand.flags.length > 0);

      lines.push(``);

      if (hasFlags && subcommand.flags) {
        const interfaceName = `${toPascalCase(subcommand.name)}Options`;
        lines.push(generateOptionsInterface(interfaceName, subcommand.flags));
        lines.push(``);
        lines.push(formatSubcommandJsdoc(binaryName, subcommand, true));
        lines.push(
          `export const ${identifier} = (options: ${interfaceName} = {})${returnType} =>`,
          `  run([${JSON.stringify(subcommand.name)}], options);`,
        );
      } else {
        lines.push(formatSubcommandJsdoc(binaryName, subcommand, false));
        lines.push(
          `export const ${identifier} = (options${untypedOptions})${returnType} =>`,
          `  run([${JSON.stringify(subcommand.name)}], options);`,
        );
      }
    }
  }

  const rootHasFlags = Boolean(
    typescript && schema.command.flags && schema.command.flags.length > 0,
  );

  lines.push(``);

  if (rootHasFlags) {
    const rootInterfaceName = `${toPascalCase(binaryName)}Options`;
    lines.push(generateOptionsInterface(rootInterfaceName, schema.command.flags));
    lines.push(``);
    lines.push(`/** Run ${binaryName} directly */`);
    lines.push(
      `export const ${rootIdentifier} = (options: ${rootInterfaceName} = {})${returnType} =>`,
      `  run([], options);`,
    );
  } else {
    lines.push(`/** Run ${binaryName} directly */`);
    lines.push(
      `export const ${rootIdentifier} = (options${untypedOptions})${returnType} =>`,
      `  run([], options);`,
    );
  }

  lines.push(``);
  lines.push(`export default ${rootIdentifier};`);
  lines.push(``);

  return lines.join("\n");
};
