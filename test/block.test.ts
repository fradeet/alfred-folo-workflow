import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FoloError } from "../src/block/folo/client.js";
import { LoginBlockInput } from "../src/block/folo/login.js";
import { MarkAllReadBlockInput, MarkAllReadView } from "../src/block/folo/mark-all-read.js";
import { MarkReadBlockInput } from "../src/block/folo/mark-read.js";
import { SubscriptionsBlockInput } from "../src/block/folo/subscriptions.js";
import { TimelineBlockInput } from "../src/block/folo/timeline.js";
import { UnreadBlockInput } from "../src/block/folo/unread.js";
import { FoloTimelineResult, FoloView } from "../src/types/folo-types.js";
import { readResponseCache, responseCacheFilename, writeResponseCache } from "../src/shared/response-cache.js";
import { readLastTimelineRequest, readTimelineCache, timelineCacheFilename, writeLastTimelineRequest, writeTimelineCache } from "../src/shared/timeline-cache.js";

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
  assert.deepEqual(new MarkAllReadBlockInput().toArguments(), ["entry", "mark-all-read"]);
  assert.deepEqual(
    new MarkAllReadBlockInput({ view: "articles", feed: " feed-1 " }).toArguments(),
    ["entry", "mark-all-read", "--view", "articles", "--feed", "feed-1"],
  );
  assert.deepEqual(
    new MarkAllReadBlockInput({ view: " Videos " as MarkAllReadView }).toArguments(),
    ["entry", "mark-all-read", "--view", "videos"],
  );
  assert.deepEqual(
    new MarkAllReadBlockInput({ view: FoloView.Notifications }).toArguments(),
    ["entry", "mark-all-read", "--view", "5"],
  );
  assert.deepEqual(
    new MarkAllReadBlockInput({ list: "list-1" }).toArguments(),
    ["entry", "mark-all-read", "--list", "list-1"],
  );
});

test("Folo block inputs validate boundary values", () => {
  assert.throws(() => new LoginBlockInput(0), /positive integer/i);
  assert.throws(() => new MarkReadBlockInput(""), /entry ID/i);
  assert.throws(() => new MarkAllReadBlockInput({ feed: "f", list: "l" }), /only one of feed or list/i);
  assert.throws(() => new MarkAllReadBlockInput({ view: 9 as FoloView }), /invalid view/i);
  assert.throws(
    () => new MarkAllReadBlockInput({ view: "bogus" as MarkAllReadView }),
    /invalid view "bogus"\. use articles\(0\)/i,
  );
  assert.equal(new MarkAllReadBlockInput({ feed: " " }).feed, undefined);
  assert.equal(new MarkAllReadBlockInput({ view: " " as MarkAllReadView }).view, undefined);
  assert.equal(new TimelineBlockInput({ limit: -1 }).limit, undefined);
});

test("response cache filenames derive a stable key from the CLI arguments", () => {
  const command = new TimelineBlockInput({ feed: "feed-1" }).toArguments();
  assert.match(responseCacheFilename(command), /^timeline-[0-9a-f]{64}\.json$/);
  assert.equal(responseCacheFilename(command), responseCacheFilename([...command]));
  assert.notEqual(
    responseCacheFilename(command),
    responseCacheFilename(new TimelineBlockInput({ feed: "feed-2" }).toArguments()),
  );
  assert.notEqual(
    responseCacheFilename(command),
    responseCacheFilename(new UnreadBlockInput().toArguments()),
  );
});

test("response cache stores CLI payloads as JSON files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-cache-"));
  try {
    const command = ["timeline", "--limit", "30"];
    writeResponseCache(command, { entries: ["entry-1"] }, { cacheDirectory: directory });
    const stored = JSON.parse(await readFile(join(directory, responseCacheFilename(command)), "utf8"));
    assert.deepEqual(stored, { entries: ["entry-1"] });

    writeResponseCache(command, { entries: ["entry-2"] }, { cacheDirectory: directory });
    const replaced = JSON.parse(await readFile(join(directory, responseCacheFilename(command)), "utf8"));
    assert.deepEqual(replaced, { entries: ["entry-2"] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("response cache reads stored payloads back and rejects foreign filenames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-cache-"));
  try {
    const command = ["timeline", "--limit", "30"];
    writeResponseCache(command, { entries: ["entry-1"] }, { cacheDirectory: directory });
    assert.deepEqual(
      readResponseCache(responseCacheFilename(command), { cacheDirectory: directory }),
      { entries: ["entry-1"] },
    );

    assert.throws(() => readResponseCache("", { cacheDirectory: directory }), /reported by this workflow/);
    assert.throws(
      () => readResponseCache("../../outside.json", { cacheDirectory: directory }),
      /reported by this workflow/,
    );
    assert.throws(
      () => readResponseCache(responseCacheFilename(["timeline"]), { cacheDirectory: directory }),
      /unavailable/,
    );

    const corrupt = responseCacheFilename(["corrupt"]);
    await writeFile(join(directory, corrupt), "not json");
    assert.throws(
      () => readResponseCache(corrupt, { cacheDirectory: directory }),
      /not valid JSON/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("timeline cache reads fresh entries by complete query and retains the capture time", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-timeline-cache-"));
  try {
    const request = JSON.stringify({ query: "TypeScript", unreadOnly: true, view: "articles", cursor: "" });
    const otherQuery = JSON.stringify({ query: "JavaScript", unreadOnly: true, view: "articles", cursor: "" });
    const allEntries = JSON.stringify({ query: "TypeScript", unreadOnly: false, view: "articles", cursor: "" });
    const nextPage = JSON.stringify({ query: "TypeScript", unreadOnly: true, view: "articles", cursor: "next" });
    const capturedAt = Date.parse("2026-09-26T10:00:00.000Z");
    const data = FoloTimelineResult.from({
      entries: [{
        entries: { id: "entry-1", media: [{ url: "https://example.com/a", preview_image_url: "https://example.com/p" }],
          attachments: [{ url: "https://example.com/b", mime_type: "audio/mpeg", duration_in_seconds: 0 }] },
        feeds: { id: "feed-1" },
      }],
      nextCursor: null,
      hasNext: false,
    });
    writeTimelineCache(request, data, { cacheDirectory: directory, now: capturedAt });
    assert.notEqual(timelineCacheFilename(request), timelineCacheFilename(otherQuery));
    assert.deepEqual(readTimelineCache(request, { cacheDirectory: directory, now: capturedAt + 59_999 }), {
      cachedAt: "2026-09-26T10:00:00.000Z",
      data,
    });
    assert.equal(readTimelineCache(otherQuery, { cacheDirectory: directory, now: capturedAt }), undefined);
    assert.equal(readTimelineCache(allEntries, { cacheDirectory: directory, now: capturedAt }), undefined);
    assert.equal(readTimelineCache(nextPage, { cacheDirectory: directory, now: capturedAt }), undefined);
    assert.equal(readTimelineCache(request, { cacheDirectory: directory, now: capturedAt + 60_000 }), undefined);
    assert.equal(readTimelineCache(request, { cacheDirectory: directory, now: capturedAt - 1 }), undefined);

    await writeFile(join(directory, timelineCacheFilename(request)), "{broken");
    assert.equal(readTimelineCache(request, { cacheDirectory: directory, now: capturedAt }), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("last timeline request survives result expiry and reports missing or invalid records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-last-query-"));
  try {
    assert.throws(() => readLastTimelineRequest({ cacheDirectory: directory }), /No previous timeline query/);
    const request = JSON.stringify({ kind: "standard", query: "first", unreadOnly: true });
    writeLastTimelineRequest(request, { cacheDirectory: directory, now: 1_000 });
    assert.equal(readLastTimelineRequest({ cacheDirectory: directory, now: 1_000_000 }), request);
    await writeFile(join(directory, "last-timeline-request.json"), '{"request":42}');
    assert.throws(() => readLastTimelineRequest({ cacheDirectory: directory }), /previous timeline query is invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FoloError keeps its code and name", () => {
  const error = new FoloError("UNAUTHORIZED", "Login first");
  assert.equal(error.code, "UNAUTHORIZED");
  assert.equal(error.name, "FoloError");
});
