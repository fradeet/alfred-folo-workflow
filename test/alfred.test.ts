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
import { FoloError, parseFoloEnvelope } from "../src/shared/folo-cli.js";
import { FoloEntryOutput } from "../src/shared/entry-output.js";
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
import { markRead } from "../src/app/mark-read.js";
import { shareUrlTimelineParams } from "../src/app/timeline-params-converter.js";
import { parseTimelineInput, timelineArguments } from "../src/app/timeline.js";
import { parseFoloShareUrl } from "../src/shared/folo-url.js";
import { cacheIcons, feedIconCacheKey, feedIconUrl, loadCachedIcons } from "../src/shared/icon-cache.js";

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

    const unread = unreadItems({
      items: [{ sourceType: "list", sourceId: "feed-1", title: "List", unreadCount: 1 }],
    }, "", cachedOnly);
    assert.equal(unread[0]?.icon?.path, firstPath);

    const items = timelineItems({ entries: [{ entries: { id: "entry-1", title: "Post" }, feeds: source }] }, "", second);
    assert.equal(items[0]?.icon?.path, firstPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("subscriptionItems maps every subscription target and filters locally", () => {
  const data = {
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

  const items = subscriptionItems(data);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, "Daily Reads");
  assert.match(items[0]?.subtitle ?? "", /List.*Tech.*2 feeds.*useful bundle/);
  assert.equal(items[0]?.arg, JSON.stringify({ list: "list-1" }));
  assert.equal(items[1]?.arg, JSON.stringify({ feed: "feed-1" }));
  assert.equal(items[1]?.mods?.alt?.arg, "https://example.com");
  assert.equal(subscriptionItems(data, "useful").length, 1);
  assert.equal(subscriptionItems(data, "missing").length, 0);
});

test("unreadItems maps unread sources and filters locally", () => {
  const data = {
    total: 15,
    items: [
      { sourceType: "feed", sourceId: "feed-1", title: "Example Feed", category: "Tech", unreadCount: 12 },
      { sourceType: "list", sourceId: "list-1", title: "Daily Reads", unreadCount: 2 },
      { sourceType: "inbox", sourceId: "inbox-1", feedId: "inbox-inbox-1", title: "Newsletters", unreadCount: 1 },
    ],
  };

  const items = unreadItems(data);
  assert.equal(items.length, 3);
  assert.match(items[0]?.subtitle ?? "", /12 unread.*Feed.*Tech/);
  assert.equal(items[0]?.arg, JSON.stringify({ feed: "feed-1", unreadOnly: true }));
  assert.equal(items[0]?.variables, undefined);
  assert.equal(items[1]?.arg, JSON.stringify({ list: "list-1", unreadOnly: true }));
  assert.equal(items[2]?.arg, JSON.stringify({ feed: "inbox-inbox-1", unreadOnly: true }));
  assert.equal(unreadItems(data, "newsletters").length, 1);
  assert.equal(unreadItems(data, "missing").length, 0);
});

test("parseTimelineInput reads JSON params and falls back to a filter query", () => {
  assert.deepEqual(parseTimelineInput('{"feed":"41470869403557888","unreadOnly":true}'), {
    query: "",
    params: { feed: "41470869403557888", unreadOnly: true },
  });
  assert.deepEqual(parseTimelineInput('{"list":"162747179238521856"}'), {
    query: "",
    params: { list: "162747179238521856" },
  });
  assert.deepEqual(parseTimelineInput('{"list":"list-1","bogus":"value","limit":0}'), {
    query: "",
    params: { list: "list-1" },
  });
  assert.deepEqual(parseTimelineInput("Alfred Blog"), { query: "Alfred Blog" });
  assert.deepEqual(parseTimelineInput("{oops"), { query: "{oops" });
  assert.deepEqual(parseTimelineInput('["feed"]'), { query: '["feed"]' });
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

test("shareUrlTimelineParams converts share URLs into timeline params", () => {
  assert.deepEqual(shareUrlTimelineParams("https://app.folo.is/share/feeds/41470869403557888"), {
    feed: "41470869403557888",
  });
  assert.deepEqual(shareUrlTimelineParams("https://app.folo.is/share/lists/162747179238521856"), {
    list: "162747179238521856",
  });
  assert.deepEqual(shareUrlTimelineParams("https://app.folo.is/share/lists/list-1/"), {
    list: "list-1",
  });
  assert.equal(shareUrlTimelineParams("https://example.com/feed"), undefined);
  assert.equal(shareUrlTimelineParams("Alfred Blog"), undefined);
  assert.equal(shareUrlTimelineParams(""), undefined);
});

test("timelineArguments maps JSON params onto Folo CLI flags", () => {
  assert.deepEqual(timelineArguments({ feed: "feed-1", unreadOnly: true }, "30"), [
    "timeline",
    "--limit",
    "30",
    "--feed",
    "feed-1",
    "--unread-only",
  ]);

  assert.deepEqual(timelineArguments({ list: "list-1", limit: 10, view: "articles" }, "30"), [
    "timeline",
    "--limit",
    "10",
    "--view",
    "articles",
    "--list",
    "list-1",
  ]);

  assert.deepEqual(timelineArguments(undefined, "50"), ["timeline", "--limit", "50"]);
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
  const data = {
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
  };

  const items = timelineItems(data, "useful");
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "Hello & Folo");
  assert.deepEqual(JSON.parse(String(items[0]?.arg)), {
    url: "https://example.com/post",
    entryId: "entry-1",
    entry: data.entries[0]?.entries,
    feed: data.entries[0]?.feeds,
    subscriptions: { category: "Tech", title: "News" },
  });
  assert.equal(items[0]?.variables, undefined);
  assert.equal(timelineItems(data, "missing").length, 0);
});

test("timelineItems filters entries without required IDs", () => {
  const items = timelineItems({ entries: [null, { entries: "invalid" }] });
  assert.equal(items.length, 0);
});

test("markRead rejects a missing entry ID before calling Folo", () => {
  assert.throws(() => markRead("  "), /Entry ID is required/);
});

test("FoloEntryOutput serializes and parses the shared entry argument", () => {
  const entry = { id: "entry-1", title: "Post" };
  const feed = { id: "feed-1", title: "Example Feed" };
  const serialized = new FoloEntryOutput(
    "https://example.com/post",
    "entry-1",
    entry,
    feed,
    { category: "Tech", title: "" },
  ).serialize();

  assert.equal(
    serialized,
    '{"url":"https://example.com/post","entryId":"entry-1","entry":{"id":"entry-1","title":"Post"},"feed":{"id":"feed-1","title":"Example Feed"},"subscriptions":{"category":"Tech","title":""}}',
  );
  assert.equal(
    new FoloEntryOutput("https://example.com/post", "entry-1").serialize(),
    '{"url":"https://example.com/post","entryId":"entry-1"}',
  );
  assert.deepEqual(FoloEntryOutput.parse(serialized), new FoloEntryOutput(
    "https://example.com/post",
    "entry-1",
  ));
  assert.throws(() => FoloEntryOutput.parse("https://example.com/post"), /valid JSON/);
  assert.throws(() => FoloEntryOutput.parse('{"url":"https://example.com/post"}'), /contain an entry ID/);
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
