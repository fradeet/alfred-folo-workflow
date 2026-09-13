#!/usr/bin/env node
import { emptyItem, errorItem, output, timelineItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloTimelineResult } from "./folo-types.js";

const query = process.argv.slice(2).join(" ");
const limit = /^\d+$/.test(process.env.FOLO_LIMIT ?? "") ? process.env.FOLO_LIMIT! : "30";
const args = ["timeline", "--limit", limit];

if (process.env.FOLO_VIEW) args.push("--view", process.env.FOLO_VIEW);

try {
  const items = timelineItems(runFolo(args, {}, FoloTimelineResult.from), query);
  output(items.length ? items : [emptyItem("No Folo entries", "Try another query or view")], 60);
} catch (error: unknown) {
  console.error(error);
  output([errorItem(error)]);
  process.exitCode = 1;
}
