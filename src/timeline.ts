#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, output, timelineItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloTimelineResult } from "./types/folo-types.js";
import { cacheIcons } from "./icon-cache.js";

export interface TimelineInput {
  query: string;
  target?: { type: "feed" | "list"; id: string };
}

export function parseTimelineInput(value: string): TimelineInput {
  const query = value.trim();

  try {
    const url = new URL(query);
    const match = /^\/share\/(feeds|lists)\/([^/]+)\/?$/.exec(url.pathname);
    if (url.hostname === "app.folo.is" && match) {
      return {
        query: "",
        target: {
          type: match[1] === "lists" ? "list" : "feed",
          id: decodeURIComponent(match[2]!),
        },
      };
    }
  } catch {
    // A normal Alfred query is not expected to be a URL.
  }

  return { query };
}

export function timelineArguments(input: TimelineInput, limit: string, unreadOnly = false): string[] {
  const args = ["timeline", "--limit", limit];
  if (input.target) args.push(`--${input.target.type}`, input.target.id);
  if (unreadOnly) args.push("--unread-only");
  return args;
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const unreadOnly = arguments_.includes("--unread-only");
  const input = parseTimelineInput(arguments_.filter((value) => value !== "--unread-only").join(" "));
  const limit = /^\d+$/.test(process.env.FOLO_LIMIT ?? "") ? process.env.FOLO_LIMIT! : "30";
  const args = timelineArguments(input, limit, unreadOnly);

  try {
    const data = runFolo(args, {}, FoloTimelineResult.from);
    const iconFor = await cacheIcons(data.entries.map((item) => item.feeds));
    const items = timelineItems(data, input.query, iconFor);
    const emptySubtitle = unreadOnly
      ? "This subscription has no unread entries"
      : input.target
        ? "This subscription has no entries"
        : "Try another query";
    output(items.length ? items : [emptyItem("No Folo entries", emptySubtitle)], 60);
  } catch (error: unknown) {
    console.error(error);
    output([errorItem(error)]);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
