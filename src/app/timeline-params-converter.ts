#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import type { TimelineParams } from "./timeline.js";

/** Converts a Folo share URL into the JSON params accepted by the timeline entry. */
export function shareUrlTimelineParams(value: string): TimelineParams | undefined {
  const target = parseFoloShareUrl(value);
  if (!target) return undefined;

  return target.type === "list" ? { list: target.id } : { feed: target.id };
}

function main(): void {
  const input = process.argv.slice(2).join(" ");
  const params = shareUrlTimelineParams(input);
  if (params) {
    process.stdout.write(JSON.stringify(params));
    return;
  }

  // Pass unrecognized values through so the timeline entry can treat them as filter text.
  console.error(`Not a Folo share URL, passing through: ${input}`);
  process.stdout.write(input.trim());
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
