import assert from "node:assert/strict";
import test from "node:test";
import { errorItem, timelineItems } from "../src/alfred.js";
import { displayName, readToken, setWorkflowToken } from "../src/login.js";

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
  assert.equal(items[0].title, "Hello & Folo");
  assert.equal(items[0].arg, "https://example.com/post");
  assert.equal(timelineItems(data, "missing").length, 0);
});

test("errorItem gives authentication guidance", () => {
  const item = errorItem({ code: "UNAUTHORIZED", message: "Missing token" });
  assert.equal(item.valid, false);
  assert.match(item.title, /authentication/i);
});

test("errorItem gives useful timeout guidance", () => {
  const item = errorItem({ code: "TIMEOUT", message: "spawnSync ETIMEDOUT" });
  assert.match(item.subtitle, /timed out/i);
});

test("login helpers read the saved token and resolve a username", () => {
  assert.equal(readToken('{"token":"secret"}'), "secret");
  assert.equal(displayName({ user: { name: "Ada", email: "ada@example.com" } }), "Ada");
  assert.throws(() => readToken("{}"), /token/i);
  assert.throws(() => setWorkflowToken(""), /empty/i);
});
