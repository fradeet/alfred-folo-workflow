import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FoloTimelineResult } from "../types/folo-types.js";
import { isRecord } from "./guards.js";
import { responseCacheDirectory } from "./response-cache.js";

export const TIMELINE_CACHE_MAX_AGE_MS = 60_000;
const LAST_REQUEST_FILENAME = "last-timeline-request.json";

export interface TimelineCacheOptions {
  cacheDirectory?: string;
  now?: number;
}

/** The serialized normalized input includes the local query as well as CLI filters. */
export function timelineCacheFilename(request: string): string {
  const digest = createHash("sha256").update(request).digest("hex");
  return `timeline-query-${digest}.json`;
}

/** Returns a fresh cached payload, including its capture time, or a cache miss. */
export function readTimelineCache(
  request: string,
  options: TimelineCacheOptions = {},
): { cachedAt: string; data: FoloTimelineResult } | undefined {
  const path = join(cacheDirectory(options), timelineCacheFilename(request));
  try {
    const stored: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(stored) || typeof stored.cachedAt !== "string") return undefined;
    const timestamp = Date.parse(stored.cachedAt);
    const age = (options.now ?? Date.now()) - timestamp;
    if (!Number.isFinite(timestamp) || age < 0 || age >= TIMELINE_CACHE_MAX_AGE_MS) return undefined;
    return { cachedAt: stored.cachedAt, data: FoloTimelineResult.from(stored.data) };
  } catch {
    return undefined;
  }
}

/** Stores the timeline under the full normalized request, with an explicit timestamp. */
export function writeTimelineCache(
  request: string,
  data: FoloTimelineResult,
  options: TimelineCacheOptions = {},
): void {
  const directory = cacheDirectory(options);
  const path = join(directory, timelineCacheFilename(request));
  try {
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ cachedAt: new Date(options.now ?? Date.now()).toISOString(), data }));
    renameSync(temporaryPath, path);
  } catch {
    // A cache failure must not hide a successful live timeline response.
  }
}

/** Remembers the last successfully rendered timeline request beyond the result TTL. */
export function writeLastTimelineRequest(request: string, options: TimelineCacheOptions = {}): void {
  const directory = cacheDirectory(options);
  const path = join(directory, LAST_REQUEST_FILENAME);
  try {
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify({ savedAt: new Date(options.now ?? Date.now()).toISOString(), request }));
    renameSync(temporaryPath, path);
  } catch {
    // Remembering a query is best-effort; it must not hide a successful timeline.
  }
}

/** Returns the saved request verbatim; the receiving app validates its contract. */
export function readLastTimelineRequest(options: TimelineCacheOptions = {}): string {
  let stored: unknown;
  try {
    stored = JSON.parse(readFileSync(join(cacheDirectory(options), LAST_REQUEST_FILENAME), "utf8"));
  } catch {
    throw new Error("No previous timeline query is available");
  }
  if (!isRecord(stored) || typeof stored.request !== "string") {
    throw new Error("The previous timeline query is invalid");
  }
  return stored.request;
}

function cacheDirectory(options: TimelineCacheOptions): string {
  return options.cacheDirectory ?? join(responseCacheDirectory(), "timeline");
}
