#!/usr/bin/env node
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
