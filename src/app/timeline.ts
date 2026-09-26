#!/usr/bin/env node
/**
 * "Folo Timeline" Script Filter entry: renders timeline entries as Alfred items.
 *
 * Input (argv joined with spaces): either
 * - a plain filter query matched against the fetched entries, or
 * - a serialized {@link SubscriptionSelection} or {@link UnreadSelection}, or
 * - an {@link TimelineViewInput} JSON value emitted by an Alfred node, such as
 *   `{"kind": "view-input", "view": "articles"}`, or
 * - a standard input JSON object marked with `kind: "standard"` (see
 *   docs/reference/standard-input.md).
 *   Malformed JSON falls back to a query.
 *
 * Environment: `frrTimelineIsStandardInput=1` enables standard input when argv
 * is empty. `FRR_TIMELINE_LIMIT` sets the default entry limit (digits only,
 * otherwise 30). `frrTimelineUnreadOnly` set to `1` adds the unread-only flag
 * to the request. In standard input mode both variables are merged by priority
 * behind argv and the `frrTimelineLimit` / `frrTimelineUnreadOnly` standard
 * variables, and invalid values are reported instead of ignored.
 * `frrTimelineForceRefresh=1` bypasses the result cache for this invocation
 * and updates the cache after a live CLI request.
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` carries a
 *   serialized timeline selection and its `action` exposes the entry URL to
 *   Universal Actions. Shift uses a standard timeline input for the next page,
 *   or an empty, disabled argument at the end; an empty result yields a non-valid
 *   placeholder item. The response's `frrResultCacheKey` variable names the cached
 *   Folo CLI response file backing the list. `frrTimelineRequest` carries the
 *   complete normalized query as a serialized standard input, and
 *   `skipknowledge` keeps Alfred from reordering the timeline's own entry order.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, timelineItems } from "../shared/alfred.js";
import { cacheIcons } from "../shared/icon-cache.js";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import { responseCacheFilename, writeResponseCache } from "../shared/response-cache.js";
import { readTimelineCache, writeLastTimelineRequest, writeTimelineCache } from "../shared/timeline-cache.js";
import {
  STANDARD_INPUT_VERSION,
  StandardInputSpec,
  resolveStandardInput,
  standardBoolean,
  standardOptionalString,
  standardPositiveInteger,
  standardString,
} from "../shared/standard-input.js";
import { TimelineBlockInput, getTimeline } from "../block/folo/timeline.js";
import { parseRecord } from "../contracts/serialized-value.js";
import { SubscriptionSelection } from "../contracts/subscription-selection.js";
import { UnreadSelection } from "../contracts/unread-selection.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";
import { TimelineViewInput } from "../types/alfred-node-types.js";
import { FoloTimelineResult } from "../types/folo-types.js";

/** Standard input declaration for the timeline app. */
const timelineStandardSpec: StandardInputSpec = {
  isStandardEnv: "frrTimelineIsStandardInput",
  fields: [
    { field: "query", env: "frrTimelineQuery", type: "string" },
    { field: "view", env: "frrTimelineView", type: "string" },
    { field: "limit", env: "frrTimelineLimit", type: "integer", global: "FRR_TIMELINE_LIMIT" },
    { field: "unreadOnly", env: "frrTimelineUnreadOnly", type: "boolean" },
    { field: "cursor", env: "frrTimelineCursor", type: "string" },
    { field: "feed", env: "frrTimelineFeed", type: "string" },
    { field: "list", env: "frrTimelineList", type: "string" },
    { field: "category", env: "frrTimelineCategory", type: "string" },
  ],
};

/** argv JSON kinds routed to an existing workflow contract. */
const workflowContractKinds = new Set([
  "subscription-selection",
  "unread-selection",
  "view-input",
]);

export type TimelineAppInput =
  | SubscriptionSelection
  | UnreadSelection
  | TimelineViewInput
  | TimelineStandardInput;

/** Validated request used for standard calls and normalized workflow inputs. */
export class TimelineStandardInput {
  readonly query: string;
  readonly view?: string;
  readonly limit: number;
  readonly unreadOnly: boolean;
  readonly cursor?: string;
  readonly feed?: string;
  readonly list?: string;
  readonly category?: string;

  constructor(options: {
    query?: unknown;
    view?: unknown;
    limit?: unknown;
    unreadOnly?: unknown;
    cursor?: unknown;
    feed?: unknown;
    list?: unknown;
    category?: unknown;
  } = {}) {
    this.query = standardString(options.query, "query", "");
    this.view = standardOptionalString(options.view, "view");
    this.limit = standardPositiveInteger(options.limit, "limit", 30);
    this.unreadOnly = standardBoolean(options.unreadOnly, "unreadOnly", false);
    this.cursor = standardOptionalString(options.cursor, "cursor");
    this.feed = standardOptionalString(options.feed, "feed");
    this.list = standardOptionalString(options.list, "list");
    this.category = standardOptionalString(options.category, "category");
  }

  static from(value: unknown): TimelineStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Timeline standard input must be an object");
    }
    return new TimelineStandardInput(value);
  }

  /** Converts the validated input into the Folo block request. */
  toBlockInput(): TimelineBlockInput {
    return new TimelineBlockInput({
      view: this.view,
      limit: this.limit,
      unreadOnly: this.unreadOnly,
      cursor: this.cursor,
      feed: this.feed,
      list: this.list,
      category: this.category,
    });
  }

  withCursor(cursor: string): TimelineStandardInput {
    return new TimelineStandardInput({ ...this, cursor });
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: "standard",
      version: STANDARD_INPUT_VERSION,
      query: this.query,
      view: this.view,
      limit: this.limit,
      unreadOnly: this.unreadOnly,
      cursor: this.cursor ?? "",
      feed: this.feed,
      list: this.list,
      category: this.category,
    };
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }
}

/** Keeps the existing lenient workflow defaults outside standard input mode. */
function legacyTimelineDefaults(env: NodeJS.ProcessEnv): Pick<TimelineStandardInput, "limit" | "unreadOnly"> {
  const configured = /^\d+$/.test(env.FRR_TIMELINE_LIMIT ?? "") ? Number(env.FRR_TIMELINE_LIMIT) : 30;
  return {
    limit: Number.isInteger(configured) && configured > 0 ? configured : 30,
    unreadOnly: env.frrTimelineUnreadOnly === "1",
  };
}

export function parseTimelineAppInput(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): TimelineAppInput {
  const standard = resolveStandardInput(
    value,
    env,
    timelineStandardSpec,
    (data) => typeof data.kind === "string" && workflowContractKinds.has(data.kind),
  );
  if (standard !== undefined) return TimelineStandardInput.from(standard);

  const query = value.trim();
  if (!query.startsWith("{")) {
    const target = parseFoloShareUrl(query);
    return target
      ? new TimelineStandardInput({
          ...legacyTimelineDefaults(env),
          ...(target.type === "list" ? { list: target.id } : { feed: target.id }),
        })
      : new TimelineStandardInput({ ...legacyTimelineDefaults(env), query });
  }
  let data: Record<string, unknown>;
  try {
    data = parseRecord(query, "Timeline app input");
  } catch {
    return new TimelineStandardInput({ ...legacyTimelineDefaults(env), query });
  }
  if (data.kind === "subscription-selection") return SubscriptionSelection.from(data);
  if (data.kind === "unread-selection") return UnreadSelection.from(data);
  if (data.kind === "view-input") return TimelineViewInput.from(data);
  return new TimelineStandardInput({ ...legacyTimelineDefaults(env), query });
}

export function resolveTimelineInput(
  input: TimelineAppInput,
  env: NodeJS.ProcessEnv = process.env,
): TimelineStandardInput {
  if (input instanceof TimelineStandardInput) return input;
  const source = input instanceof TimelineViewInput
    ? { view: input.view }
    : input.resourceType === "list" ? { list: input.resourceId } : { feed: input.resourceId };
  return new TimelineStandardInput({ ...legacyTimelineDefaults(env), ...source });
}

export class TimelineAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = true, variables?: AlfredVariables) {
    super(items, {
      cache: cache ? new AlfredSFCache(60) : undefined,
      variables,
      skipknowledge: true,
    });
  }
}

/** Session variables describing the response and the query that produced it. */
export function timelineResultVariables(
  input: TimelineStandardInput,
  request: TimelineBlockInput,
): AlfredVariables {
  return {
    frrResultCacheKey: responseCacheFilename(request.toArguments()),
    frrTimelineRequest: input.serialize(),
  };
}

export async function timeline(
  input: TimelineAppInput,
  options: { refresh?: boolean; fetchTimeline?: (request: TimelineBlockInput) => FoloTimelineResult } = {},
): Promise<TimelineAppOutput> {
  const standardInput = resolveTimelineInput(input);
  const request = standardInput.toBlockInput();
  const cacheRequest = standardInput.serialize();
  const cached = options.refresh ? undefined : readTimelineCache(cacheRequest);
  const data = cached?.data ?? (options.fetchTimeline ?? getTimeline)(request);
  if (cached) {
    // Downstream mark-read actions still need the response cache for the shown list.
    writeResponseCache(request.toArguments(), data);
  } else {
    writeTimelineCache(cacheRequest, data);
  }
  const iconFor = await cacheIcons(data.entries.map((item) => item.feeds));
  const nextPageArg = data.hasNext && data.nextCursor
    ? standardInput.withCursor(data.nextCursor).serialize()
    : "";
  const latestPageArg = standardInput.cursor ? standardInput.withCursor("").serialize() : "";
  const items = timelineItems(data, iconFor, nextPageArg, latestPageArg);
  const emptySubtitle = request.unreadOnly
    ? "This subscription has no unread entries"
    : request.feed || request.list
      ? "This subscription has no entries"
      : request.view
        ? "This view has no entries"
        : "Try another query";
  const output = new TimelineAppOutput(
    items.length ? items : [emptyItem("No Folo entries", emptySubtitle)],
    false,
    timelineResultVariables(standardInput, request),
  );
  writeLastTimelineRequest(cacheRequest);
  return output;
}

async function main(): Promise<void> {
  try {
    const argument = process.argv.slice(2).join(" ");
    if (process.env.frrTimelineForceRefresh === "1" && !argument.trim()) {
      throw new TypeError("A timeline request is required to refresh the cache");
    }
    const input = parseTimelineAppInput(argument);
    process.stdout.write(JSON.stringify(await timeline(input, {
      refresh: process.env.frrTimelineForceRefresh === "1",
    })));
  } catch (error: unknown) {
    console.error(error);
    process.stdout.write(JSON.stringify(new TimelineAppOutput([errorItem(error)], false)));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
