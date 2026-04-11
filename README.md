# cli-to-js

> **Warning:** This project is very experimental. APIs may change without notice.

Turn any CLI into a JavaScript API — automatically. Give it a binary name, it reads `--help`, and hands you back a fully typed object where subcommands are methods, flags are options, and everything just works.

```ts
import { convertCliToJs } from "cli-to-js";

const git = await convertCliToJs("git");

// git commit --message "initial commit" --all
await git.commit({ message: "initial commit", all: true });

// git push --force
await git.push({ force: true });

// git log --oneline main..HEAD
const { stdout } = await git.log({ oneline: true, _: ["main..HEAD"] });
const commits = stdout.trim().split("\n");

const docker = await convertCliToJs("docker");

// docker build --tag my-app:latest --file Dockerfile .
await docker.build({ tag: `my-app:${commits[0].slice(0, 7)}`, file: "Dockerfile", _: ["."] });
```

No manual wrappers. No codegen step. No config. One function call turns `git`, `docker`, `kubectl`, `ffmpeg` — anything with `--help` — into a typed, callable API. Compose them together with plain JavaScript.

**Built for AI agents.** Agents call CLIs dynamically but hallucinate flag names and forget required args. `$validate` catches mistakes before spawning a process, with did-you-mean suggestions an agent can self-correct from. `$spawn` returns a standard async iterator, so piping and streaming is just a `for await` loop — the most in-distribution JS pattern for any model.

## Install

```sh
npm install cli-to-js
```

## Quick start

`convertCliToJs` runs `--help` on the binary, parses the output into a schema, and returns a Proxy-based API where every subcommand is a method and every flag is an option.

```ts
import { convertCliToJs } from "cli-to-js";

const api = await convertCliToJs("my-tool");

// Subcommand as a method
const result = await api.build({ output: "dist", minify: true });
// → my-tool build --output dist --minify

console.log(result.stdout);
console.log(result.exitCode);
```

Here's how JS option keys map to CLI flags:

| JS option                 | CLI output                |
| ------------------------- | ------------------------- |
| `{ verbose: true }`       | `--verbose`               |
| `{ verbose: false }`      | _(omitted)_               |
| `{ output: "file.txt" }`  | `--output file.txt`       |
| `{ dryRun: true }`        | `--dry-run`               |
| `{ v: true }`             | `-v`                      |
| `{ include: ["a", "b"] }` | `--include a --include b` |
| `{ _: ["file.txt"] }`     | `file.txt`                |

## TypeScript

The API is fully typed out of the box — every subcommand returns `Promise<CommandResult>`, and `$schema`, `$parse`, `$spawn` are all properly typed. No codegen needed.

For per-subcommand option types, pass a generic:

```ts
const git = await convertCliToJs<{
  commit: { message?: string; all?: boolean; amend?: boolean };
  push: { force?: boolean; setUpstream?: string };
}>("git");

git.commit({ message: "hello" }); // message autocompletes as string
git.push({ foobar: true }); // type error
```

Or generate a `.d.ts` from the parsed schema:

```sh
npx cli-to-js git --dts --subcommands -o git.d.ts
```

## From a help text string

If you already have the help text, skip the binary lookup:

```ts
import { fromHelpText } from "cli-to-js";

const api = fromHelpText("my-tool", helpTextString);
await api.build({ watch: true });
```

## Subcommand parsing

By default, only the root `--help` is parsed. Enable `subcommands` to also parse every subcommand's help text and populate its flags in the schema:

```ts
const git = await convertCliToJs("git", { subcommands: true });

// Schema now includes each subcommand's flags
const commitFlags = git.$schema.command.subcommands.find((s) => s.name === "commit")?.flags;
```

Or parse on demand:

```ts
const git = await convertCliToJs("git");

// Parse one subcommand lazily
const commitSchema = await git.$parse("commit");
console.log(commitSchema.flags);

// Parse all discovered subcommands
await git.$parse();
```

Handles commander-style aliases (`init|setup`, `add|install`) — the primary name is used.

## Validation

Validate options against the parsed schema before running a command. Returns an array of structured errors — empty means valid.

```ts
const git = await convertCliToJs("git", { subcommands: true });

const errors = git.$validate("commit", { massage: "fix typo" });
// => [{ kind: "unknown-flag", name: "massage", suggestion: "message",
//       message: 'Unknown flag "massage". Did you mean "message"?' }]

if (errors.length === 0) {
  await git.commit({ message: "fix typo" });
}
```

Checks for unknown flags (with Levenshtein-based suggestions), type mismatches (boolean vs value-taking), missing required positionals, and too many positionals.

For root command validation, pass options directly:

```ts
const errors = git.$validate({ unknownFlag: true });
```

For subcommand validation, the subcommand must be enriched first (via `subcommands: true` or `$parse("name")`).

Or use `validateOptions` directly with any `ParsedCommand`:

```ts
import { validateOptions } from "cli-to-js";

const errors = validateOptions(schema.command, { verbose: "wrong" });
```

## Streaming

### Callbacks

Get real-time output while still receiving the buffered result:

```ts
const result = await api.build(
  { watch: true },
  {
    onStdout: (data) => process.stdout.write(data),
    onStderr: (data) => process.stderr.write(data),
  },
);
```

### Async iterator

`spawnCommand` and `$spawn` return a `CommandProcess` with raw streams and an async iterator that yields stdout lines:

```ts
const proc = api.$spawn.test({ _: ["--watch"] });

for await (const line of proc) {
  console.log(line);
}

console.log("exited with:", await proc.exitCode);
```

Or use `spawnCommand` directly:

```ts
import { spawnCommand } from "cli-to-js";

const proc = spawnCommand("npm", ["run", "dev"]);
for await (const line of proc) {
  if (line.includes("ready")) console.log("Server is up");
}
```

### stdio inherit

Pass stdio through to the parent terminal for interactive CLIs:

```ts
await api.login({}, { stdio: "inherit" });
```

## Per-call config

Every method accepts an optional second argument for execution config:

```ts
const controller = new AbortController();

await api.build(
  {},
  {
    cwd: "/my/project",
    env: { NODE_ENV: "production" },
    timeout: 60_000,
    signal: controller.signal,
  },
);
```

## CLI

Generate a standalone JS/TS wrapper for any CLI tool:

```sh
npx cli-to-js git                          # TypeScript to stdout
npx cli-to-js git -o git.ts               # write to file
npx cli-to-js git --js -o git.js          # plain JavaScript
npx cli-to-js git --subcommands -o git.ts  # include per-subcommand flags
npx cli-to-js git --dts -o git.d.ts       # generate type declarations only
npx cli-to-js git --json                   # dump raw schema as JSON
```

The generated code is **standalone** — it embeds a tiny runtime (spawn + options-to-args) and has zero dependencies on `cli-to-js`. Drop it into any project and it just works.

## API

### `convertCliToJs<T>(binary, options?)`

Runs `--help`, parses the output, returns the API proxy. Accepts an optional generic `T` for per-subcommand option types.

| Option        | Type         | Default    | Description                                |
| ------------- | ------------ | ---------- | ------------------------------------------ |
| `helpFlag`    | `string`     | `"--help"` | Flag to get help text                      |
| `timeout`     | `number`     | `10000`    | Timeout for help text fetch (ms)           |
| `cwd`         | `string`     | -          | Default working directory for all commands |
| `env`         | `ProcessEnv` | -          | Default environment for all commands       |
| `subcommands` | `boolean`    | `false`    | Parse all subcommand help texts eagerly    |

### `fromHelpText<T>(binary, helpText, options?)`

Same as `convertCliToJs` but from a static help text string. Accepts `cwd` and `env` options.

### API proxy (`CliApi<T>`)

The returned proxy is both callable and has subcommand methods:

| Access                           | Description                            |
| -------------------------------- | -------------------------------------- |
| `api.sub({ flag: val })`         | Run subcommand with options            |
| `api.sub({ flag: val }, config)` | Run subcommand with per-call config    |
| `api("sub", { flag: val })`      | Run subcommand by name                 |
| `api({ flag: val })`             | Run root command                       |
| `api.$schema`                    | Parsed `CliSchema`                     |
| `api.$validate(opts)`            | Validate options against root schema   |
| `api.$validate("sub", opts)`     | Validate options against subcommand    |
| `api.$spawn.sub(opts)`           | Spawn subcommand, get `CommandProcess` |
| `api.$parse("sub")`              | Lazily parse a subcommand's help text  |
| `api.$parse()`                   | Parse all subcommand help texts        |

### `RunConfig`

| Option     | Type                     | Default  | Description               |
| ---------- | ------------------------ | -------- | ------------------------- |
| `timeout`  | `number`                 | `30000`  | Command timeout (ms)      |
| `signal`   | `AbortSignal`            | -        | Abort signal              |
| `cwd`      | `string`                 | -        | Working directory         |
| `env`      | `ProcessEnv`             | -        | Environment variables     |
| `stdio`    | `"pipe" \| "inherit"`    | `"pipe"` | stdio mode                |
| `onStdout` | `(data: string) => void` | -        | Real-time stdout callback |
| `onStderr` | `(data: string) => void` | -        | Real-time stderr callback |

Color output (`FORCE_COLOR`, `CLICOLOR_FORCE`) is auto-detected — it's enabled when streaming callbacks are provided and the parent process is connected to a TTY. To force it manually, pass `env: { ...process.env, FORCE_COLOR: "1" }`.

### `CommandResult`

```ts
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

### `CommandProcess`

Returned by `spawnCommand` and `$spawn`:

```ts
interface CommandProcess {
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  pid: number | undefined;
  kill: (signal?) => boolean;
  exitCode: Promise<number>;
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;
}
```

## License

MIT © Million Software, Inc.
