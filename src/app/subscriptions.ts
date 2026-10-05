#!/usr/bin/env node
/**
 * "Folo Subscriptions" Script Filter entry: lists the feeds and lists the user follows.
 *
 * Input (argv joined with spaces): a filter query matched against subscription
 * titles, kinds, categories, descriptions, and IDs.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` is the raw
 *   subscription object as JSON, and quick look / copy text carry the Folo share
 *   URL. An empty result yields a non-valid placeholder item.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { emptyItem, errorItem, output, subscriptionItems } from "../shared/alfred.js";
import { runFolo } from "../shared/folo-cli.js";
import { FoloSubscriptionsResult } from "../types/folo-types.js";
import { cacheIcons } from "../shared/icon-cache.js";

const query = process.argv.slice(2).join(" ");

async function main(): Promise<void> {
  try {
    const data = runFolo(["subscription", "list"], {}, FoloSubscriptionsResult.from);
    const sources = data.subscriptions.flatMap((item) => item.lists ?? item.feeds ?? []);
    const iconFor = await cacheIcons(sources);
    const items = subscriptionItems(data, query, iconFor);
    output(items.length ? items : [emptyItem("No Folo subscriptions", "Try another query")], 60);
  } catch (error: unknown) {
    console.error(error);
    output([errorItem(error)]);
    process.exitCode = 1;
  }
}

void main();
