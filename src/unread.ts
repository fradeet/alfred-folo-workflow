#!/usr/bin/env node
import { emptyItem, errorItem, output, unreadItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloUnreadResult } from "./folo-types.js";

const query = process.argv.slice(2).join(" ");

try {
  const data = runFolo(["unread", "list"], {}, FoloUnreadResult.from);
  const items = unreadItems(data, query);
  output(items.length ? items : [emptyItem("No unread subscriptions", "You're all caught up")], 60);
} catch (error: unknown) {
  console.error(error);
  output([errorItem(error)]);
  process.exitCode = 1;
}
