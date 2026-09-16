import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { errorItem, subscriptionItems, timelineItems, unreadItems } from "../src/shared/alfred.js";
import {
  AlfredSF,
  AlfredSFCache,
  AlfredSFItem,
  AlfredSFItemText,
  AlfredTV,
  AlfredTVBehaviour,
  AlfredTVBehaviourInputField,
  AlfredTVBehaviourResponse,
  AlfredTVBehaviourScroll,
} from "../src/types/alfred-types.js";
import { FoloError, parseFoloEnvelope } from "../src/block/folo/client.js";
import { MarkReadBlockInput } from "../src/block/folo/mark-read.js";
import { TimelineBlockInput } from "../src/block/folo/timeline.js";
import {
  FoloAttachment,
  FoloLoginResult,
  FoloSubscriptionsResult,
  FoloTimelineItem,
  FoloTimelineResult,
  FoloUnreadResult,
  FoloUser,
  FoloView,
} from "../src/types/folo-types.js";
import { readToken, setWorkflowToken } from "../src/app/login.js";
import {
  FoloShareUrlInput,
  resourceTimelineInput,
  shareUrlTimelineInput,
} from "../src/app/timeline-params-converter.js";
import { TimelineAppInput } from "../src/app/timeline.js";
import { parseFoloShareUrl } from "../src/shared/folo-url.js";
import { cacheIcons, feedIconCacheKey, feedIconUrl, loadCachedIcons } from "../src/shared/icon-cache.js";
import { FoloResourceSelection } from "../src/contracts/resource-selection.js";
import { TimelineSelection } from "../src/contracts/timeline-selection.js";
import { resourceUrl } from "../src/app/resource-url.js";

test("feedIconUrl prefers an official image and falls back to Folo's domain icon", () => {
  assert.equal(feedIconUrl({
    image: "https://cdn.example.com/icon.webp",
    siteUrl: "https://www.example.com/posts",
  }), "https://cdn.example.com/icon.webp");
  assert.equal(feedIconUrl({ siteUrl: "https://bookfere.com/feed" }), "https://icons.folo.is/bookfere.com");
  assert.equal(feedIconUrl({ url: "https://allenai.org/rss.xml" }), "https://icons.folo.is/allenai.org");
  assert.equal(feedIconUrl({ image: "file:///tmp/icon.png" }), undefined);
});

test("feedIconCacheKey uses feed and list IDs instead of image URLs", () => {
  assert.equal(feedIconCacheKey({ id: "feed-1", image: "https://cdn.example.com/one.png" }), "feed-1");
  assert.equal(feedIconCacheKey({ sourceType: "feed", sourceId: "feed-2" }), "feed-2");
  assert.equal(feedIconCacheKey({ sourceType: "list", sourceId: "list-1" }), "list-1");
});

test("cacheIcons downloads each icon once and reuses its local path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-icons-"));
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests += 1;
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png" },
    });
  };

  try {
    const source = { id: "feed-1", image: "https://cdn.example.com/icon" };
    const first = await cacheIcons([source, source], { cacheDirectory: directory, fetcher });
    const firstPath = first(source);
    assert.ok(firstPath?.endsWith(".png"));
    assert.deepEqual([...await readFile(firstPath!)], [137, 80, 78, 71]);

    const changedSource = { id: "feed-1", image: "https://cdn.example.com/changed-icon" };
    const second = await cacheIcons([changedSource], { cacheDirectory: directory, fetcher });
    assert.equal(second(changedSource), firstPath);
    assert.equal(requests, 1);

    const unreadSource = { sourceType: "feed", sourceId: "feed-1" };
    const cachedOnly = await loadCachedIcons([unreadSource], { cacheDirectory: directory });
    assert.equal(cachedOnly(unreadSource), firstPath);

    const unread = unreadItems(FoloUnreadResult.from({
      total: 1,
      items: [{ sourceType: "list", sourceId: "feed-1", title: "List", unreadCount: 1 }],
    }), "", cachedOnly);
    assert.equal(unread[0]?.icon?.path, firstPath);

    const items = timelineItems(FoloTimelineResult.from({
      entries: [{ entries: { id: "entry-1", title: "Post" }, feeds: source }],
      nextCursor: null,
      hasNext: false,
    }), "", second);
    assert.equal(items[0]?.icon?.path, firstPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("subscriptionItems maps every subscription target and filters locally", () => {
  const raw = {
    subscriptions: [
      {
        listId: "list-1",
        title: null,
        category: "Tech",
        lists: {
          id: "list-1",
          title: "Daily Reads",
          description: "A useful bundle",
          feedIds: ["feed-1", "feed-2"],
        },
      },
      {
        feedId: "feed-1",
        feeds: { id: "feed-1", title: "Example Feed", siteUrl: "https://example.com" },
      },
      { feedId: "inbox-inbox-1", inboxId: "inbox-1", inboxes: { id: "inbox-1", title: "Newsletters" } },
    ],
  };

  const data = FoloSubscriptionsResult.from(raw);
  const items = subscriptionItems(data);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, "Daily Reads");
  assert.match(items[0]?.subtitle ?? "", /List.*Tech.*2 feeds.*useful bundle/);
  assert.deepEqual(FoloResourceSelection.parse(String(items[0]?.arg)), new FoloResourceSelection(
    "list",
    "list-1",
    "https://app.folo.is/share/lists/list-1",
  ));
  assert.deepEqual(FoloResourceSelection.parse(String(items[1]?.arg)), new FoloResourceSelection(
    "feed",
    "feed-1",
    "https://app.folo.is/share/feeds/feed-1",
    "https://example.com",
  ));
  assert.equal(subscriptionItems(data, "useful").length, 1);
  assert.equal(subscriptionItems(data, "missing").length, 0);
});

test("unreadItems maps unread sources and filters locally", () => {
  const data = FoloUnreadResult.from({
    total: 15,
    items: [
      { sourceType: "feed", sourceId: "feed-1", title: "Example Feed", category: "Tech", unreadCount: 12 },
      { sourceType: "list", sourceId: "list-1", title: "Daily Reads", unreadCount: 2 },
      { sourceType: "inbox", sourceId: "inbox-1", feedId: "inbox-inbox-1", title: "Newsletters", unreadCount: 1 },
    ],
  });

  const items = unreadItems(data);
  assert.equal(items.length, 3);
  assert.match(items[0]?.subtitle ?? "", /12 unread.*Feed.*Tech/);
  assert.equal(FoloResourceSelection.parse(String(items[0]?.arg)).resourceId, "feed-1");
  assert.equal(items[0]?.variables, undefined);
  assert.equal(FoloResourceSelection.parse(String(items[1]?.arg)).resourceType, "list");
  assert.equal(FoloResourceSelection.parse(String(items[2]?.arg)).resourceId, "inbox-inbox-1");
  assert.equal(unreadItems(data, "newsletters").length, 1);
  assert.equal(unreadItems(data, "missing").length, 0);
});

test("TimelineAppInput restores its nested block input and treats other JSON as a query", () => {
  const serialized = new TimelineAppInput(
    "",
    new TimelineBlockInput({ feed: "41470869403557888", unreadOnly: true }),
  ).serialize();
  assert.deepEqual(TimelineAppInput.parse(serialized), new TimelineAppInput(
    "",
    new TimelineBlockInput({ feed: "41470869403557888", unreadOnly: true }),
  ));
  assert.deepEqual(TimelineAppInput.parse("Alfred Blog"), new TimelineAppInput("Alfred Blog"));
  assert.deepEqual(TimelineAppInput.parse("{oops"), new TimelineAppInput("{oops"));
  assert.deepEqual(TimelineAppInput.parse('{"feed":"feed-1"}'), new TimelineAppInput('{"feed":"feed-1"}'));
});

test("parseFoloShareUrl parses feed and list share URLs", () => {
  assert.deepEqual(parseFoloShareUrl("https://app.folo.is/share/feeds/feed-1"), {
    type: "feed",
    id: "feed-1",
  });
  assert.deepEqual(parseFoloShareUrl("https://app.folo.is/share/lists/list-1/"), {
    type: "list",
    id: "list-1",
  });
  assert.equal(parseFoloShareUrl("Alfred Blog"), undefined);
});

test("resourceUrl consumes a complete resource selection", () => {
  const feed = new FoloResourceSelection(
    "feed",
    "feed-1",
    "https://app.folo.is/share/feeds/feed-1",
    "https://example.com",
  );
  const list = new FoloResourceSelection(
    "list",
    "list-1",
    "https://app.folo.is/share/lists/list-1",
  );
  assert.equal(resourceUrl(FoloResourceSelection.parse(feed.serialize())).serialize(), "https://example.com");
  assert.equal(resourceUrl(FoloResourceSelection.parse(list.serialize())).serialize(), list.shareUrl);
});

test("shareUrlTimelineInput converts share URLs into typed timeline input", () => {
  assert.equal(
    shareUrlTimelineInput(new FoloShareUrlInput("https://app.folo.is/share/feeds/41470869403557888")).request.feed,
    "41470869403557888",
  );
  assert.equal(
    shareUrlTimelineInput(new FoloShareUrlInput("https://app.folo.is/share/lists/162747179238521856")).request.list,
    "162747179238521856",
  );
  assert.throws(() => new FoloShareUrlInput("https://example.com/feed"), /Folo share URL/i);
});

test("TimelineBlockInput maps its fields onto Folo CLI flags", () => {
  assert.deepEqual(new TimelineBlockInput({ feed: "feed-1", unreadOnly: true }).toArguments(), [
    "timeline",
    "--limit",
    "30",
    "--feed",
    "feed-1",
    "--unread-only",
  ]);

  assert.deepEqual(new TimelineBlockInput({ list: "list-1", limit: 10, view: "articles" }).toArguments(), [
    "timeline",
    "--limit",
    "10",
    "--view",
    "articles",
    "--list",
    "list-1",
  ]);

  assert.deepEqual(new TimelineBlockInput().withDefaultLimit(50).toArguments(), ["timeline", "--limit", "50"]);
});

test("resourceTimelineInput accepts the upstream selection directly", () => {
  const selection = new FoloResourceSelection(
    "list",
    "list-1",
    "https://app.folo.is/share/lists/list-1",
  );
  assert.equal(resourceTimelineInput(selection).request.list, "list-1");
});

test("FoloSubscriptionsResult keeps feed, list, and inbox subscriptions", () => {
  const result = FoloSubscriptionsResult.from({
    subscriptions: [
      {
        userId: "user-1",
        feedId: "feed-1",
        hideFromTimeline: false,
        feeds: { id: "feed-1", owner: { id: "owner-1", name: "Ada" } },
        boost: { boosters: [{ id: "booster-1", name: "Grace" }] },
      },
      { inboxId: "inbox-1", inboxes: { id: "inbox-1" } },
      {
        listId: "list-1",
        category: "Tech",
        lists: { id: "list-1", title: "Daily Reads", feedIds: ["feed-1"] },
      },
    ],
  });

  assert.equal(result.subscriptions.length, 3);
  assert.equal(result.subscriptions[0]?.feeds?.id, "feed-1");
  assert.equal(result.subscriptions[0]?.userId, "user-1");
  assert.equal(result.subscriptions[0]?.hideFromTimeline, false);
  assert.equal(result.subscriptions[0]?.feeds?.owner?.name, "Ada");
  assert.equal(result.subscriptions[0]?.boost?.boosters[0]?.name, "Grace");
  assert.equal(result.subscriptions[1]?.inboxes?.id, "inbox-1");
  assert.equal(result.subscriptions[2]?.lists?.title, "Daily Reads");
  assert.deepEqual(result.subscriptions[2]?.lists?.feedIds, ["feed-1"]);
  assert.throws(() => FoloSubscriptionsResult.from({ subscriptions: "invalid" }), /subscriptions array/i);
});

test("FoloUnreadResult validates and converts unread subscriptions", () => {
  const result = FoloUnreadResult.from({
    total: 7,
    items: [{
      sourceType: "feed",
      sourceId: "feed-1",
      feedId: "feed-1",
      title: "Example Feed",
      unreadCount: 7,
      view: 0,
    }],
  });

  assert.equal(result.total, 7);
  assert.equal(result.items[0]?.unreadCount, 7);
  assert.equal(result.items[0]?.view, FoloView.Articles);
  assert.throws(() => FoloUnreadResult.from({ items: "invalid" }), /items array/i);
});

test("timelineItems maps and filters Folo entry envelopes", () => {
  const raw = {
    entries: [{
      read: false,
      subscriptions: { category: "Tech", title: "News" },
      entries: {
        id: "entry-1",
        title: "Hello &amp; Folo",
        description: "<p>A useful post</p>",
        author: "Ada",
        publishedAt: "2026-09-12T10:00:00.000Z",
        url: "https://example.com/post",
      },
      feeds: { title: "Example Feed", siteUrl: "https://example.com" },
    }],
    nextCursor: null,
    hasNext: false,
  };

  const data = FoloTimelineResult.from(raw);
  const items = timelineItems(data, "useful");
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "Hello & Folo");
  const selection = TimelineSelection.parse(String(items[0]?.arg));
  assert.equal(selection.url, "https://example.com/post");
  assert.equal(selection.entryId, "entry-1");
  assert.equal(selection.entry.title, "Hello &amp; Folo");
  assert.equal(selection.feed.title, "Example Feed");
  assert.equal(selection.subscription?.category, "Tech");
  assert.equal(items[0]?.variables, undefined);
  assert.equal(timelineItems(data, "missing").length, 0);
});

test("MarkReadBlockInput rejects a missing entry ID before calling Folo", () => {
  assert.throws(() => new MarkReadBlockInput("  "), /Entry ID is required/);
});

test("TimelineSelection serializes and restores every nested class", () => {
  const serialized = new TimelineSelection(
    "https://example.com/post",
    "entry-1",
    new FoloTimelineItem({
      entries: { id: "entry-1", title: "Post" },
      feeds: { id: "feed-1", title: "Example Feed" },
      subscriptions: { category: "Tech", title: "" },
    }).entries,
    new FoloTimelineItem({
      entries: { id: "entry-1" },
      feeds: { id: "feed-1", title: "Example Feed" },
    }).feeds,
    new FoloTimelineItem({
      entries: { id: "entry-1" },
      feeds: {},
      subscriptions: { category: "Tech", title: "" },
    }).subscriptions,
  ).serialize();

  const parsed = TimelineSelection.parse(serialized);
  assert.equal(parsed.entry.title, "Post");
  assert.equal(parsed.feed.title, "Example Feed");
  assert.equal(parsed.subscription?.category, "Tech");
  assert.ok(parsed.entry instanceof Object);
  assert.throws(() => TimelineSelection.parse("https://example.com/post"), /valid JSON/);
});

test("errorItem gives authentication guidance", () => {
  const item = errorItem({ code: "UNAUTHORIZED", message: "Missing token" });
  assert.equal(item.valid, false);
  assert.match(item.title, /authentication/i);
});

test("errorItem gives useful timeout guidance", () => {
  const item = errorItem({ code: "TIMEOUT", message: "spawnSync ETIMEDOUT" });
  assert.match(item.subtitle ?? "", /timed out/i);
});

test("login helpers read and validate the saved token", () => {
  assert.equal(readToken('{"token":"secret"}'), "secret");
  assert.throws(() => readToken("{}"), /token/i);
  assert.throws(() => setWorkflowToken(""), /empty/i);
  assert.throws(() => setWorkflowToken("secret", {}), /alfred_workflow_bundleid/i);
});

test("FoloLoginResult exposes the user returned by login", () => {
  const result = FoloLoginResult.from({
    message: "Login successful.",
    configPath: "/tmp/folo-config.json",
    user: {
      id: "user-1",
      name: "Ada",
      handle: "ada",
      email: "ada@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  });

  assert.ok(result.user instanceof FoloUser);
  assert.deepEqual(JSON.parse(JSON.stringify(result.user)), {
    id: "user-1",
    name: "Ada",
    handle: "ada",
    email: "ada@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  });
});

test("FoloUser requires the non-null authentication fields", () => {
  const requiredUser = {
    id: "user-1",
    email: "ada@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  const expectedErrors: Record<string, RegExp> = {
    id: /user ID/i,
    email: /user email/i,
    createdAt: /user creation time/i,
    updatedAt: /user update time/i,
  };

  for (const [field, expectedError] of Object.entries(expectedErrors)) {
    const incompleteUser = { ...requiredUser } as Record<string, string>;
    delete incompleteUser[field];
    assert.throws(() => new FoloUser(incompleteUser), expectedError);
  }
});

test("FoloTimelineResult converts the observed CLI timeline shape", () => {
  const result = FoloTimelineResult.from({
    entries: [{
      read: false,
      view: 0,
      aiScore: null,
      from: ["feed-1"],
      subscriptions: { category: "资源", title: "" },
      entries: {
        id: "entry-1",
        title: "Example",
        media: [{
          url: "https://example.com/image.png",
          type: "photo",
          preview_image_url: "https://example.com/preview.png",
          width: 640,
          height: 480,
          blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        }],
        categories: ["tech"],
        attachments: [{
          url: "https://example.com/audio.mp3",
          duration_in_seconds: 120,
          mime_type: "audio/mpeg",
          size_in_bytes: 1024,
        }],
        tags: { schemaOrgCategory: "Technology", mediaTopics: ["software"] },
      },
      feeds: { id: "feed-1", title: "Example Feed" },
      settings: {},
      collections: { createdAt: "2026-09-12T00:00:00.000Z" },
    }],
    nextCursor: "2026-09-13T00:00:00.000Z",
    hasNext: true,
  });

  assert.equal(result.entries[0]?.view, FoloView.Articles);
  assert.equal(result.entries[0]?.aiScore, null);
  assert.equal(result.entries[0]?.subscriptions?.category, "资源");
  assert.equal(result.entries[0]?.subscriptions?.title, "");
  assert.equal(result.entries[0]?.entries.media[0]?.width, 640);
  assert.equal(result.entries[0]?.entries.media[0]?.previewImageUrl, "https://example.com/preview.png");
  assert.equal(result.entries[0]?.entries.attachments[0]?.mimeType, "audio/mpeg");
  assert.deepEqual(result.entries[0]?.entries.tags?.mediaTopics, ["software"]);
  assert.equal(result.entries[0]?.collections?.createdAt, "2026-09-12T00:00:00.000Z");
  assert.equal(result.entries[0]?.feeds.title, "Example Feed");
  assert.equal(result.hasNext, true);
});

test("FoloAttachment accepts string-encoded numeric fields", () => {
  const attachment = new FoloAttachment({
    url: "https://example.com/audio.mp3",
    duration_in_seconds: "120",
    size_in_bytes: "0",
    mime_type: "audio/mpeg",
  });

  assert.equal(attachment.url, "https://example.com/audio.mp3");
  assert.equal(attachment.durationInSeconds, 120);
  assert.equal(attachment.sizeInBytes, 0);
  assert.equal(new FoloAttachment({ duration_in_seconds: "soon" }).durationInSeconds, undefined);
  assert.equal(new FoloAttachment({}).url, "");
});

test("FoloTimelineItem defaults required fields and preserves null payloads", () => {
  const item = new FoloTimelineItem({
    entries: { id: "entry-1", categories: null, summary: null },
    feeds: {},
  });

  assert.equal(item.read, false);
  assert.equal(item.view, FoloView.Articles);
  assert.deepEqual(item.from, []);
  assert.equal(item.entries.guid, "");
  assert.equal(item.entries.insertedAt, "");
  assert.equal(item.entries.publishedAt, "");
  assert.equal(item.entries.categories, null);
  assert.equal(item.entries.summary, null);
  assert.equal(item.feeds.id, "");
  assert.equal(item.feeds.url, "");
  assert.equal(item.subscriptions, undefined);
  assert.deepEqual(item.settings, {});
});

test("Folo result classes validate required top-level fields", () => {
  assert.throws(() => FoloTimelineResult.from({}), /timeline.*invalid payload/i);
  assert.throws(() => FoloTimelineResult.from({ entries: "invalid" }), /entries array/i);
  assert.throws(
    () => FoloTimelineResult.from({ entries: [{ entries: {}, feeds: {} }] }),
    /entry ID/i,
  );
  assert.throws(() => FoloLoginResult.from({ message: "ok" }), /config path/i);
});

test("parseFoloEnvelope returns successful data", () => {
  assert.deepEqual(parseFoloEnvelope('{"ok":true,"data":{"value":1}}'), { value: 1 });
});

test("parseFoloEnvelope preserves CLI errors", () => {
  assert.throws(
    () => parseFoloEnvelope('{"ok":false,"error":{"code":"UNAUTHORIZED","message":"Login first"}}'),
    (error: unknown) => error instanceof FoloError
      && error.code === "UNAUTHORIZED"
      && error.message === "Login first",
  );
});

test("parseFoloEnvelope rejects invalid JSON and malformed envelopes", () => {
  assert.throws(() => parseFoloEnvelope("not json", "bad output"), /bad output/);
  assert.throws(() => parseFoloEnvelope("{}"), /invalid response envelope/);
  assert.throws(() => parseFoloEnvelope('{"ok":true}'), /did not contain data/);
});

test("Alfred Script Filter classes serialize nested values and omit empty options", () => {
  const response = new AlfredSF([
    new AlfredSFItem("Example", {
      arg: "https://example.com",
      text: new AlfredSFItemText("copy", "large"),
      valid: false,
    }),
  ], {
    cache: new AlfredSFCache(60, false),
    rerun: 0,
    skipknowledge: false,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    items: [{
      title: "Example",
      arg: "https://example.com",
      text: { copy: "copy", largetype: "large" },
      valid: false,
    }],
    rerun: 0,
    cache: { seconds: 60, loosereload: false },
    skipknowledge: false,
  });
});

test("Alfred Text View classes serialize behaviour values", () => {
  const response = new AlfredTV("Hello", {
    actionoutput: false,
    behaviour: new AlfredTVBehaviour(
      AlfredTVBehaviourResponse.Append,
      AlfredTVBehaviourScroll.End,
      AlfredTVBehaviourInputField.Clear,
    ),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    response: "Hello",
    actionoutput: false,
    behaviour: { response: "append", scroll: "end", inputfield: "clear" },
  });
});
