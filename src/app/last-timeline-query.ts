#!/usr/bin/env node
/**
 * Outputs the last successful timeline request as one serialized standard input.
 * This no-input helper is invoked as a terminal script, not an Alfred app input;
 * the standard-input protocol does not apply.
 */
import { pathToFileURL } from "node:url";
import { isRecord } from "../shared/guards.js";
import { readLastTimelineRequest } from "../shared/timeline-cache.js";
import { parseTimelineAppInput, TimelineStandardInput } from "./timeline.js";

export function lastTimelineQuery(): TimelineStandardInput {
  const saved = readLastTimelineRequest();
  let value: unknown;
  try {
    value = JSON.parse(saved) as unknown;
  } catch {
    throw new TypeError("The previous timeline query is invalid JSON");
  }
  if (!isRecord(value) || value.kind !== "standard") {
    throw new TypeError("The previous timeline query is not a standard timeline input");
  }
  const input = parseTimelineAppInput(saved, {});
  if (!(input instanceof TimelineStandardInput)) {
    throw new TypeError("The previous timeline query is not a standard timeline input");
  }
  return input;
}

function main(): void {
  try {
    process.stdout.write(`${lastTimelineQuery().serialize()}\n`);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
