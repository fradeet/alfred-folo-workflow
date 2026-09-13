import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workflowDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(workflowDirectory, "node_modules", "folocli", "dist", "index.js");

export class FoloError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FoloError";
    this.code = code;
  }
}

export function runFolo(arguments_, options = {}) {
  const result = spawnSync(process.execPath, [cliEntry, "--format", "json", ...arguments_], {
    encoding: "utf8",
    env: process.env,
    timeout: options.timeout ?? 20_000,
  });

  if (result.error) {
    const code = result.error.code === "ETIMEDOUT" ? "TIMEOUT" : "CLI_ERROR";
    throw new FoloError(code, result.error.message);
  }

  const rawOutput = result.status === 0 ? result.stdout : result.stderr;
  let envelope;

  try {
    envelope = JSON.parse(rawOutput);
  } catch {
    throw new FoloError(
      "INVALID_RESPONSE",
      (result.stderr || result.stdout || "Folo CLI returned no output").trim(),
    );
  }

  if (!envelope.ok) {
    throw new FoloError(
      envelope.error?.code ?? "FOLO_ERROR",
      envelope.error?.message ?? "Folo request failed",
    );
  }

  return envelope.data;
}
