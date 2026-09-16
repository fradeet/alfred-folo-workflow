#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { emptyItem, errorItem, output, timelineItems } from "../shared/alfred.js";
import { runFolo } from "../shared/folo-cli.js";
import { FoloTimelineResult } from "../types/folo-types.js";
import { cacheIcons } from "../shared/icon-cache.js";
import { isRecord } from "../shared/guards.js";

/** Folo CLI `timeline` options, passed in as JSON by the upstream workflow items. */
export interface TimelineParams {
  view?: string;
  limit?: number;
  unreadOnly?: boolean;
  cursor?: string;
  feed?: string;
  list?: string;
  category?: string;
}

export interface TimelineInput {
  query: string;
  params?: TimelineParams;
}

const optionalParamString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

function timelineParams(value: Record<string, unknown>): TimelineParams {
  const params: TimelineParams = {
    view: optionalParamString(value.view),
    limit: typeof value.limit === "number" && Number.isInteger(value.limit) && value.limit > 0
      ? value.limit
      : undefined,
    unreadOnly: value.unreadOnly === true ? true : undefined,
    cursor: optionalParamString(value.cursor),
    feed: optionalParamString(value.feed),
    list: optionalParamString(value.list),
    category: optionalParamString(value.category),
  };
  return Object.fromEntries(
    Object.entries(params).filter(([, paramValue]) => paramValue !== undefined),
  ) as TimelineParams;
}

export function parseTimelineInput(value: string): TimelineInput {
  const query = value.trim();
  if (!query.startsWith("{")) return { query };

  try {
    const parsed: unknown = JSON.parse(query);
    if (isRecord(parsed)) return { query: "", params: timelineParams(parsed) };
  } catch {
    // Fall through and treat the value as a filter query.
  }

  return { query };
}

export function timelineArguments(params: TimelineParams | undefined, defaultLimit: string): string[] {
  const args = ["timeline", "--limit", String(params?.limit ?? defaultLimit)];
  if (params?.view) args.push("--view", params.view);
  if (params?.feed) args.push("--feed", params.feed);
  if (params?.list) args.push("--list", params.list);
  if (params?.category) args.push("--category", params.category);
  if (params?.cursor) args.push("--cursor", params.cursor);
  if (params?.unreadOnly) args.push("--unread-only");
  return args;
}

async function main(): Promise<void> {
  const input = parseTimelineInput(process.argv.slice(2).join(" "));
  const limit = /^\d+$/.test(process.env.FOLO_LIMIT ?? "") ? process.env.FOLO_LIMIT! : "30";
  const args = timelineArguments(input.params, limit);

  try {
    const data = runFolo(args, {}, FoloTimelineResult.from);
    const iconFor = await cacheIcons(data.entries.map((item) => item.feeds));
    const items = timelineItems(data, input.query, iconFor);
    const emptySubtitle = input.params?.unreadOnly
      ? "This subscription has no unread entries"
      : input.params?.feed || input.params?.list
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
