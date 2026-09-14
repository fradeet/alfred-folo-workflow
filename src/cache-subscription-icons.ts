#!/usr/bin/env node
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { cacheIcons, iconCacheDirectory } from "./icon-cache.js";
import { runFolo } from "./folo-cli.js";
import { FoloSubscriptionsResult } from "./types/folo-types.js";

const LOCK_MAX_AGE = 60_000;

async function main(): Promise<void> {
  const directory = iconCacheDirectory();
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, "subscriptions.lock");
  const lock = await acquireLock(lockPath);
  if (!lock) return;

  try {
    const data = runFolo(["subscription", "list"], {}, FoloSubscriptionsResult.from);
    const sources = data.subscriptions.flatMap((item) => item.lists ?? item.feeds ?? []);
    await cacheIcons(sources, { cacheDirectory: directory });
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function acquireLock(path: string) {
  try {
    return await open(path, "wx");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const metadata = await stat(path).catch(() => undefined);
    if (!metadata || Date.now() - metadata.mtimeMs <= LOCK_MAX_AGE) return undefined;
    await unlink(path).catch(() => undefined);
    return open(path, "wx").catch(() => undefined);
  }
}

void main().catch(() => undefined);
