#!/usr/bin/env node
/**
 * "Folo unread" Script Filter entry: lists subscriptions that have unread entries.
 *
 * Input (argv joined with spaces): a filter query matched against titles, kinds,
 * categories, and unread counts.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` is the raw
 *   unread source object as JSON, and quick look / copy text carry the Folo share
 *   URL. An empty result yields a non-valid placeholder item.
 * - Side effect: when feed or list icons are missing from the cache, the
 *   cache-subscription-icons worker is spawned detached in the background.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emptyItem, errorItem, output, unreadItems } from "../shared/alfred.js";
import { runFolo } from "../shared/folo-cli.js";
import { FoloUnreadResult } from "../types/folo-types.js";
import { loadCachedIcons } from "../shared/icon-cache.js";

const query = process.argv.slice(2).join(" ");

async function main(): Promise<void> {
  try {
    const data = runFolo(["unread", "list"], {}, FoloUnreadResult.from);
    const iconFor = await loadCachedIcons(data.items);
    const items = unreadItems(data, query, iconFor);
    if (data.items.some((item) => (item.sourceType === "feed" || item.sourceType === "list") && !iconFor(item))) {
      warmSubscriptionIcons();
    }
    output(items.length ? items : [emptyItem("No unread subscriptions", "You're all caught up")], 60);
  } catch (error: unknown) {
    console.error(error);
    output([errorItem(error)]);
    process.exitCode = 1;
  }
}

function warmSubscriptionIcons(): void {
  const worker = fileURLToPath(new URL("./cache-subscription-icons.js", import.meta.url));
  spawn(process.execPath, [worker], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  }).unref();
}

void main();
