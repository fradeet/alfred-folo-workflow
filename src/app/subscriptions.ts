#!/usr/bin/env node
/**
 * "Folo Subscriptions" Script Filter entry: lists the feeds and lists the user follows.
 *
 * Input (argv joined with spaces): either
 * - a filter query matched against subscription titles, kinds, categories,
 *   descriptions, and IDs, or
 * - a standard input JSON object marked with `kind: "standard"` (see
 *   docs/reference/standard-input.md).
 *
 * Standard environment variable: `frrSubscriptionsIsStandardInput=1` enables
 * standard input when argv is empty;
 * `frrSubscriptionsQuery`, `frrSubscriptionsView`, and
 * `frrSubscriptionsCategory` then provide fields. Non-standard calls ignore
 * these variables, and the query never filters results inside the app:
 * Alfred filters the rendered items.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 1h. Each item's `arg` carries a
 *   serialized subscription selection for the timeline app; the response's
 *   `frrResultCacheKey` variable names the cached Folo CLI response file
 *   backing the list. An empty result yields a non-valid item.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { emptyItem, errorItem, subscriptionItems } from "../shared/alfred.js";
import { pathToFileURL } from "node:url";
import { cacheIcons } from "../shared/icon-cache.js";
import { responseCacheFilename } from "../shared/response-cache.js";
import {
  StandardInputSpec,
  resolveStandardInput,
  standardOptionalString,
  standardString,
} from "../shared/standard-input.js";
import { SubscriptionsBlockInput, getSubscriptions } from "../block/folo/subscriptions.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";

/** Standard input declaration for the subscriptions app. */
const subscriptionsStandardSpec: StandardInputSpec = {
  isStandardEnv: "frrSubscriptionsIsStandardInput",
  fields: [
    { field: "query", env: "frrSubscriptionsQuery", type: "string" },
    { field: "view", env: "frrSubscriptionsView", type: "string" },
    { field: "category", env: "frrSubscriptionsCategory", type: "string" },
  ],
};

/** Legacy Alfred input: a filter query applied by Alfred, not by this app. */
export class SubscriptionsQueryInput {
  constructor(readonly query: string) {}

  static parse(value: string): SubscriptionsQueryInput {
    return new SubscriptionsQueryInput(value.trim());
  }
}

/** Standard input for external callers; the constructor validates every field. */
export class SubscriptionsStandardInput {
  readonly query: string;
  readonly view?: string;
  readonly category?: string;

  constructor(options: { query?: unknown; view?: unknown; category?: unknown } = {}) {
    this.query = standardString(options.query, "query", "");
    this.view = standardOptionalString(options.view, "view");
    this.category = standardOptionalString(options.category, "category");
  }

  static from(value: unknown): SubscriptionsStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Subscriptions standard input must be an object");
    }
    return new SubscriptionsStandardInput(value);
  }
}

export type SubscriptionsAppInput = SubscriptionsQueryInput | SubscriptionsStandardInput;

/** Parses argv, activating the standard environment variables only when marked. */
export function parseSubscriptionsAppInput(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): SubscriptionsAppInput {
  const standard = resolveStandardInput(value, env, subscriptionsStandardSpec, () => false);
  if (standard !== undefined) return SubscriptionsStandardInput.from(standard);
  return SubscriptionsQueryInput.parse(value);
}

export class SubscriptionsAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = true, variables?: AlfredVariables) {
    super(items, { cache: cache ? new AlfredSFCache(60 * 60, true) : undefined, variables });
  }
}

export async function subscriptions(input: SubscriptionsAppInput): Promise<SubscriptionsAppOutput> {
  const blockInput = input instanceof SubscriptionsStandardInput
    ? new SubscriptionsBlockInput(input.view, input.category)
    : new SubscriptionsBlockInput();
  const data = getSubscriptions(blockInput);
  const sources = data.subscriptions.flatMap((item) => item.lists ?? item.feeds ?? []);
  const iconFor = await cacheIcons(sources);
  const items = subscriptionItems(data, iconFor);
  return new SubscriptionsAppOutput(
    items.length ? items : [emptyItem("No Folo subscriptions", "Try another query")],
    true,
    { frrResultCacheKey: responseCacheFilename(blockInput.toArguments()) },
  );
}

async function main(): Promise<void> {
  try {
    const input = parseSubscriptionsAppInput(process.argv.slice(2).join(" "));
    process.stdout.write(JSON.stringify(await subscriptions(input)));
  } catch (error: unknown) {
    console.error(error);
    process.stdout.write(JSON.stringify(new SubscriptionsAppOutput([errorItem(error)], false)));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
