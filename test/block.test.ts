import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FoloError } from "../src/block/folo/client.js";
import { LoginBlockInput } from "../src/block/folo/login.js";
import { MarkReadBlockInput } from "../src/block/folo/mark-read.js";
import { SubscriptionsBlockInput } from "../src/block/folo/subscriptions.js";
import { TimelineBlockInput } from "../src/block/folo/timeline.js";
import { UnreadBlockInput } from "../src/block/folo/unread.js";
import {
  clearResponseCache,
  readResponseCache,
  responseCacheFilename,
  writeResponseCache,
} from "../src/shared/response-cache.js";

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

test("response cache stores fresh payloads and clears the directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "alfred-folo-cache-"));
  try {
    const command = ["timeline", "--limit", "30"];
    const writtenAt = 1_000;
    assert.equal(readResponseCache(command, { cacheDirectory: directory, now: writtenAt }), undefined);

    writeResponseCache(command, { entries: ["entry-1"] }, { cacheDirectory: directory, now: writtenAt });
    assert.deepEqual(
      readResponseCache(command, { cacheDirectory: directory, now: writtenAt + 5 * 60 * 1_000 }),
      { entries: ["entry-1"] },
    );
    assert.equal(
      readResponseCache(command, { cacheDirectory: directory, now: writtenAt + 5 * 60 * 1_000 + 1 }),
      undefined,
    );

    await writeFile(join(directory, responseCacheFilename(command)), "not json", "utf8");
    assert.equal(readResponseCache(command, { cacheDirectory: directory, now: writtenAt }), undefined);

    writeResponseCache(["unread", "list"], { total: 0 }, { cacheDirectory: directory, now: writtenAt });
    clearResponseCache({ cacheDirectory: directory });
    assert.equal(readResponseCache(command, { cacheDirectory: directory, now: writtenAt }), undefined);
    assert.equal(readResponseCache(["unread", "list"], { cacheDirectory: directory, now: writtenAt }), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("response cache reads tolerate a missing cache directory", () => {
  assert.equal(readResponseCache(["timeline"], { cacheDirectory: join(tmpdir(), "alfred-folo-missing") }), undefined);
  assert.doesNotThrow(() => clearResponseCache({ cacheDirectory: join(tmpdir(), "alfred-folo-missing") }));
});

test("FoloError keeps its code and name", () => {
  const error = new FoloError("UNAUTHORIZED", "Login first");
  assert.equal(error.code, "UNAUTHORIZED");
  assert.equal(error.name, "FoloError");
});
