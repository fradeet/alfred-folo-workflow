import assert from "node:assert/strict";
import test from "node:test";
import { LoginBlockInput } from "../src/block/folo/login.js";
import { MarkReadBlockInput } from "../src/block/folo/mark-read.js";
import { SubscriptionsBlockInput } from "../src/block/folo/subscriptions.js";
import { TimelineBlockInput } from "../src/block/folo/timeline.js";
import { UnreadBlockInput } from "../src/block/folo/unread.js";

test("Folo block inputs own their complete CLI argument mapping", () => {
  assert.deepEqual(
    new TimelineBlockInput({ category: "Tech", cursor: "cursor", unreadOnly: true }).toArguments(),
    ["timeline", "--limit", "30", "--category", "Tech", "--cursor", "cursor", "--unread-only"],
  );
  assert.deepEqual(
    new SubscriptionsBlockInput("articles", "Tech").toArguments(),
    ["subscription", "list", "--view", "articles", "--category", "Tech"],
  );
  assert.deepEqual(new UnreadBlockInput("articles").toArguments(), ["unread", "list", "--view", "articles"]);
  assert.deepEqual(new MarkReadBlockInput(" entry-1 ").toArguments(), ["entry", "mark-read", "entry-1"]);
});

test("Folo block inputs validate boundary values", () => {
  assert.throws(() => new LoginBlockInput(0), /positive integer/i);
  assert.throws(() => new MarkReadBlockInput(""), /entry ID/i);
  assert.equal(new TimelineBlockInput({ limit: -1 }).limit, undefined);
});
