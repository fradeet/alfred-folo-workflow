import { FoloEntry, FoloFeed, FoloTimelineSubscription } from "../types/folo-types.js";
import { SerializedValue, parseRecord } from "./serialized-value.js";

export class TimelineSelection extends SerializedValue {
  readonly kind = "timeline-entry";

  constructor(
    readonly url: string,
    readonly entryId: string,
    readonly entry: FoloEntry,
    readonly feed: FoloFeed,
    readonly subscription?: FoloTimelineSubscription,
  ) {
    super();
    if (!url.trim()) throw new TypeError("Entry URL is required");
    if (!entryId.trim()) throw new TypeError("Entry ID is required");
    if (entry.id !== entryId) throw new TypeError("Timeline entry IDs do not match");
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      url: this.url,
      entryId: this.entryId,
      entry: this.entry,
      feed: this.feed,
      ...(this.subscription === undefined ? {} : { subscription: this.subscription }),
    };
  }

  static from(value: unknown): TimelineSelection {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Timeline selection must be an object");
    }
    const data = value as Record<string, unknown>;
    if (data.kind !== "timeline-entry") throw new TypeError("Invalid timeline selection kind");
    if (typeof data.url !== "string" || typeof data.entryId !== "string") {
      throw new TypeError("Timeline selection is incomplete");
    }
    return new TimelineSelection(
      data.url,
      data.entryId,
      new FoloEntry(data.entry),
      new FoloFeed(data.feed),
      typeof data.subscription === "object" && data.subscription !== null && !Array.isArray(data.subscription)
        ? new FoloTimelineSubscription(data.subscription)
        : undefined,
    );
  }

  static parse(value: string): TimelineSelection {
    return TimelineSelection.from(parseRecord(value, "Timeline selection"));
  }
}
