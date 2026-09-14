#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emptyItem, errorItem, output, unreadItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloUnreadResult } from "./types/folo-types.js";
import { loadCachedIcons } from "./icon-cache.js";

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
