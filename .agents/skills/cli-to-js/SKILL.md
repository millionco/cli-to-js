---
name: cli-to-js
description: Use when wrapping CLI binaries in JavaScript, automating shell workflows in TypeScript, composing multiple CLIs into scripts, or building agent tool-use. Covers convertCliToJs, $command, $validate, $spawn, script(), .text()/.lines()/.json() output parsing.
---

# cli-to-js

You are using cli-to-js to turn CLI binaries into callable JavaScript APIs.

## REQUIRED for every cli-to-js usage:

1. Call `convertCliToJs("binary")` once, reuse the returned API
2. Use `.text()`, `.lines()`, or `.json()` for typed output — never manually split `result.stdout`
3. Use `$validate` before executing when inputs come from untrusted sources
4. Use `$spawn` + `for await` for streaming — never callbacks unless specifically asked

## Flag mapping

```ts
// JS option key            → CLI output
// { verbose: true }        → --verbose
// { verbose: false }       → (omitted)
// { output: "file.txt" }   → --output file.txt
// { dryRun: true }         → --dry-run
// { v: true }              → -v
// { include: ["a", "b"] }  → --include a --include b
// { _: ["file.txt"] }      → file.txt
```

## API quick reference

```ts
import { convertCliToJs, script } from "cli-to-js";
const tool = await convertCliToJs("binary-name");

// Run + typed output
await tool.subcommand({ flag: "val", _: ["pos"] }).text();
await tool.subcommand({ json: true }).json<MyType>();
await tool.subcommand().lines();

// Streaming
for await (const line of tool.$spawn.subcommand({ watch: true })) {}

// Validation (did-you-mean, choices, required flags, exclusive flags)
const errors = tool.$validate({ misspeled: true });

// Shell string without executing
tool.$command.subcommand({ flag: "val" });
// → "binary-name subcommand --flag val"

// Compose into runnable script
const deploy = script(git.$command.push(), docker.$command.build({ tag: "app", _: ["."] }));
deploy.run();              // execute with &&
console.log(`${deploy}`);  // get the string
```

## When building tools

**Bad:**
```ts
const result = await api.status();
const lines = result.stdout.trim().split("\n");
```

**Good:**
```ts
const statusLines = await api.status().lines();
```

**Bad:**
```ts
const api1 = await convertCliToJs("git");
const api2 = await convertCliToJs("git"); // wasteful duplicate
```

**Good:**
```ts
const git = await convertCliToJs("git");
// reuse git everywhere
```

**Bad:**
```ts
await api.commit({ mesage: "fix" }); // typo silently becomes unknown flag
```

**Good:**
```ts
const errors = api.$validate({ mesage: "fix" });
// [{ kind: "unknown-flag", suggestion: "message" }]
if (errors.length > 0) throw new Error(errors[0].message);
await api.commit({ message: "fix" });
```

## Multi-CLI workflow pattern

```ts
const git = await convertCliToJs("git");
const claude = await convertCliToJs("claude");

const files = await git.diff({ nameOnly: true, _: ["HEAD~1"] }).lines();

for (const file of files) {
  const review = await claude({
    print: true,
    model: "sonnet",
    _: [`Review ${file} for bugs`],
  }).text();

  if (review.includes("no issues")) continue;
  console.log(`${file}: ${review}`);
}
```

## Full API surface

| Method                       | Returns            | Use for                        |
|------------------------------|--------------------|--------------------------------|
| `api.sub(opts)`              | `CommandPromise`   | Run subcommand                 |
| `.text()`                    | `Promise<string>`  | Trimmed stdout                 |
| `.lines()`                   | `Promise<string[]>`| Split by newlines              |
| `.json<T>()`                 | `Promise<T>`       | Parse JSON output              |
| `api.$spawn.sub(opts)`       | `CommandProcess`   | `for await` streaming          |
| `api.$command.sub(opts)`     | `string`           | Shell string, no execution     |
| `api.$validate(opts)`        | `ValidationError[]`| Pre-flight flag checking       |
| `api.$validate("sub", opts)` | `ValidationError[]`| Subcommand flag checking       |
| `api.$schema`                | `CliSchema`        | Parsed schema from --help      |
| `api.$parse("sub")`          | `ParsedCommand`    | Lazily enrich subcommand       |
| `script(...cmds)`            | `{ run, toString }`| Compose && chain               |
