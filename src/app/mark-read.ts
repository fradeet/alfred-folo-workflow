#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { FoloError, runFolo } from "../shared/folo-cli.js";

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
