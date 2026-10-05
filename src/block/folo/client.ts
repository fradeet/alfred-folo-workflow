import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "../../shared/guards.js";
import { writeResponseCache } from "../../shared/response-cache.js";

const CLI_RELATIVE_ENTRY = join("node_modules", "folocli", "dist", "index.js");

function resolveCliEntry(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(directory, CLI_RELATIVE_ENTRY);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return join(directory, CLI_RELATIVE_ENTRY);
    directory = parent;
  }
}

const cliEntry = resolveCliEntry();

export interface RunFoloOptions {
  timeout?: number;

  /** Store the response in the request cache in Alfred's cache folder. */
  cache?: boolean;
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

/**
 * Returns the envelope's `data` payload, or `undefined` when a successful
 * command returns none: mutation commands such as `entry mark-read` respond
 * with `{"ok":true,"error":null}`. Decoders that require a payload validate
 * its absence themselves.
 */
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

  return envelope.data;
}

function decodeFoloOutput<T>(
  arguments_: string[],
  options: RunFoloOptions,
  decode: FoloDecoder<T>,
  rawOutput: string,
  fallbackMessage: string,
): T {
  const data = parseFoloEnvelope(rawOutput, fallbackMessage);
  if (options.cache) writeResponseCache(arguments_, data);
  return decode(data);
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
  return decodeFoloOutput(arguments_, options, decode, rawOutput, fallbackMessage);
}

/**
 * Async counterpart of {@link runFolo} for callers that run several CLI
 * commands concurrently. It shares the envelope contract, timeout, and cache
 * behavior; a process killed by a signal is reported as a timeout.
 */
export function runFoloAsync<T>(
  arguments_: string[],
  options: RunFoloOptions,
  decode: FoloDecoder<T>,
): Promise<T> {
  const timeout = options.timeout ?? 20_000;
  return new Promise<T>((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, "--format", "json", ...arguments_], {
      env: process.env,
      timeout,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? "TIMEOUT" : "CLI_ERROR";
      fail(new FoloError(code, error.message));
    });
    child.on("close", (status, signal) => {
      if (signal) {
        fail(new FoloError("TIMEOUT", `Folo CLI timed out after ${timeout}ms`));
        return;
      }
      const rawOutput = status === 0 ? stdout : stderr;
      const fallbackMessage = (stderr || stdout || "Folo CLI returned no output").trim();
      if (settled) return;
      settled = true;
      try {
        resolve(decodeFoloOutput(arguments_, options, decode, rawOutput, fallbackMessage));
      } catch (error) {
        reject(error);
      }
    });
  });
}
