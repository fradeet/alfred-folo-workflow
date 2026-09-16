#!/usr/bin/env node
/**
 * Transform entry: converts a Folo share URL into timeline JSON parameters.
 *
 * Input (argv joined with spaces): a serialized {@link FoloResourceSelection}
 * from an upstream Script Filter, or a Folo share URL from Universal Actions.
 *
 * Output: a serialized {@link TimelineAppInput}. Resource selections and Folo
 * share URLs become typed feed/list requests; other values become filter text.
 */
import { pathToFileURL } from "node:url";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import { TimelineBlockInput } from "../block/folo/timeline.js";
import { FoloResourceSelection } from "../contracts/resource-selection.js";
import { TimelineAppInput } from "./timeline.js";

export class FoloShareUrlInput {
  readonly target: NonNullable<ReturnType<typeof parseFoloShareUrl>>;

  constructor(readonly value: string) {
    const target = parseFoloShareUrl(value);
    if (!target) throw new TypeError("A Folo share URL is required");
    this.target = target;
  }
}

export type TimelineParamsConverterInput =
  | FoloResourceSelection
  | FoloShareUrlInput
  | TimelineAppInput;

/** Converts a Folo share URL into the class accepted by the timeline entry. */
export function shareUrlTimelineInput(input: FoloShareUrlInput): TimelineAppInput {
  const target = input.target;

  return new TimelineAppInput(
    "",
    new TimelineBlockInput(target.type === "list" ? { list: target.id } : { feed: target.id }),
  );
}

export function resourceTimelineInput(resource: FoloResourceSelection): TimelineAppInput {
  return new TimelineAppInput(
    "",
    new TimelineBlockInput(
      resource.resourceType === "list"
        ? { list: resource.resourceId }
        : { feed: resource.resourceId },
    ),
  );
}

export function convertTimelineParams(input: TimelineParamsConverterInput): TimelineAppInput {
  if (input instanceof FoloResourceSelection) return resourceTimelineInput(input);
  if (input instanceof FoloShareUrlInput) return shareUrlTimelineInput(input);
  return input;
}

export function parseTimelineParamsConverterInput(value: string): TimelineParamsConverterInput {
  const input = value.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    // Non-JSON values may be a URL or a plain timeline filter query.
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const data = parsed as Record<string, unknown>;
    if (data.kind === "folo-resource") return FoloResourceSelection.from(data);
  }

  return parseFoloShareUrl(input)
    ? new FoloShareUrlInput(input)
    : new TimelineAppInput(input);
}

function main(): void {
  const input = parseTimelineParamsConverterInput(process.argv.slice(2).join(" "));
  process.stdout.write(convertTimelineParams(input).serialize());
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
