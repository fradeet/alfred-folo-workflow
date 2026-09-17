import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ResponseCacheOptions {
  cacheDirectory?: string;
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

/** Returns the cache filename reported to Alfred as the `frrResultCacheKey` variable. */
export function responseCacheFilename(command: string[]): string {
  return `${responseCacheKey(command)}.json`;
}

/** Persists a CLI payload as an atomic JSON file; cache failures never fail the request. */
export function writeResponseCache(command: string[], data: unknown, options: ResponseCacheOptions = {}): void {
  const directory = responseCacheDirectory(options);
  const path = join(directory, responseCacheFilename(command));
  try {
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(data));
    renameSync(temporaryPath, path);
  } catch {
    // A cache write is best-effort; the live CLI result is already in hand.
  }
}

/** Shape of filenames written by {@link writeResponseCache}. */
const cacheFilenamePattern = /^[a-zA-Z0-9_-]{1,32}-[0-9a-f]{64}\.json$/;

/** Reads the CLI payload stored under a `frrResultCacheKey` filename. */
export function readResponseCache(filename: string, options: ResponseCacheOptions = {}): unknown {
  if (!cacheFilenamePattern.test(filename)) {
    throw new TypeError("Response cache key must be a filename reported by this workflow");
  }
  let raw: string;
  try {
    raw = readFileSync(join(responseCacheDirectory(options), filename), "utf8");
  } catch {
    throw new Error(`Cached Folo response is unavailable: ${filename}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(`Cached Folo response is not valid JSON: ${filename}`);
  }
}
