#!/usr/bin/env node
/**
 * Transform entry: converts a Folo share URL into timeline JSON parameters.
 *
 * Input (argv joined with spaces): a Folo share URL such as
 * `https://app.folo.is/share/feeds/<id>` or `/share/lists/<id>`.
 *
 * Output: a serialized {@link TimelineAppInput}. Resource selections and Folo
 * share URLs become typed feed/list requests; other values become filter text.
 */
import { pathToFileURL } from "node:url";
import { parseFoloShareUrl } from "../shared/folo-url.js";
import { TimelineBlockInput } from "../block/folo/timeline.js";
import { FoloResourceSelection } from "../contracts/resource-selection.js";
import { TimelineAppInput } from "./timeline.js";

export class TimelineParamsConverterInput {
  constructor(readonly value: string) {}

  static parse(value: string): TimelineParamsConverterInput {
    return new TimelineParamsConverterInput(value.trim());
  }
}

/** Converts a Folo share URL into the class accepted by the timeline entry. */
export function shareUrlTimelineInput(value: string): TimelineAppInput | undefined {
  const target = parseFoloShareUrl(value);
  if (!target) return undefined;

  return new TimelineAppInput(
    "",
    new TimelineBlockInput(target.type === "list" ? { list: target.id } : { feed: target.id }),
  );
}

export function resourceTimelineInput(value: string): TimelineAppInput | undefined {
  try {
    const resource = FoloResourceSelection.parse(value);
    return new TimelineAppInput(
      "",
      new TimelineBlockInput(
        resource.resourceType === "list"
          ? { list: resource.resourceId }
          : { feed: resource.resourceId },
      ),
    );
  } catch {
    return undefined;
  }
}

export function convertTimelineParams(input: TimelineParamsConverterInput): TimelineAppInput {
  return resourceTimelineInput(input.value)
    ?? shareUrlTimelineInput(input.value)
    ?? new TimelineAppInput(input.value);
}

function main(): void {
  const input = TimelineParamsConverterInput.parse(process.argv.slice(2).join(" "));
  process.stdout.write(convertTimelineParams(input).serialize());
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
