import { spawnCommand, type RunConfig, type CommandProcess } from "./exec.js";
import { StringDecoder } from "node:string_decoder";
import type { AsyncTransform } from "./utils/async-iterable.js";

const COMMAND_STEP_TAG = Symbol("commandStep");

interface TaggedCommandStep {
  [COMMAND_STEP_TAG]: true;
  spawn: () => CommandProcess;
}

type PipelineStep = AsyncTransform | TaggedCommandStep;

const isTaggedCommandStep = (step: PipelineStep): step is TaggedCommandStep =>
  typeof step === "object" && COMMAND_STEP_TAG in step;

const feedStdin = async (process: CommandProcess, source: AsyncIterable<string>): Promise<void> => {
  if (!process.stdin) return;
  try {
    for await (const line of source) {
      const canContinue = process.stdin.write(line + "\n");
      if (!canContinue) {
        await new Promise<void>((resolve) => process.stdin!.once("drain", resolve));
      }
    }
  } catch {
    /* stdin may close early if the process exits (e.g. head -n 1) */
  } finally {
    process.stdin.end();
  }
};

const linesFromProcess = async function* (process: CommandProcess): AsyncIterable<string> {
  if (!process.stdout) return;

  const decoder = new StringDecoder("utf-8");
  let buffer = "";

  for await (const chunk of process.stdout) {
    buffer += decoder.write(chunk);
    const segments = buffer.split("\n");
    buffer = segments.pop() ?? "";
    for (const segment of segments) {
      yield segment;
    }
  }

  buffer += decoder.end();
  if (buffer) {
    yield buffer;
  }
};

const executeCommandStep = (
  step: TaggedCommandStep,
  source: AsyncIterable<string>,
): AsyncIterable<string> => {
  const process = step.spawn();
  feedStdin(process, source);
  return linesFromProcess(process);
};

const executeStep = (step: PipelineStep, source: AsyncIterable<string>): AsyncIterable<string> => {
  if (isTaggedCommandStep(step)) {
    return executeCommandStep(step, source);
  }
  return step(source);
};

export const createCommandStep = (
  binaryName: string,
  subcommands: string[],
  options: Record<string, unknown>,
  config: RunConfig,
): TaggedCommandStep => ({
  [COMMAND_STEP_TAG]: true,
  spawn: () => spawnCommand(binaryName, subcommands, options, config),
});

const EMPTY_ASYNC_ITERABLE: AsyncIterable<string> = {
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true as const, value: undefined }),
  }),
};

export class Pipeline {
  private readonly steps: PipelineStep[];
  private readonly binaryName: string;
  private readonly defaultConfig: RunConfig;

  constructor(binaryName: string, steps: PipelineStep[] = [], defaultConfig: RunConfig = {}) {
    this.steps = steps;
    this.binaryName = binaryName;
    this.defaultConfig = defaultConfig;
  }

  pipe(step: AsyncTransform): Pipeline;
  pipe(
    binaryName: string,
    subcommands: string[],
    options?: Record<string, unknown>,
    config?: RunConfig,
  ): Pipeline;
  pipe(
    stepOrBinary: AsyncTransform | string,
    subcommands?: string[],
    options?: Record<string, unknown>,
    config?: RunConfig,
  ): Pipeline {
    if (typeof stepOrBinary === "string") {
      const commandStep = createCommandStep(stepOrBinary, subcommands ?? [], options ?? {}, {
        ...this.defaultConfig,
        ...config,
      });
      return new Pipeline(this.binaryName, [...this.steps, commandStep], this.defaultConfig);
    }
    return new Pipeline(this.binaryName, [...this.steps, stepOrBinary], this.defaultConfig);
  }

  run(): AsyncIterable<string> {
    let currentOutput: AsyncIterable<string> = EMPTY_ASYNC_ITERABLE;

    for (const step of this.steps) {
      currentOutput = executeStep(step, currentOutput);
    }

    return currentOutput;
  }

  async collect(): Promise<string[]> {
    const results: string[] = [];
    for await (const line of this.run()) {
      results.push(line);
    }
    return results;
  }

  async first(): Promise<string | undefined> {
    for await (const line of this.run()) {
      return line;
    }
    return undefined;
  }

  async last(): Promise<string | undefined> {
    let lastLine: string | undefined;
    for await (const line of this.run()) {
      lastLine = line;
    }
    return lastLine;
  }
}

export const createPipelineProxy = (
  binaryName: string,
  defaultConfig: RunConfig = {},
): Pipeline &
  Record<string, (options?: Record<string, unknown>, config?: RunConfig) => Pipeline> => {
  const basePipeline = new Pipeline(binaryName, [], defaultConfig);

  return new Proxy(basePipeline, {
    get(target, property) {
      if (typeof property === "symbol") return Reflect.get(target, property);
      if (property in target) return Reflect.get(target, property);

      return (options: Record<string, unknown> = {}, config: RunConfig = {}): Pipeline => {
        const mergedConfig = { ...defaultConfig, ...config };
        const step = createCommandStep(binaryName, [property], options, mergedConfig);
        return new Pipeline(binaryName, [step], defaultConfig);
      };
    },
  }) as Pipeline &
    Record<string, (options?: Record<string, unknown>, config?: RunConfig) => Pipeline>;
};
