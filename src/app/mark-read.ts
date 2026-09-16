#!/usr/bin/env node
/**
 * "Mark read" Run Script entry: marks a single timeline entry as read.
 *
 * Input (argv joined with spaces): the entry ID, typically the `entryId` of a
 * {@link FoloEntryOutput} arg passed down from the timeline Script Filter.
 *
 * Output:
 * - stdout: the trimmed entry ID on success.
 * - On failure: the error message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { FoloError, runFolo } from "../shared/folo-cli.js";

/** Marks the Folo entry as read and returns the normalized entry ID. */
export function markRead(entryId: string): string {
  const normalizedEntryId = entryId.trim();
  if (!normalizedEntryId) {
    throw new FoloError("INVALID_ARGUMENT", "Entry ID is required");
  }

  runFolo(["entry", "mark-read", normalizedEntryId], {}, (data) => data);
  return normalizedEntryId;
}

function main(): void {
  try {
    process.stdout.write(markRead(process.argv.slice(2).join(" ")));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
