#!/usr/bin/env node
/**
 * "Folo unread" Script Filter entry: lists subscriptions that have unread entries.
 *
 * Input (argv joined with spaces): either
 * - a filter query matched against titles, kinds, categories, and unread
 *   counts, or
 * - a standard input JSON object marked with `kind: "standard"` or
 *   `isStandardInput: 1` (see docs/reference/standard-input.md).
 *
 * Standard environment variables: `frrUnreadKind` or
 * `frrUnreadIsStandardInput` enable standard input when argv is empty;
 * `frrUnreadQuery` and `frrUnreadView` then provide fields. Non-standard
 * calls ignore these variables, and the query never filters results inside
 * the app: Alfred filters the rendered items.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { emptyItem, errorItem, unreadItems } from "../shared/alfred.js";
import { loadCachedIcons } from "../shared/icon-cache.js";
import { responseCacheFilename } from "../shared/response-cache.js";
import {
  StandardInputSpec,
  resolveStandardInput,
  standardOptionalString,
  standardString,
} from "../shared/standard-input.js";
import { UnreadBlockInput, getUnread } from "../block/folo/unread.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";

/** Standard input declaration for the unread app. */
const unreadStandardSpec: StandardInputSpec = {
  appId: "unread",
  kindEnv: "frrUnreadKind",
  isStandardEnv: "frrUnreadIsStandardInput",
  fields: [
    { field: "query", env: "frrUnreadQuery", type: "string" },
    { field: "view", env: "frrUnreadView", type: "string" },
  ],
};

/** Legacy Alfred input: a filter query applied by Alfred, not by this app. */
export class UnreadQueryInput {
  constructor(readonly query: string) {}

  static parse(value: string): UnreadQueryInput {
    return new UnreadQueryInput(value.trim());
  }
}

/** Standard input for external callers; the constructor validates every field. */
export class UnreadStandardInput {
  readonly query: string;
  readonly view?: string;

  constructor(options: { query?: unknown; view?: unknown } = {}) {
    this.query = standardString(options.query, "query", "");
    this.view = standardOptionalString(options.view, "view");
  }

  static from(value: unknown): UnreadStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Unread standard input must be an object");
    }
    return new UnreadStandardInput(value);
  }
}

export type UnreadAppInput = UnreadQueryInput | UnreadStandardInput;

/** Parses argv, activating the standard environment variables only when marked. */
export function parseUnreadAppInput(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): UnreadAppInput {
  const standard = resolveStandardInput(value, env, unreadStandardSpec, () => false);
  if (standard !== undefined) return UnreadStandardInput.from(standard);
  return UnreadQueryInput.parse(value);
}

export class UnreadAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = true, variables?: AlfredVariables) {
    super(items, { cache: cache ? new AlfredSFCache(300) : undefined, variables });
  }
}

export async function unread(input: UnreadAppInput): Promise<UnreadAppOutput> {
  const blockInput = input instanceof UnreadStandardInput
    ? new UnreadBlockInput(input.view)
    : new UnreadBlockInput();
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
    const input = parseUnreadAppInput(process.argv.slice(2).join(" "));
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

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
