import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workflowDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(workflowDirectory, "node_modules", "folocli", "dist", "index.js");

export interface RunFoloOptions {
  timeout?: number;
}

export type FoloDecoder<T> = (value: unknown) => T;

export class FoloError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FoloError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseFoloEnvelope(rawOutput: string, fallbackMessage?: string): unknown {
  let envelope: unknown;

  try {
    envelope = JSON.parse(rawOutput) as unknown;
  } catch {
    throw new FoloError("INVALID_RESPONSE", fallbackMessage || "Folo CLI returned no output");
  }

  if (!isRecord(envelope) || typeof envelope.ok !== "boolean") {
    throw new FoloError("INVALID_RESPONSE", "Folo CLI returned an invalid response envelope");
  }

  if (!envelope.ok) {
    const error = isRecord(envelope.error) ? envelope.error : {};
    throw new FoloError(
      typeof error.code === "string" ? error.code : "FOLO_ERROR",
      typeof error.message === "string" ? error.message : "Folo request failed",
    );
  }

  if (!("data" in envelope)) {
    throw new FoloError("INVALID_RESPONSE", "Folo CLI response did not contain data");
  }

  return envelope.data;
}

export function runFolo<T>(
  arguments_: string[],
  options: RunFoloOptions,
  decode: FoloDecoder<T>,
): T {
  const result = spawnSync(process.execPath, [cliEntry, "--format", "json", ...arguments_], {
    encoding: "utf8",
    env: process.env,
    timeout: options.timeout ?? 20_000,
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? "TIMEOUT" : "CLI_ERROR";
    throw new FoloError(code, result.error.message);
  }

  const rawOutput = result.status === 0 ? result.stdout : result.stderr;
  const fallbackMessage = (result.stderr || result.stdout || "Folo CLI returned no output").trim();
  return decode(parseFoloEnvelope(rawOutput, fallbackMessage));
}
