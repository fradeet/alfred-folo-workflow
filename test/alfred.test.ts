import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { errorItem, subscriptionItems, timelineItems, unreadItems } from "../src/alfred.js";
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
import { FoloError, parseFoloEnvelope } from "../src/folo-cli.js";
import {
  FoloLoginResult,
  FoloSubscriptionsResult,
  FoloTimelineResult,
  FoloUnreadResult,
  FoloView,
  FoloWhoamiResult,
} from "../src/types/folo-types.js";
import { displayName, readToken, setWorkflowToken } from "../src/login.js";
import { markRead } from "../src/mark-read.js";
import { parseTimelineInput, timelineArguments } from "../src/timeline.js";
import { parseFoloShareUrl } from "../src/folo-url.js";
import { cacheIcons, feedIconCacheKey, feedIconUrl, loadCachedIcons } from "../src/icon-cache.js";

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

    const items = timelineItems({ entries: [{ entries: { title: "Post" }, feeds: source }] }, "", second);
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
  assert.equal(items[0]?.arg, "https://app.folo.is/share/lists/list-1");
  assert.equal(items[1]?.arg, "https://app.folo.is/share/feeds/feed-1");
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
  assert.equal(items[0]?.arg, "https://app.folo.is/share/feeds/feed-1");
  assert.deepEqual(items[0]?.variables, { FOLO_IS_UNREAD: "1" });
  assert.equal(items[0]?.mods?.alt?.arg, "https://app.folo.is/share/feeds/feed-1");
  assert.equal(items[1]?.arg, "https://app.folo.is/share/lists/list-1");
  assert.equal(items[2]?.arg, "https://app.folo.is/share/feeds/inbox-inbox-1");
  assert.equal(unreadItems(data, "newsletters").length, 1);
  assert.equal(unreadItems(data, "missing").length, 0);
});

test("parseTimelineInput converts Folo share URLs into timeline filters", () => {
  assert.deepEqual(parseTimelineInput("https://app.folo.is/share/feeds/41470869403557888"), {
    query: "",
    target: { type: "feed", id: "41470869403557888" },
  });
  assert.deepEqual(parseTimelineInput("https://app.folo.is/share/lists/162747179238521856?view=0"), {
    query: "",
    target: { type: "list", id: "162747179238521856" },
  });
  assert.deepEqual(parseTimelineInput("Alfred Blog"), { query: "Alfred Blog" });
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

test("timelineArguments applies unread filtering only to marked inputs", () => {
  const unreadInput = parseTimelineInput("https://app.folo.is/share/feeds/feed-1");
  assert.deepEqual(timelineArguments(unreadInput, "30", true), [
    "timeline",
    "--limit",
    "30",
    "--feed",
    "feed-1",
    "--unread-only",
  ]);

  const normalInput = parseTimelineInput("https://app.folo.is/share/lists/list-1");
  assert.deepEqual(timelineArguments(normalInput, "30"), [
    "timeline",
    "--limit",
    "30",
    "--list",
    "list-1",
  ]);
});

test("FoloSubscriptionsResult keeps feed, list, and inbox subscriptions", () => {
  const result = FoloSubscriptionsResult.from({
    subscriptions: [
      { feedId: "feed-1", feeds: { id: "feed-1" } },
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
  assert.equal(items[0]?.arg, "https://example.com/post");
  assert.deepEqual(items[0]?.variables, { FOLO_ENTRY_ID: "entry-1" });
  assert.equal(timelineItems(data, "missing").length, 0);
});

test("timelineItems tolerates malformed entry data", () => {
  const items = timelineItems({ entries: [null, { entries: "invalid" }] });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, "Untitled entry");
  assert.equal(items[0]?.arg, "https://app.folo.is");
  assert.equal(items[0]?.variables, undefined);
});

test("markRead rejects a missing entry ID before calling Folo", () => {
  assert.throws(() => markRead("  "), /Entry ID is required/);
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

test("login helpers read the saved token and resolve a username", () => {
  assert.equal(readToken('{"token":"secret"}'), "secret");
  assert.equal(displayName(FoloWhoamiResult.from({
    user: { name: "Ada", email: "ada@example.com" },
    session: {},
  })), "Ada");
  assert.throws(() => readToken("{}"), /token/i);
  assert.throws(() => setWorkflowToken(""), /empty/i);
});

test("FoloTimelineResult converts the observed CLI timeline shape", () => {
  const result = FoloTimelineResult.from({
    entries: [{
      read: false,
      view: 0,
      from: ["feed-1"],
      entries: {
        id: "entry-1",
        title: "Example",
        media: [{ url: "https://example.com/image.png", type: "photo", width: 640, height: 480 }],
        categories: ["tech"],
      },
      feeds: { id: "feed-1", title: "Example Feed" },
      settings: {},
    }],
    nextCursor: "2026-09-13T00:00:00.000Z",
    hasNext: true,
  });

  assert.equal(result.entries[0]?.view, FoloView.Articles);
  assert.equal(result.entries[0]?.entries.media[0]?.width, 640);
  assert.equal(result.entries[0]?.feeds.title, "Example Feed");
  assert.equal(result.hasNext, true);
});

test("Folo result classes validate required top-level fields", () => {
  assert.throws(() => FoloTimelineResult.from({}), /timeline.*invalid payload/i);
  assert.throws(() => FoloTimelineResult.from({ entries: "invalid" }), /entries array/i);
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
