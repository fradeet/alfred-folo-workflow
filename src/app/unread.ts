#!/usr/bin/env node
/**
 * "Folo unread" Script Filter entry: lists subscriptions that have unread entries.
 *
 * Input (argv joined with spaces): a filter query matched against titles, kinds,
 * categories, and unread counts.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` carries a
 *   serialized unread selection for the timeline app; the response's
 *   `frrResultCacheKey` variable names the cached Folo CLI response file
 *   backing the list. An empty result yields a non-valid item.
 * - Side effect: when feed or list icons are missing from the cache, the
 *   cache-subscription-icons worker is spawned detached in the background.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emptyItem, errorItem, unreadItems } from "../shared/alfred.js";
import { loadCachedIcons } from "../shared/icon-cache.js";
import { responseCacheFilename } from "../shared/response-cache.js";
import { UnreadBlockInput, getUnread } from "../block/folo/unread.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";

export class UnreadAppInput {
  constructor(readonly query: string) {}

  static parse(value: string): UnreadAppInput {
    return new UnreadAppInput(value.trim());
  }
}

export class UnreadAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = true, variables?: AlfredVariables) {
    super(items, { cache: cache ? new AlfredSFCache(60) : undefined, variables });
  }
}

export async function unread(input: UnreadAppInput): Promise<UnreadAppOutput> {
  const blockInput = new UnreadBlockInput();
  const data = getUnread(blockInput);
  const iconFor = await loadCachedIcons(data.items);
  const items = unreadItems(data, iconFor);
  if (data.items.some((item) => (item.sourceType === "feed" || item.sourceType === "list") && !iconFor(item))) {
    warmSubscriptionIcons();
  }
  return new UnreadAppOutput(
    items.length ? items : [emptyItem("No unread subscriptions", "You're all caught up")],
    true,
    { frrResultCacheKey: responseCacheFilename(blockInput.toArguments()) },
  );
}

async function main(): Promise<void> {
  try {
    const input = UnreadAppInput.parse(process.argv.slice(2).join(" "));
    process.stdout.write(JSON.stringify(await unread(input)));
  } catch (error: unknown) {
    console.error(error);
    process.stdout.write(JSON.stringify(new UnreadAppOutput([errorItem(error)], false)));
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
