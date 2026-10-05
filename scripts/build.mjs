import { chmodSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectDirectory, "workflow", "dist");

rmSync(outputDirectory, { recursive: true, force: true });
execFileSync("tsc", ["-p", join(projectDirectory, "tsconfig.build.json")], {
  cwd: projectDirectory,
  stdio: "inherit",
});

for (const entryPoint of [
  "app/login.js",
  "app/mark-read.js",
  "app/timeline-params-converter.js",
  "app/subscriptions.js",
  "app/timeline.js",
  "app/unread.js",
  "app/resource-url.js",
]) {
  chmodSync(join(outputDirectory, entryPoint), 0o755);
}
