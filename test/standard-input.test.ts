import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_INPUT_VERSION,
  resolveStandardInput,
  type StandardInputSpec,
} from "../src/shared/standard-input.js";
import {
  parseSubscriptionsAppInput,
  SubscriptionsStandardInput,
} from "../src/app/subscriptions.js";
import {
  parseUnreadAppInput,
  UnreadStandardInput,
} from "../src/app/unread.js";
import {
  parseTimelineAppInput,
  resolveTimelineInput,
  TimelineStandardInput,
} from "../src/app/timeline.js";
import {
  parseMarkReadAppInput,
  MarkReadStandardInput,
} from "../src/app/mark-read.js";
import {
  parseLoginAppInput,
  LoginAlfredInput,
  LoginStandardInput,
} from "../src/app/login.js";
import { SubscriptionSelection } from "../src/contracts/subscription-selection.js";
import { TimelineSelection } from "../src/contracts/timeline-selection.js";
import { FoloSubscription, FoloTimelineItem } from "../src/types/folo-types.js";

/** Fixture spec exercising every shared capability without referencing a real app. */
const widgetSpec: StandardInputSpec = {
  isStandardEnv: "frrWidgetIsStandardInput",
  fields: [
    { field: "name", env: "frrWidgetName", type: "string" },
    { field: "count", env: "frrWidgetCount", type: "integer", global: "FRR_WIDGET_COUNT" },
    { field: "enabled", env: "frrWidgetEnabled", type: "boolean" },
  ],
};

const widgetContracts = (data: Record<string, unknown>): boolean => data.kind === "widget-input";

function timelineSelection(entryId = "entry-1"): TimelineSelection {
  const item = new FoloTimelineItem({
    entries: { id: entryId, title: "Post" },
    feeds: { id: "feed-1", title: "Example Feed" },
  });
  return new TimelineSelection("https://example.com/post", entryId, item.entries, item.feeds);
}

test("resolveStandardInput merges argv, standard variables, and global configuration by priority", () => {
  assert.deepEqual(
    resolveStandardInput('{"kind":"standard","count":5}', {
      frrWidgetName: "from-env",
      frrWidgetCount: "7",
      FRR_WIDGET_COUNT: "9",
    }, widgetSpec, widgetContracts),
    { name: "from-env", count: 5 },
  );
  assert.deepEqual(
    resolveStandardInput('{"kind":"standard"}', { FRR_WIDGET_COUNT: "9" }, widgetSpec, widgetContracts),
    { count: 9 },
  );
  assert.deepEqual(resolveStandardInput('{"kind":"standard"}', {}, widgetSpec, widgetContracts), {});
});

test("resolveStandardInput activates from the environment marker when argv is empty", () => {
  const env = { frrWidgetName: "from-env" };
  const byFlag = resolveStandardInput("", { ...env, frrWidgetIsStandardInput: "1" }, widgetSpec, widgetContracts);
  assert.deepEqual(byFlag, { name: "from-env" });
});

test("resolveStandardInput accepts the argv kind and rejects the removed argv marker", () => {
  const resolve = (argv: string) => resolveStandardInput(argv, {}, widgetSpec, widgetContracts);
  assert.deepEqual(resolve('{"kind":"standard","name":"a"}'), { name: "a" });
  assert.throws(() => resolve('{"isStandardInput":1,"name":"a"}'), /isStandardInput.*not supported/);
  assert.throws(
    () => resolve('{"kind":"standard","isStandardInput":1,"name":"a"}'),
    /isStandardInput.*not supported/,
  );
  assert.throws(() => resolve('{"kind":"other","isStandardInput":1}'), /isStandardInput.*not supported/);
});

test("resolveStandardInput rejects an invalid environment marker", () => {
  assert.throws(
    () => resolveStandardInput("", { frrWidgetIsStandardInput: "2" }, widgetSpec, widgetContracts),
    /frrWidgetIsStandardInput must be exactly "1"/,
  );
});

test("resolveStandardInput reports a contract carrying the standard marker as a conflict", () => {
  assert.throws(
    () => resolveStandardInput('{"kind":"standard"}', {}, widgetSpec, () => true),
    /matches a known workflow contract/i,
  );
});

test("resolveStandardInput does not read standard variables without a marker", () => {
  const env = { frrWidgetName: "ignored", frrWidgetCount: "40", FRR_WIDGET_COUNT: "50", frrWidgetIsStandardInput: "1" };
  assert.equal(resolveStandardInput("plain query", env, widgetSpec, widgetContracts), undefined);
  assert.equal(resolveStandardInput('{"kind":"widget-input"}', env, widgetSpec, widgetContracts), undefined);
  assert.equal(resolveStandardInput("", { frrWidgetName: "ignored" }, widgetSpec, widgetContracts), undefined);
  assert.equal(
    resolveStandardInput("", { frrWidgetKind: "standard", frrWidgetName: "ignored" }, widgetSpec, widgetContracts),
    undefined,
  );
  assert.equal(resolveStandardInput('{"kind":"other"}', { frrWidgetIsStandardInput: "1" }, widgetSpec, widgetContracts), undefined);
});

test("resolveStandardInput skips invalid environment values overridden by argv", () => {
  assert.deepEqual(
    resolveStandardInput('{"kind":"standard","count":3,"enabled":true}', {
      frrWidgetCount: "many",
      frrWidgetEnabled: "yes",
    }, widgetSpec, widgetContracts),
    { count: 3, enabled: true },
  );
});

test("resolveStandardInput converts environment values per declared type", () => {
  const convert = (env: NodeJS.ProcessEnv) =>
    resolveStandardInput("", { frrWidgetIsStandardInput: "1", ...env }, widgetSpec, widgetContracts);
  assert.deepEqual(convert({ frrWidgetEnabled: "1" }), { enabled: true });
  assert.deepEqual(convert({ frrWidgetEnabled: "true" }), { enabled: true });
  assert.deepEqual(convert({ frrWidgetEnabled: "0" }), { enabled: false });
  assert.deepEqual(convert({ frrWidgetEnabled: "false" }), { enabled: false });
  assert.deepEqual(convert({ frrWidgetCount: "42" }), { count: 42 });
  assert.throws(() => convert({ frrWidgetEnabled: "yes" }), /frrWidgetEnabled must be 1, 0, true, or false/);
  assert.throws(() => convert({ frrWidgetCount: "4.5" }), /frrWidgetCount must be a non-negative integer/);
  assert.throws(() => convert({ frrWidgetCount: "" }), /frrWidgetCount must be a non-negative integer/);
});

test("resolveStandardInput checks the protocol version and unknown fields", () => {
  const resolve = (argv: string) => resolveStandardInput(argv, {}, widgetSpec, widgetContracts);
  assert.deepEqual(resolve(`{"kind":"standard","version":${STANDARD_INPUT_VERSION}}`), {});
  assert.throws(() => resolve('{"kind":"standard","version":2}'), /Unsupported standard input version 2/);
  assert.throws(() => resolve('{"kind":"standard","version":"1"}'), /version must be a positive integer/);
  assert.throws(() => resolve('{"kind":"standard","version":0}'), /version must be a positive integer/);
  assert.throws(() => resolve('{"kind":"standard","bogus":1}'), /Unknown standard input field "bogus"/);
});

test("resolveStandardInput keeps falsy argv values explicit during the merge", () => {
  assert.deepEqual(
    resolveStandardInput('{"kind":"standard","name":"","count":0,"enabled":false}', {
      frrWidgetName: "from-env",
      frrWidgetCount: "5",
      frrWidgetEnabled: "true",
    }, widgetSpec, widgetContracts),
    { name: "", count: 0, enabled: false },
  );
  assert.deepEqual(
    resolveStandardInput('{"kind":"standard","name":null}', { frrWidgetName: "from-env" }, widgetSpec, widgetContracts),
    { name: null },
  );
});

test("timeline standard input parses from argv alone", () => {
  const input = parseTimelineAppInput(
    '{"kind":"standard","version":1,"query":"alfred","view":"articles","limit":20,"unreadOnly":true,"cursor":"c1","feed":"feed-1","list":"list-1","category":"tech"}',
    {},
  );
  assert.ok(input instanceof TimelineStandardInput);
  assert.deepEqual(input, new TimelineStandardInput({
    query: "alfred",
    view: "articles",
    limit: 20,
    unreadOnly: true,
    cursor: "c1",
    feed: "feed-1",
    list: "list-1",
    category: "tech",
  }));
  assert.deepEqual(
    resolveTimelineInput(input, { frrTimelineUnreadOnly: "1" }).toBlockInput().toArguments(),
    ["timeline", "--limit", "20", "--view", "articles", "--feed", "feed-1", "--list", "list-1", "--category", "tech", "--cursor", "c1", "--unread-only"],
  );
});

test("timeline standard input parses from environment variables alone", () => {
  const input = parseTimelineAppInput("", {
    frrTimelineIsStandardInput: "1",
    frrTimelineView: "articles",
    frrTimelineLimit: "50",
    frrTimelineUnreadOnly: "true",
  });
  assert.ok(input instanceof TimelineStandardInput);
  assert.equal(input.view, "articles");
  assert.equal(input.limit, 50);
  assert.equal(input.unreadOnly, true);
  assert.equal(input.query, "");
});

test("timeline standard input combines argv with environment variables", () => {
  const input = parseTimelineAppInput('{"kind":"standard","version":1,"limit":20,"unreadOnly":false}', {
    frrTimelineLimit: "50",
    frrTimelineView: "articles",
  });
  assert.ok(input instanceof TimelineStandardInput);
  assert.equal(input.limit, 20);
  assert.equal(input.view, "articles");
  assert.equal(input.unreadOnly, false);
});

test("timeline standard input falls back to the global limit configuration", () => {
  const byGlobal = parseTimelineAppInput('{"kind":"standard"}', { FRR_TIMELINE_LIMIT: "60" });
  const byDefault = parseTimelineAppInput('{"kind":"standard"}', {});
  assert.ok(byGlobal instanceof TimelineStandardInput && byDefault instanceof TimelineStandardInput);
  assert.equal(byGlobal.limit, 60);
  assert.equal(byDefault.limit, 30);
});

test("timeline standard input keeps explicit falsy values over environment variables", () => {
  const input = parseTimelineAppInput('{"kind":"standard","unreadOnly":false,"query":"","cursor":null,"feed":""}', {
    frrTimelineUnreadOnly: "1",
    frrTimelineQuery: "from-env",
    frrTimelineCursor: "cursor-9",
    frrTimelineFeed: "feed-9",
  });
  assert.ok(input instanceof TimelineStandardInput);
  assert.equal(input.unreadOnly, false);
  assert.equal(input.query, "");
  assert.equal(input.cursor, undefined);
  assert.equal(input.feed, undefined);
  const resolved = resolveTimelineInput(input, { frrTimelineUnreadOnly: "1" });
  assert.equal(resolved.toBlockInput().unreadOnly, undefined);
  assert.equal(resolved.query, "");
});

test("timeline standard input rejects an explicit zero limit instead of using the environment", () => {
  assert.throws(
    () => parseTimelineAppInput('{"kind":"standard","limit":0}', { frrTimelineLimit: "20" }),
    /limit.*positive integer/i,
  );
  const overridden = parseTimelineAppInput('{"kind":"standard","limit":20}', { frrTimelineLimit: "not-a-number" });
  assert.ok(overridden instanceof TimelineStandardInput);
  assert.equal(overridden.limit, 20);
});

test("timeline non-standard inputs ignore the standard environment variables", () => {
  const hostileEnv = {
    frrTimelineIsStandardInput: "1",
    frrTimelineLimit: "not-a-number",
    frrTimelineView: "pictures",
    frrTimelineQuery: "from-env",
    frrTimelineFeed: "feed-9",
  };
  const subscription = new SubscriptionSelection(new FoloSubscription({
    listId: "list-1",
    lists: { id: "list-1" },
  }));
  assert.ok(parseTimelineAppInput(subscription.serialize(), hostileEnv) instanceof SubscriptionSelection);
  assert.deepEqual(parseTimelineAppInput("Alfred Blog", hostileEnv), new TimelineStandardInput({ query: "Alfred Blog" }));
  const viewInput = parseTimelineAppInput('{"kind":"view-input","view":"articles"}', hostileEnv);
  const resolved = resolveTimelineInput(viewInput, hostileEnv);
  assert.equal(resolved.view, "articles");
  assert.equal(resolved.limit, 30);
  assert.equal(resolved.feed, undefined);
  assert.equal(resolved.query, "");
});

test("timeline keeps the lenient legacy limit behavior for non-standard calls", () => {
  const direct = parseTimelineAppInput("", { FRR_TIMELINE_LIMIT: "not-a-number" });
  assert.ok(direct instanceof TimelineStandardInput);
  assert.equal(direct.limit, 30);
  const configured = parseTimelineAppInput("", { FRR_TIMELINE_LIMIT: "50" });
  assert.ok(configured instanceof TimelineStandardInput);
  assert.equal(configured.limit, 50);
});

test("timeline standard input rejects malformed values", () => {
  assert.throws(() => parseTimelineAppInput('{"kind":"standard","limit":"20"}', {}), /limit.*positive integer/i);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard","unreadOnly":"yes"}', {}), /unreadOnly.*boolean/i);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard"}', { frrTimelineLimit: "abc" }), /frrTimelineLimit/);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard"}', { frrTimelineUnreadOnly: "yes" }), /frrTimelineUnreadOnly/);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard"}', { FRR_TIMELINE_LIMIT: "abc" }), /FRR_TIMELINE_LIMIT/);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard","view":"articles","bogus":1}', {}), /Unknown standard input field/);
  assert.throws(() => parseTimelineAppInput('{"kind":"standard","version":2}', {}), /Unsupported standard input version/);
  assert.throws(
    () => parseTimelineAppInput('{"kind":"standard","view":"articles","isStandardInput":1}', {}),
    /isStandardInput.*not supported/i,
  );
});

test("subscriptions standard input parses from argv, environment, and both combined", () => {
  const fromArgv = parseSubscriptionsAppInput('{"kind":"standard","query":"tech","view":"articles","category":"Tech"}', {});
  assert.deepEqual(fromArgv, new SubscriptionsStandardInput({ query: "tech", view: "articles", category: "Tech" }));

  const fromEnv = parseSubscriptionsAppInput("", {
    frrSubscriptionsIsStandardInput: "1",
    frrSubscriptionsQuery: "tech",
    frrSubscriptionsCategory: "Tech",
  });
  assert.deepEqual(fromEnv, new SubscriptionsStandardInput({ query: "tech", category: "Tech" }));

  const combined = parseSubscriptionsAppInput('{"kind":"standard","query":"alfred"}', {
    frrSubscriptionsQuery: "from-env",
    frrSubscriptionsView: "articles",
  });
  assert.deepEqual(combined, new SubscriptionsStandardInput({ query: "alfred", view: "articles" }));
  assert.ok(combined instanceof SubscriptionsStandardInput);
});

test("subscriptions non-standard and malformed inputs keep their behavior", () => {
  assert.deepEqual(
    parseSubscriptionsAppInput("tech", { frrSubscriptionsIsStandardInput: "1", frrSubscriptionsQuery: "from-env" }),
    new SubscriptionsStandardInput({ query: "tech" }),
  );
  assert.deepEqual(parseSubscriptionsAppInput("", { frrSubscriptionsQuery: "from-env" }), new SubscriptionsStandardInput());
  assert.deepEqual(
    parseSubscriptionsAppInput('{"kind":"standard","query":"","category":null}', {
      frrSubscriptionsQuery: "from-env",
      frrSubscriptionsCategory: "Tech",
    }),
    new SubscriptionsStandardInput({ query: "" }),
  );
  assert.throws(() => parseSubscriptionsAppInput('{"kind":"standard","view":5}', {}), /view.*string/i);
  assert.throws(() => parseSubscriptionsAppInput('{"kind":"standard","bogus":1}', {}), /Unknown standard input field/);
  assert.throws(() => parseSubscriptionsAppInput('{"kind":"standard","version":9}', {}), /Unsupported standard input version/);
});

test("unread standard input parses from argv, environment, and both combined", () => {
  const fromArgv = parseUnreadAppInput('{"kind":"standard","query":"tech","view":"articles"}', {});
  assert.deepEqual(fromArgv, new UnreadStandardInput({ query: "tech", view: "articles" }));

  const fromEnv = parseUnreadAppInput("", { frrUnreadIsStandardInput: "1", frrUnreadView: "articles" });
  assert.deepEqual(fromEnv, new UnreadStandardInput({ view: "articles" }));

  const combined = parseUnreadAppInput('{"kind":"standard","query":"alfred"}', { frrUnreadQuery: "from-env" });
  assert.deepEqual(combined, new UnreadStandardInput({ query: "alfred" }));
  assert.ok(combined instanceof UnreadStandardInput);
});

test("unread non-standard and malformed inputs keep their behavior", () => {
  assert.deepEqual(
    parseUnreadAppInput("tech", { frrUnreadIsStandardInput: "1", frrUnreadQuery: "from-env" }),
    new UnreadStandardInput({ query: "tech" }),
  );
  assert.deepEqual(
    parseUnreadAppInput('{"kind":"standard","query":"","view":null}', {
      frrUnreadQuery: "from-env",
      frrUnreadView: "articles",
    }),
    new UnreadStandardInput({ query: "" }),
  );
  assert.throws(() => parseUnreadAppInput('{"kind":"standard","view":true}', {}), /view.*string/i);
  assert.throws(() => parseUnreadAppInput('{"kind":"standard","bogus":1}', {}), /Unknown standard input field/);
  assert.throws(() => parseUnreadAppInput('{"kind":"standard","version":0}', {}), /version must be a positive integer/);
});

test("mark-read standard input parses from argv, environment, and both combined", () => {
  assert.deepEqual(
    parseMarkReadAppInput('{"kind":"standard","entryId":"entry-1"}', {}),
    new MarkReadStandardInput({ entryId: "entry-1" }),
  );
  assert.deepEqual(
    parseMarkReadAppInput("", { frrMarkReadIsStandardInput: "1", frrMarkReadEntryId: "entry-1" }),
    new MarkReadStandardInput({ entryId: "entry-1" }),
  );
  assert.deepEqual(
    parseMarkReadAppInput('{"kind":"standard","entryId":"entry-1"}', { frrMarkReadEntryId: "from-env" }),
    new MarkReadStandardInput({ entryId: "entry-1" }),
  );
});

test("mark-read keeps the timeline selection input and ignores standard variables", () => {
  const selection = timelineSelection("entry-1");
  const parsed = parseMarkReadAppInput(selection.serialize(), {
    frrMarkReadIsStandardInput: "1",
    frrMarkReadEntryId: "hijacked",
  });
  assert.ok(parsed instanceof TimelineSelection);
  assert.equal(parsed.entryId, "entry-1");
});

test("mark-read standard input rejects missing or malformed entry IDs", () => {
  assert.throws(() => parseMarkReadAppInput('{"kind":"standard"}', {}), /entryId.*non-empty string/i);
  assert.throws(() => parseMarkReadAppInput("", { frrMarkReadIsStandardInput: "1" }), /entryId.*non-empty string/i);
  assert.throws(() => parseMarkReadAppInput('{"kind":"standard","entryId":" "}', {}), /entryId.*non-empty string/i);
  assert.throws(() => parseMarkReadAppInput('{"kind":"standard","entryId":null}', {}), /entryId.*non-empty string/i);
  assert.throws(() => parseMarkReadAppInput('{"kind":"standard","entryId":5}', {}), /entryId.*non-empty string/i);
  assert.throws(() => parseMarkReadAppInput('{"kind":"standard","entryId":"e","extra":1}', {}), /Unknown standard input field/);
});

test("login standard input parses from argv, environment, and both combined", () => {
  assert.deepEqual(
    parseLoginAppInput('{"kind":"standard","workflowBundleId":"dev.fradeet.folo"}', {}),
    new LoginStandardInput({ workflowBundleId: "dev.fradeet.folo" }),
  );
  assert.deepEqual(
    parseLoginAppInput("", { frrLoginIsStandardInput: "1", frrLoginWorkflowBundleId: "dev.fradeet.folo" }),
    new LoginStandardInput({ workflowBundleId: "dev.fradeet.folo" }),
  );
  assert.deepEqual(
    parseLoginAppInput('{"kind":"standard","workflowBundleId":"dev.fradeet.folo"}', {
      frrLoginWorkflowBundleId: "from-env",
    }),
    new LoginStandardInput({ workflowBundleId: "dev.fradeet.folo" }),
  );
});

test("login keeps the Alfred invocation when no standard marker is present", () => {
  assert.ok(parseLoginAppInput("", { frrLoginWorkflowBundleId: "dev.fradeet.folo" }) instanceof LoginAlfredInput);
  assert.ok(parseLoginAppInput("anything", { frrLoginIsStandardInput: "1" }) instanceof LoginAlfredInput);
});

test("login standard input rejects missing or malformed workflow bundle IDs", () => {
  assert.throws(() => parseLoginAppInput('{"kind":"standard"}', {}), /workflowBundleId.*non-empty string/i);
  assert.throws(() => parseLoginAppInput("", { frrLoginIsStandardInput: "1" }), /workflowBundleId.*non-empty string/i);
  assert.throws(() => parseLoginAppInput('{"kind":"standard","workflowBundleId":""}', {}), /workflowBundleId.*non-empty string/i);
  assert.throws(() => parseLoginAppInput('{"kind":"standard","workflowBundleId":7}', {}), /workflowBundleId.*non-empty string/i);
  assert.throws(() => parseLoginAppInput('{"kind":"standard","bundleId":"x"}', {}), /Unknown standard input field/);
});
