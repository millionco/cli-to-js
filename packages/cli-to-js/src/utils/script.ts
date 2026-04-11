import { execSync } from "node:child_process";

export const script = (...steps: string[]) => ({
  toString: () => steps.join(" && "),
  run: () => execSync(steps.join(" && "), { stdio: "inherit" }),
});
