#!/usr/bin/env node
/**
 * "Folo Subscriptions" Script Filter entry: lists the feeds and lists the user follows.
 *
 * Input (argv joined with spaces): a filter query matched against subscription
 * titles, kinds, categories, descriptions, and IDs.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's
 *   `frrTimelineFilter` variable is a serialized subscription selection; the
 *   response's `frrResultCacheKey` variable names the cached Folo CLI response file
 *   backing the list. An empty result yields a non-valid item.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { emptyItem, errorItem, subscriptionItems } from "../shared/alfred.js";
import { cacheIcons } from "../shared/icon-cache.js";
import { responseCacheFilename } from "../shared/response-cache.js";
import { SubscriptionsBlockInput, getSubscriptions } from "../block/folo/subscriptions.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";

export class SubscriptionsAppInput {
  constructor(readonly query: string) {}

  static parse(value: string): SubscriptionsAppInput {
    return new SubscriptionsAppInput(value.trim());
  }
}

export class SubscriptionsAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = true, variables?: AlfredVariables) {
    super(items, { cache: cache ? new AlfredSFCache(60) : undefined, variables });
  }
}

export async function subscriptions(input: SubscriptionsAppInput): Promise<SubscriptionsAppOutput> {
  const blockInput = new SubscriptionsBlockInput();
  const data = getSubscriptions(blockInput);
  const sources = data.subscriptions.flatMap((item) => item.lists ?? item.feeds ?? []);
  const iconFor = await cacheIcons(sources);
  const items = subscriptionItems(data, input.query, iconFor);
  return new SubscriptionsAppOutput(
    items.length ? items : [emptyItem("No Folo subscriptions", "Try another query")],
    true,
    { frrResultCacheKey: responseCacheFilename(blockInput.toArguments()) },
  );
}

async function main(): Promise<void> {
  try {
    const input = SubscriptionsAppInput.parse(process.argv.slice(2).join(" "));
    process.stdout.write(JSON.stringify(await subscriptions(input)));
  } catch (error: unknown) {
    console.error(error);
    process.stdout.write(JSON.stringify(new SubscriptionsAppOutput([errorItem(error)], false)));
    process.exitCode = 1;
  }
}

void main();
