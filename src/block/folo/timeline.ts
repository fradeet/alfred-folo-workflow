import { FoloTimelineResult } from "../../types/folo-types.js";
import { runFolo } from "./client.js";

export class TimelineBlockInput {
  readonly view?: string;
  readonly limit?: number;
  readonly unreadOnly?: boolean;
  readonly cursor?: string;
  readonly feed?: string;
  readonly list?: string;
  readonly category?: string;

  constructor(options: {
    view?: string;
    limit?: number;
    unreadOnly?: boolean;
    cursor?: string;
    feed?: string;
    list?: string;
    category?: string;
  } = {}) {
    this.view = optionalString(options.view);
    this.limit = positiveInteger(options.limit);
    this.unreadOnly = options.unreadOnly === true ? true : undefined;
    this.cursor = optionalString(options.cursor);
    this.feed = optionalString(options.feed);
    this.list = optionalString(options.list);
    this.category = optionalString(options.category);
  }

  toArguments(): string[] {
    const args = ["timeline", "--limit", String(this.limit ?? 30)];
    if (this.view) args.push("--view", this.view);
    if (this.feed) args.push("--feed", this.feed);
    if (this.list) args.push("--list", this.list);
    if (this.category) args.push("--category", this.category);
    if (this.cursor) args.push("--cursor", this.cursor);
    if (this.unreadOnly) args.push("--unread-only");
    return args;
  }
}

export function getTimeline(input: TimelineBlockInput): FoloTimelineResult {
  return runFolo(input.toArguments(), { cache: true }, FoloTimelineResult.from);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
