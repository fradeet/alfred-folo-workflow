#!/usr/bin/env node
/**
 * "Mark Page as Read" Run Script entry: marks every unread entry in one cached
 * timeline response. Alfred passes the response cache filename as one argv
 * argument. This is an internal workflow action, so it has no public standard
 * input protocol.
 *
 * Stdout uses the same result contract as mark-read-above. Failures go to
 * stderr and set a non-zero exit code.
 */
import { pathToFileURL } from "node:url";
import { MarkReadBlockInput, markEntryRead } from "../block/folo/mark-read.js";
import { MarkReadAboveAppOutput } from "../contracts/mark-read-above-result.js";
import { mapWithConcurrency } from "../shared/concurrency.js";
import { readResponseCache } from "../shared/response-cache.js";
import { FoloTimelineResult } from "../types/folo-types.js";

const MARK_CONCURRENCY = 6;

export class MarkPageReadInput {
  readonly resultCacheKey: string;

  constructor(resultCacheKey: string) {
    this.resultCacheKey = resultCacheKey.trim();
    if (!this.resultCacheKey) throw new TypeError("Response cache key is required");
  }
}

export { MarkReadAboveAppOutput as MarkPageReadAppOutput } from "../contracts/mark-read-above-result.js";

/** Returns only unread entry IDs, retaining the order shown on the page. */
export function unreadPageEntryIds(result: FoloTimelineResult): string[] {
  return result.entries.filter((item) => !item.read).map((item) => item.entries.id);
}

export async function markPageRead(input: MarkPageReadInput): Promise<MarkReadAboveAppOutput> {
  const timeline = FoloTimelineResult.from(readResponseCache(input.resultCacheKey));
  const entryIds = unreadPageEntryIds(timeline);
  const failures: string[] = [];
  const results = await mapWithConcurrency(entryIds, MARK_CONCURRENCY, async (entryId) => {
    try {
      await markEntryRead(new MarkReadBlockInput(entryId));
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${entryId}: ${message}`);
      return false;
    }
  });

  const marked = entryIds.filter((_entryId, index) => results[index]);
  if (failures.length > 0) {
    throw new Error(`Marked ${marked.length} of ${entryIds.length} entries; failed: ${failures.join("; ")}`);
  }
  return new MarkReadAboveAppOutput(timeline.entries.at(-1)?.entries.id ?? "", marked);
}

async function main(): Promise<void> {
  try {
    const output = await markPageRead(new MarkPageReadInput(process.argv.slice(2).join(" ")));
    process.stdout.write(output.serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
