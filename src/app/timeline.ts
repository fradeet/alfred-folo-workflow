#!/usr/bin/env node
/**
 * "Folo Timeline" Script Filter entry: renders timeline entries as Alfred items.
 *
 * Input (argv joined with spaces): either
 * - a plain filter query matched against the fetched entries, or
 * - a serialized {@link FoloResourceSelection} from the subscriptions or
 *   unread Script Filter, or
 * - a serialized {@link TimelineDirectInput}. Malformed JSON falls back to a query.
 *
 * Environment: `FOLO_LIMIT` sets the default entry limit (digits only, otherwise 30).
 *
 * Output:
 * - stdout: Alfred Script Filter JSON cached for 60s. Each item's `arg` carries a
 *   serialized timeline selection; an empty result yields a non-valid
 *   placeholder item.
 * - On failure: an error item is emitted and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, timelineItems } from "../shared/alfred.js";
import { cacheIcons } from "../shared/icon-cache.js";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import { TimelineBlockInput, getTimeline } from "../block/folo/timeline.js";
import { FoloResourceSelection } from "../contracts/resource-selection.js";
import { SerializedValue, parseRecord } from "../contracts/serialized-value.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem } from "../types/alfred-types.js";

export type TimelineAppInput = TimelineDirectInput | FoloResourceSelection;

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

export function parseTimelineAppInput(value: string): TimelineAppInput {
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
  if (data.kind === "folo-resource") return FoloResourceSelection.from(data);
  return new TimelineDirectInput(query);
}

function resolveTimelineInput(input: TimelineAppInput): TimelineDirectInput {
  return input instanceof FoloResourceSelection
    ? new TimelineDirectInput(
        "",
        new TimelineBlockInput(
          input.resourceType === "list"
            ? { list: input.resourceId }
            : { feed: input.resourceId },
        ),
      )
    : input;
}

export class TimelineAppOutput extends AlfredSF {
  constructor(items: AlfredSFItem[], cache = false) {
    super(items, { cache: cache ? new AlfredSFCache(60) : undefined });
  }
}

export async function timeline(input: TimelineAppInput): Promise<TimelineAppOutput> {
  const directInput = resolveTimelineInput(input);
  const limit = /^\d+$/.test(process.env.FOLO_LIMIT ?? "") ? Number(process.env.FOLO_LIMIT) : 30;
  const data = getTimeline(directInput.request.withDefaultLimit(limit));
  const iconFor = await cacheIcons(data.entries.map((item) => item.feeds));
  const items = timelineItems(data, directInput.query, iconFor);
  const emptySubtitle = directInput.request.unreadOnly
    ? "This subscription has no unread entries"
    : directInput.request.feed || directInput.request.list
      ? "This subscription has no entries"
      : "Try another query";
  return new TimelineAppOutput(
    items.length ? items : [emptyItem("No Folo entries", emptySubtitle)],
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
