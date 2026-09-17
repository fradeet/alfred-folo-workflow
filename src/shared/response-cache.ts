import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord } from "./guards.js";

const DEFAULT_MAX_AGE = 5 * 60 * 1_000;

export interface ResponseCacheOptions {
  cacheDirectory?: string;
  maxAge?: number;
  now?: number;
}

/** Resolves the directory holding cached Folo CLI responses. */
export function responseCacheDirectory(options: ResponseCacheOptions = {}): string {
  return options.cacheDirectory ?? join(process.env.alfred_workflow_cache || tmpdir(), "folo-requests");
}

/** Returns the stable cache key derived from the complete CLI argument list. */
export function responseCacheKey(command: string[]): string {
  const prefix = (command[0] ?? "folo").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "folo";
  const digest = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  return `${prefix}-${digest}`;
}

/** Returns the cache filename reported to Alfred as the `frr_result_cache_key` variable. */
export function responseCacheFilename(command: string[]): string {
  return `${responseCacheKey(command)}.json`;
}

/** Returns a fresh cached CLI payload, or undefined on a miss, stale record, or damaged file. */
export function readResponseCache(command: string[], options: ResponseCacheOptions = {}): unknown {
  const path = join(responseCacheDirectory(options), responseCacheFilename(command));
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(record) || typeof record.storedAt !== "number" || !("data" in record)) return undefined;

  const now = options.now ?? Date.now();
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  return now - record.storedAt <= maxAge ? record.data : undefined;
}

/** Persists a CLI payload as an atomic JSON record; cache failures never fail the request. */
export function writeResponseCache(command: string[], data: unknown, options: ResponseCacheOptions = {}): void {
  const directory = responseCacheDirectory(options);
  const path = join(directory, responseCacheFilename(command));
  try {
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ storedAt: options.now ?? Date.now(), data }));
    renameSync(temporaryPath, path);
  } catch {
    // A cache write is best-effort; the live CLI result is already in hand.
  }
}

/** Removes every cached CLI response, such as after a mark-read mutation. */
export function clearResponseCache(options: ResponseCacheOptions = {}): void {
  const directory = responseCacheDirectory(options);
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json") && !entry.endsWith(".tmp")) continue;
    rmSync(join(directory, entry), { force: true });
  }
}
