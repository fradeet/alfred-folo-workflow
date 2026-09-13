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

for (const entryPoint of ["login.js", "subscriptions.js", "timeline.js", "unread.js"]) {
  chmodSync(join(outputDirectory, entryPoint), 0o755);
}
