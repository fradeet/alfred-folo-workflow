import assert from "node:assert/strict";
import test from "node:test";
import { TimelineAppInput } from "../src/app/timeline.js";
import { TimelineBlockInput } from "../src/block/folo/timeline.js";
import { FoloResourceSelection } from "../src/contracts/resource-selection.js";
import { TimelineSelection } from "../src/contracts/timeline-selection.js";
import { FoloEntry, FoloFeed, FoloTimelineSubscription } from "../src/types/folo-types.js";
import { parseResourceUrlInput, resourceUrl } from "../src/app/resource-url.js";
import {
  convertTimelineParams,
  parseTimelineParamsConverterInput,
} from "../src/app/timeline-params-converter.js";

test("resource selections retain their complete cross-app contract", () => {
  const value = new FoloResourceSelection(
    "feed",
    "feed-1",
    "https://app.folo.is/share/feeds/feed-1",
    "https://example.com",
  );
  assert.deepEqual(FoloResourceSelection.parse(value.serialize()), value);
  assert.equal(FoloResourceSelection.parse(value.serialize()).openUrl, "https://example.com");
  assert.ok(parseResourceUrlInput(value.serialize()) instanceof FoloResourceSelection);
  assert.equal(resourceUrl(value).url, "https://example.com");
  assert.equal(convertTimelineParams(value).request.feed, "feed-1");
  assert.ok(parseTimelineParamsConverterInput(value.serialize()) instanceof FoloResourceSelection);
  assert.throws(
    () => parseTimelineParamsConverterInput('{"kind":"folo-resource"}'),
    /resource type|incomplete/i,
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
  assert.ok(parseResourceUrlInput(value.serialize()) instanceof TimelineSelection);
  assert.equal(resourceUrl(value).url, "https://example.com/post");
});

test("timeline app input rehydrates its block input", () => {
  const value = new TimelineAppInput("", new TimelineBlockInput({ list: "list-1" }));
  const parsed = TimelineAppInput.parse(value.serialize());
  assert.ok(parsed.request instanceof TimelineBlockInput);
  assert.equal(parsed.request.list, "list-1");
  assert.throws(
    () => TimelineAppInput.parse('{"kind":"timeline-input","request":"invalid"}'),
    /block input/i,
  );
});
