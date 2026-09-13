#!/usr/bin/env node
import { emptyItem, errorItem, output, subscriptionItems } from "./alfred.js";
import { runFolo } from "./folo-cli.js";
import { FoloSubscriptionsResult } from "./folo-types.js";

const query = process.argv.slice(2).join(" ");

try {
  const data = runFolo(["subscription", "list"], {}, FoloSubscriptionsResult.from);
  const items = subscriptionItems(data, query);
  output(items.length ? items : [emptyItem("No Folo subscriptions", "Try another query")], 60);
} catch (error: unknown) {
  console.error(error);
  output([errorItem(error)]);
  process.exitCode = 1;
}
