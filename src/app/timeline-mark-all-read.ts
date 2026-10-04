#!/usr/bin/env node
/** Marks all entries in the current timeline scope as read. */
import { pathToFileURL } from "node:url";
import { MarkAllReadBlockInput, MarkAllReadView } from "../block/folo/mark-all-read.js";
import { SerializedValue, parseRecord } from "../contracts/serialized-value.js";
import { StandardInputSpec, resolveStandardInput, standardOptionalString } from "../shared/standard-input.js";
import { MarkAllReadAppOutput, markAllRead } from "./mark-all-read.js";

const timelineMarkAllReadStandardSpec: StandardInputSpec = {
  isStandardEnv: "frrTimelineMarkAllReadIsStandardInput",
  fields: [
    { field: "feed", env: "frrTimelineFeed", type: "string" },
    { field: "list", env: "frrTimelineList", type: "string" },
    { field: "view", env: "frrTimelineView", type: "string" },
    { field: "category", env: "frrTimelineCategory", type: "string" },
  ],
};

export class TimelineMarkAllReadInput extends SerializedValue {
  readonly kind = "timeline-mark-all-read";
  readonly feed?: string;
  readonly list?: string;
  readonly view?: MarkAllReadView;
  readonly category?: string;

  constructor(options: { feed?: unknown; list?: unknown; view?: unknown; category?: unknown } = {}) {
    super();
    this.feed = standardOptionalString(options.feed, "feed");
    this.list = standardOptionalString(options.list, "list");
    this.view = standardOptionalString(options.view, "view") as MarkAllReadView | undefined;
    this.category = standardOptionalString(options.category, "category");
    void new MarkAllReadBlockInput(this);
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, feed: this.feed ?? "", list: this.list ?? "", view: this.view ?? "", category: this.category ?? "" };
  }

  static from(value: unknown): TimelineMarkAllReadInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Timeline mark-all-read input must be an object");
    }
    return new TimelineMarkAllReadInput(value);
  }

  static parse(value: string): TimelineMarkAllReadInput {
    const data = parseRecord(value, "Timeline mark-all-read input");
    if (data.kind !== "timeline-mark-all-read") throw new TypeError("Invalid timeline mark-all-read input kind");
    return TimelineMarkAllReadInput.from(data);
  }
}

export function parseTimelineMarkAllReadInput(value: string, env: NodeJS.ProcessEnv = process.env): TimelineMarkAllReadInput {
  const standard = resolveStandardInput(value, env, timelineMarkAllReadStandardSpec,
    (data) => data.kind === "timeline-mark-all-read");
  return standard === undefined ? TimelineMarkAllReadInput.parse(value) : TimelineMarkAllReadInput.from(standard);
}

export function timelineMarkAllRead(input: TimelineMarkAllReadInput): MarkAllReadAppOutput {
  if (input.category) throw new TypeError("Folo mark-all-read cannot target a timeline category");
  return markAllRead(input);
}

function main(): void {
  try {
    process.stdout.write(timelineMarkAllRead(parseTimelineMarkAllReadInput(process.argv.slice(2).join(" "))).serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
