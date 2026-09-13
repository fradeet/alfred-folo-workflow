import { createHash } from "node:crypto";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { isRecord } from "./folo-cli.js";

const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1_000;
const FOLO_ICON_MAX_AGE = 30 * 24 * 60 * 60 * 1_000;
const FAILURE_MAX_AGE = 60 * 60 * 1_000;
const MAX_ICON_BYTES = 5 * 1_024 * 1_024;
const REQUEST_TIMEOUT = 5_000;

export interface IconCacheOptions {
  cacheDirectory?: string;
  fetcher?: typeof fetch;
  maxAge?: number;
  now?: number;
}

export type IconResolver = (source: unknown) => string | undefined;

/** Returns the stable feed/list identity used as the on-disk cache key. */
export function feedIconCacheKey(source: unknown): string | undefined {
  if (!isRecord(source)) return undefined;

  if (source.sourceType === "feed" || source.sourceType === "list") {
    return nonEmptyString(source.sourceId) ?? nonEmptyString(source.feedId) ?? nonEmptyString(source.listId);
  }
  if (source.sourceType === "inbox") return nonEmptyString(source.feedId);

  return nonEmptyString(source.id) ?? nonEmptyString(source.feedId) ?? nonEmptyString(source.listId);
}

/** Resolves the official image or Folo's domain icon for a feed-like value. */
export function feedIconUrl(source: unknown): string | undefined {
  if (!isRecord(source)) return undefined;

  const image = httpUrl(source.image);
  if (image) return image;

  for (const candidate of [source.siteUrl, source.url]) {
    const url = httpUrl(candidate);
    if (!url) continue;
    return `https://icons.folo.is/${new URL(url).hostname}`;
  }

  return undefined;
}

/** Downloads unique icons into Alfred's cache and returns a local-path resolver. */
export async function cacheIcons(
  sources: unknown[],
  options: IconCacheOptions = {},
): Promise<IconResolver> {
  const icons = new Map<string, string>();
  for (const source of sources) {
    const key = feedIconCacheKey(source);
    const url = feedIconUrl(source);
    if (key && url && !icons.has(key)) icons.set(key, url);
  }
  const paths = new Map<string, string>();
  if (!icons.size) return loadCachedIcons(sources, options);

  const directory = iconCacheDirectory(options);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  await mkdir(directory, { recursive: true });

  await mapWithConcurrency([...icons], 6, async ([key, url]) => {
    const maxAge = options.maxAge ?? iconMaxAge(url);
    const path = await cachedIcon(key, url, directory, fetcher, maxAge, now);
    if (path) paths.set(key, path);
  });

  return (source) => {
    const key = feedIconCacheKey(source);
    return key ? paths.get(key) : undefined;
  };
}

/** Resolves existing icons by ID without making any network requests. */
export async function loadCachedIcons(
  sources: unknown[],
  options: Pick<IconCacheOptions, "cacheDirectory"> = {},
): Promise<IconResolver> {
  const directory = iconCacheDirectory(options);
  const keys = [...new Set(sources.flatMap((source) => feedIconCacheKey(source) ?? []))];
  const paths = new Map<string, string>();
  await mkdir(directory, { recursive: true });

  await Promise.all(keys.map(async (key) => {
    const existing = await findCachedFile(directory, fileKey(key));
    if (existing) paths.set(key, existing.path);
  }));

  return (source) => {
    const key = feedIconCacheKey(source);
    return key ? paths.get(key) : undefined;
  };
}

export function iconCacheDirectory(options: Pick<IconCacheOptions, "cacheDirectory"> = {}): string {
  return options.cacheDirectory ?? join(process.env.alfred_workflow_cache || tmpdir(), "feed-icons");
}

async function cachedIcon(
  cacheKey: string,
  url: string,
  directory: string,
  fetcher: typeof fetch,
  maxAge: number,
  now: number,
): Promise<string | undefined> {
  const key = fileKey(cacheKey);
  const existing = await findCachedFile(directory, key);
  if (existing && now - existing.modifiedAt <= maxAge) return existing.path;

  const failurePath = join(directory, `${key}.failed`);
  if (await isFresh(failurePath, FAILURE_MAX_AGE, now)) return existing?.path;

  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!response.ok || !contentType?.startsWith("image/")) throw new Error(`Invalid icon response: ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ICON_BYTES) throw new Error("Invalid icon size");

    const extension = imageExtension(contentType, url);
    const path = join(directory, `${key}${extension}`);
    const temporaryPath = join(directory, `${key}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, path);
    if (existing && existing.path !== path) await unlink(existing.path).catch(() => undefined);
    await unlink(failurePath).catch(() => undefined);
    return path;
  } catch {
    await writeFile(failurePath, "").catch(() => undefined);
    return existing?.path;
  }
}

async function findCachedFile(
  directory: string,
  key: string,
): Promise<{ path: string; modifiedAt: number } | undefined> {
  const filename = (await readdir(directory)).find((entry) =>
    entry.startsWith(`${key}.`) && !entry.endsWith(".failed") && !entry.endsWith(".tmp")
  );
  if (!filename) return undefined;
  const path = join(directory, filename);
  const metadata = await stat(path).catch(() => undefined);
  return metadata ? { path, modifiedAt: metadata.mtimeMs } : undefined;
}

async function isFresh(path: string, maxAge: number, now: number): Promise<boolean> {
  const metadata = await stat(path).catch(() => undefined);
  return Boolean(metadata && now - metadata.mtimeMs <= maxAge);
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function fileKey(value: string): string {
  return /^[a-zA-Z0-9_-]{1,200}$/.test(value)
    ? value
    : createHash("sha256").update(value).digest("hex");
}

function iconMaxAge(url: string): number {
  return new URL(url).hostname === "icons.folo.is" ? FOLO_ICON_MAX_AGE : DEFAULT_MAX_AGE;
}

function imageExtension(contentType: string, url: string): string {
  const byType: Record<string, string> = {
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
  };
  if (byType[contentType]) return byType[contentType];
  const extension = extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : ".img";
}

async function mapWithConcurrency<T>(
  values: T[],
  limit: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < values.length) {
      const value = values[index++];
      if (value !== undefined) await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
}
