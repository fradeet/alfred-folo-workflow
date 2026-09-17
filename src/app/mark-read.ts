#!/usr/bin/env node
/**
 * "Mark read" Run Script entry: marks a single timeline entry as read.
 *
 * Input (argv joined with spaces): a serialized timeline selection passed down
 * unchanged from the timeline Script Filter.
 *
 * Output:
 * - stdout: a serialized {@link MarkReadAppOutput} on success.
 * - On failure: the error message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { MarkReadBlockInput, MarkReadBlockOutput, markEntryRead } from "../block/folo/mark-read.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { SerializedValue } from "../contracts/serialized-value.js";

export class MarkReadAppOutput extends SerializedValue {
  readonly kind = "mark-read-result";

  constructor(readonly entryId: string) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, entryId: this.entryId };
  }
}

/** Marks the selected Folo entry as read. */
export function markRead(input: TimelineSelection): MarkReadAppOutput {
  const result: MarkReadBlockOutput = markEntryRead(new MarkReadBlockInput(input.entryId));
  return new MarkReadAppOutput(result.entryId);
}

function main(): void {
  try {
    const input = TimelineSelection.parse(process.argv.slice(2).join(" "));
    process.stdout.write(markRead(input).serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
