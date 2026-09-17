#!/usr/bin/env node
/**
 * "Mark read above" Run Script entry: marks the selected timeline entry and
 * every unread entry above it in the rendered list as read.
 *
 * Input (argv joined with spaces): a serialized timeline selection passed down
 * unchanged from the timeline Script Filter.
 *
 * Environment: `frr_result_cache_key` names the stored timeline response that
 * produced the list the user acted on; the entries above the selection are read
 * from that record so the action matches the list the user saw.
 *
 * Output:
 * - stdout: a serialized {@link MarkReadAboveAppOutput} on success.
 * - On failure: the error message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { MarkReadBlockInput, markEntryRead } from "../block/folo/mark-read.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { SerializedValue } from "../contracts/serialized-value.js";
import { readResponseCache } from "../shared/response-cache.js";
import { FoloTimelineResult } from "../types/folo-types.js";

export class MarkReadAboveAppOutput extends SerializedValue {
  readonly kind = "mark-read-above-result";

  constructor(
    readonly anchorEntryId: string,
    readonly markedEntryIds: string[],
  ) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      anchorEntryId: this.anchorEntryId,
      markedEntryIds: this.markedEntryIds,
    };
  }
}

/**
 * Returns the IDs of the anchor entry and the unread entries above it, in list
 * order. Already-read entries stay untouched; a missing anchor is an error
 * because the list the user saw cannot be reconstructed.
 */
export function unreadEntryIdsAbove(result: FoloTimelineResult, anchorEntryId: string): string[] {
  const anchorIndex = result.entries.findIndex((item) => item.entries.id === anchorEntryId);
  if (anchorIndex < 0) {
    throw new Error("The selected entry is not in the cached timeline list; reopen the list and try again");
  }
  return result.entries
    .slice(0, anchorIndex + 1)
    .filter((item) => !item.read)
    .map((item) => item.entries.id);
}

/** Marks the selected Folo entry and the unread entries above it as read. */
export function markReadAbove(input: TimelineSelection, cacheKey: string): MarkReadAboveAppOutput {
  const timeline = FoloTimelineResult.from(readResponseCache(cacheKey));
  const entryIds = unreadEntryIdsAbove(timeline, input.entryId);

  const marked: string[] = [];
  for (const entryId of entryIds) {
    try {
      markEntryRead(new MarkReadBlockInput(entryId));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Marked ${marked.length} of ${entryIds.length} entries; then: ${message}`);
    }
    marked.push(entryId);
  }
  return new MarkReadAboveAppOutput(input.entryId, marked);
}

function main(): void {
  try {
    const input = TimelineSelection.parse(process.argv.slice(2).join(" "));
    process.stdout.write(markReadAbove(input, process.env.frr_result_cache_key ?? "").serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
