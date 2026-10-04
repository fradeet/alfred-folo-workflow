#!/usr/bin/env node
/** Marks all entries read for a selected subscription or unread source. */
import { pathToFileURL } from "node:url";
import { MarkAllReadBlockInput, MarkAllReadBlockOutput, MarkAllReadView, markAllEntriesRead } from "../block/folo/mark-all-read.js";
import { SubscriptionSelection } from "../contracts/subscription-selection.js";
import { UnreadSelection } from "../contracts/unread-selection.js";
import { SerializedValue, parseRecord } from "../contracts/serialized-value.js";
import { StandardInputSpec, resolveStandardInput, standardOptionalString } from "../shared/standard-input.js";

const markAllReadStandardSpec: StandardInputSpec = {
  isStandardEnv: "frrMarkAllReadIsStandardInput",
  fields: [
    { field: "feed", env: "frrMarkAllReadFeed", type: "string" },
    { field: "list", env: "frrMarkAllReadList", type: "string" },
    { field: "view", env: "frrMarkAllReadView", type: "string" },
  ],
};

export class MarkAllReadStandardInput {
  readonly feed?: string;
  readonly list?: string;
  readonly view?: MarkAllReadView;

  constructor(options: { feed?: unknown; list?: unknown; view?: unknown } = {}) {
    this.feed = standardOptionalString(options.feed, "feed");
    this.list = standardOptionalString(options.list, "list");
    const view = standardOptionalString(options.view, "view");
    this.view = view as MarkAllReadView | undefined;
    void new MarkAllReadBlockInput(this);
  }

  static from(value: unknown): MarkAllReadStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Mark-all-read standard input must be an object");
    }
    return new MarkAllReadStandardInput(value);
  }
}

export type MarkAllReadAppInput = SubscriptionSelection | UnreadSelection | MarkAllReadStandardInput;

export function parseMarkAllReadAppInput(value: string, env: NodeJS.ProcessEnv = process.env): MarkAllReadAppInput {
  const standard = resolveStandardInput(value, env, markAllReadStandardSpec,
    (data) => data.kind === "subscription-selection" || data.kind === "unread-selection");
  if (standard !== undefined) return MarkAllReadStandardInput.from(standard);
  const data = parseRecord(value, "Mark-all-read input");
  if (data.kind === "subscription-selection") return SubscriptionSelection.from(data);
  if (data.kind === "unread-selection") return UnreadSelection.from(data);
  throw new TypeError("Mark-all-read input must be a subscription or unread selection");
}

export class MarkAllReadAppOutput extends SerializedValue {
  readonly kind = "mark-all-read-result";
  constructor(readonly feed?: string, readonly list?: string, readonly view?: MarkAllReadView) { super(); }
  toJSON(): Record<string, unknown> {
    return { kind: this.kind, ...(this.feed === undefined ? {} : { feed: this.feed }),
      ...(this.list === undefined ? {} : { list: this.list }),
      ...(this.view === undefined ? {} : { view: this.view }) };
  }
}

export function markAllRead(input: MarkAllReadAppInput): MarkAllReadAppOutput {
  const result: MarkAllReadBlockOutput = markAllEntriesRead(markAllReadBlockInput(input));
  return new MarkAllReadAppOutput(result.feed, result.list, result.view);
}

export function markAllReadBlockInput(input: MarkAllReadAppInput): MarkAllReadBlockInput {
  const scope = input instanceof SubscriptionSelection || input instanceof UnreadSelection
    ? input.resourceType === "list" ? { list: input.resourceId } : { feed: input.resourceId }
    : input;
  return new MarkAllReadBlockInput(scope);
}

function main(): void {
  try {
    process.stdout.write(markAllRead(parseMarkAllReadAppInput(process.argv.slice(2).join(" "))).serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) main();
