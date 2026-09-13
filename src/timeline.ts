#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, output, timelineItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloTimelineResult } from "./folo-types.js";

export interface TimelineInput {
  query: string;
  target?: { type: "feed" | "list"; id: string };
}

export function parseTimelineInput(value: string): TimelineInput {
  const query = value.trim();

  try {
    const url = new URL(query);
    const match = /^\/share\/(feeds|lists)\/([0-9]+)\/?$/.exec(url.pathname);
    if (url.hostname === "app.folo.is" && match) {
      return {
        query: "",
        target: {
          type: match[1] === "lists" ? "list" : "feed",
          id: match[2]!,
        },
      };
    }
  } catch {
    // A normal Alfred query is not expected to be a URL.
  }

  return { query };
}

function main(): void {
  const input = parseTimelineInput(process.argv.slice(2).join(" "));
  const limit = /^\d+$/.test(process.env.FOLO_LIMIT ?? "") ? process.env.FOLO_LIMIT! : "30";
  const args = ["timeline", "--limit", limit];
  if (input.target) args.push(`--${input.target.type}`, input.target.id);

  try {
    const items = timelineItems(runFolo(args, {}, FoloTimelineResult.from), input.query);
    const emptySubtitle = input.target ? "This subscription has no entries" : "Try another query";
    output(items.length ? items : [emptyItem("No Folo entries", emptySubtitle)], 60);
  } catch (error: unknown) {
    console.error(error);
    output([errorItem(error)]);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
