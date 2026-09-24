import assert from "node:assert/strict";
import test from "node:test";
import { TimelineStandardInput, parseTimelineAppInput } from "../src/app/timeline.js";
import { SubscriptionSelection } from "../src/contracts/subscription-selection.js";
import { TimelineSelection } from "../src/contracts/timeline-selection.js";
import { UnreadSelection } from "../src/contracts/unread-selection.js";
import {
  FoloEntry,
  FoloFeed,
  FoloSubscription,
  FoloTimelineSubscription,
  FoloUnreadItem,
} from "../src/types/folo-types.js";

test("subscription selections retain and rehydrate their complete upstream item", () => {
  const value = new SubscriptionSelection(new FoloSubscription({
    feedId: "feed-1",
    category: "Tech",
    feeds: { id: "feed-1", title: "Example", siteUrl: "https://example.com" },
  }));
  const parsed = SubscriptionSelection.parse(value.serialize());
  assert.deepEqual(parsed, value);
  assert.ok(parsed.subscription instanceof FoloSubscription);
  assert.ok(parsed.subscription.feeds instanceof FoloFeed);
  assert.deepEqual(parseTimelineAppInput(value.serialize()), value);
  assert.throws(
    () => parseTimelineAppInput('{"kind":"subscription-selection"}'),
    /feed or list/i,
  );
});

test("unread selections retain and rehydrate their complete upstream item", () => {
  const value = new UnreadSelection(new FoloUnreadItem({
    sourceType: "inbox",
    sourceId: "inbox-1",
    feedId: "inbox-feed-1",
    title: "Newsletters",
    unreadCount: 4,
  }));
  const parsed = UnreadSelection.parse(value.serialize());
  assert.deepEqual(parsed, value);
  assert.ok(parsed.item instanceof FoloUnreadItem);
  assert.equal(parsed.resourceId, "inbox-feed-1");
  assert.deepEqual(parseTimelineAppInput(value.serialize()), value);
  assert.throws(
    () => parseTimelineAppInput('{"kind":"unread-selection"}'),
    /unread item/i,
  );
});

test("timeline selections rehydrate nested Folo classes", () => {
  const value = new TimelineSelection(
    "https://example.com/post",
    "entry-1",
    new FoloEntry({ id: "entry-1", title: "Post" }),
    new FoloFeed({ id: "feed-1", title: "Feed" }),
    new FoloTimelineSubscription({ category: "Tech" }),
  );
  const parsed = TimelineSelection.parse(value.serialize());
  assert.ok(parsed.entry instanceof FoloEntry);
  assert.ok(parsed.feed instanceof FoloFeed);
  assert.ok(parsed.subscription instanceof FoloTimelineSubscription);
});

test("timeline app treats retired internal input JSON as a plain query", () => {
  const value = '{"kind":"timeline-input","request":{"list":"list-1"}}';
  assert.deepEqual(parseTimelineAppInput(value, {}), new TimelineStandardInput({ query: value }));
});
