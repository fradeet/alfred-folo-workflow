#!/usr/bin/env node
/**
 * "Folo Timeline" Script Filter entry: renders timeline entries as Alfred items.
 *
 * Input (argv joined with spaces): either
 * - a plain filter query matched against the fetched entries, or
 * - a serialized {@link SubscriptionSelection} or {@link UnreadSelection}, or
 * - an {@link TimelineViewInput} JSON value emitted by an Alfred node, such as
 *   `{"kind": "view-input", "view": "articles"}`, or
 * - a serialized {@link TimelineDirectInput}, or
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
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` carries a
 *   serialized timeline selection and its `action` exposes the entry URL to
 *   Universal Actions; an empty result yields a non-valid
 *   placeholder item. The response's `frrResultCacheKey` variable names the cached
 *   Folo CLI response file backing the list, and `skipknowledge` keeps Alfred from
 *   reordering the timeline's own entry order.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, timelineItems } from "../shared/alfred.js";
import { cacheIcons } from "../shared/icon-cache.js";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import { responseCacheFilename } from "../shared/response-cache.js";
import {
  StandardInputSpec,
  resolveStandardInput,
  standardBoolean,
  standardOptionalString,
  standardPositiveInteger,
  standardString,
} from "../shared/standard-input.js";
import { TimelineBlockInput, getTimeline } from "../block/folo/timeline.js";
import { SerializedValue, parseRecord } from "../contracts/serialized-value.js";
import { SubscriptionSelection } from "../contracts/subscription-selection.js";
import { UnreadSelection } from "../contracts/unread-selection.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredVariables } from "../types/alfred-types.js";
import { TimelineViewInput } from "../types/alfred-node-types.js";

/** Standard input declaration for the timeline app. */
const timelineStandardSpec: StandardInputSpec = {
  appId: "timeline",
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
  "timeline-input",
  "subscription-selection",
  "unread-selection",
  "view-input",
]);

export type TimelineAppInput =
  | TimelineDirectInput
  | SubscriptionSelection
  | UnreadSelection
  | TimelineViewInput
  | TimelineStandardInput;

export class TimelineDirectInput extends SerializedValue {
  readonly kind = "timeline-input";

  constructor(
    readonly query: string,
    readonly request = new TimelineBlockInput(),
  ) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, query: this.query, request: this.request };
  }

  static from(value: unknown): TimelineDirectInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Timeline app input must be an object");
    }
    const data = value as Record<string, unknown>;
    if (data.kind !== "timeline-input") throw new TypeError("Invalid timeline app input kind");
    return new TimelineDirectInput(
      typeof data.query === "string" ? data.query : "",
      TimelineBlockInput.from(data.request ?? {}),
    );
  }
}

/** Standard input for external callers; the constructor validates every field. */
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

  /** Converts the validated input into the timeline execution input. */
  toDirectInput(): TimelineDirectInput {
    return new TimelineDirectInput(this.query, new TimelineBlockInput({
      view: this.view,
      limit: this.limit,
      unreadOnly: this.unreadOnly,
      cursor: this.cursor,
      feed: this.feed,
      list: this.list,
      category: this.category,
    }));
  }
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
      ? new TimelineDirectInput(
          "",
          new TimelineBlockInput(target.type === "list" ? { list: target.id } : { feed: target.id }),
        )
      : new TimelineDirectInput(query);
  }
  let data: Record<string, unknown>;
  try {
    data = parseRecord(query, "Timeline app input");
  } catch {
    return new TimelineDirectInput(query);
  }
  if (data.kind === "timeline-input") return TimelineDirectInput.from(data);
  if (data.kind === "subscription-selection") return SubscriptionSelection.from(data);
  if (data.kind === "unread-selection") return UnreadSelection.from(data);
  if (data.kind === "view-input") return TimelineViewInput.from(data);
  return new TimelineDirectInput(query);
}

export function resolveTimelineInput(
  input: TimelineAppInput,
  env: NodeJS.ProcessEnv = process.env,
): TimelineDirectInput {
  if (input instanceof TimelineStandardInput) return input.toDirectInput();

  let query = "";
  let request: TimelineBlockInput;
  if (input instanceof TimelineDirectInput) {
    query = input.query;
    request = input.request;
  } else if (input instanceof TimelineViewInput) {
    request = new TimelineBlockInput({ view: input.view });
  } else {
    request = new TimelineBlockInput(
      input.resourceType === "list" ? { list: input.resourceId } : { feed: input.resourceId },
    );
  }
  const limit = /^\d+$/.test(env.FRR_TIMELINE_LIMIT ?? "") ? Number(env.FRR_TIMELINE_LIMIT) : 30;
  return new TimelineDirectInput(
    query,
    request.withDefaultLimit(limit).withDefaultUnreadOnly(env.frrTimelineUnreadOnly === "1"),
  );
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

export async function timeline(input: TimelineAppInput): Promise<TimelineAppOutput> {
  const directInput = resolveTimelineInput(input);
  const request = directInput.request;
  const data = getTimeline(request);
  const iconFor = await cacheIcons(data.entries.map((item) => item.feeds));
  const items = timelineItems(data, iconFor);
  const emptySubtitle = request.unreadOnly
    ? "This subscription has no unread entries"
    : request.feed || request.list
      ? "This subscription has no entries"
      : request.view
        ? "This view has no entries"
        : "Try another query";
  return new TimelineAppOutput(
    items.length ? items : [emptyItem("No Folo entries", emptySubtitle)],
    false,
    { frrResultCacheKey: responseCacheFilename(request.toArguments()) },
  );
}

async function main(): Promise<void> {
  try {
    const input = parseTimelineAppInput(process.argv.slice(2).join(" "));
    process.stdout.write(JSON.stringify(await timeline(input)));
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
