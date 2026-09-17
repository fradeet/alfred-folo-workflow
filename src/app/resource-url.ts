#!/usr/bin/env node
/**
 * Transform entry: prints the URL to open for an upstream or timeline selection.
 *
 * Input (argv joined with spaces): a serialized subscription, unread, or timeline
 * selection passed unchanged from a Script Filter item.
 *
 * Output:
 * - stdout: the article, website, or Folo share URL on success.
 * - On failure: a message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { SubscriptionSelection } from "../contracts/subscription-selection.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { UnreadSelection } from "../contracts/unread-selection.js";
import { parseRecord } from "../contracts/serialized-value.js";

export type ResourceUrlAppInput = SubscriptionSelection | UnreadSelection | TimelineSelection;

export function parseResourceUrlInput(value: string): ResourceUrlAppInput {
  const data = parseRecord(value, "Resource URL input");
  if (data.kind === "subscription-selection") return SubscriptionSelection.from(data);
  if (data.kind === "unread-selection") return UnreadSelection.from(data);
  if (data.kind === "timeline-entry") {
    return TimelineSelection.from(data);
  }
  throw new TypeError("Resource URL input has an unsupported kind");
}

export class ResourceUrlAppOutput {
  constructor(readonly url: string) {}

  serialize(): string {
    return this.url;
  }
}

export function resourceUrl(input: ResourceUrlAppInput): ResourceUrlAppOutput {
  const url = input instanceof TimelineSelection ? input.url : input.openUrl;
  return new ResourceUrlAppOutput(url);
}

function main(): void {
  const input = process.argv.slice(2).join(" ").trim();
  try {
    process.stdout.write(resourceUrl(parseResourceUrlInput(input)).serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
