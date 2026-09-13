import { isRecord } from "./folo-cli.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredSFItemText } from "./alfred-types.js";

const stripMarkup = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const text = (value: unknown, fallback = ""): string => {
  const normalized = stripMarkup(value);
  return normalized || fallback;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

export function timelineItems(data: unknown, query = ""): AlfredSFItem[] {
  const entries = isRecord(data) && Array.isArray(data.entries) ? data.entries : [];
  const needle = query.trim().toLocaleLowerCase();

  const items = entries.map((item): AlfredSFItem => {
    const entry = isRecord(item) && isRecord(item.entries) ? item.entries : {};
    const feed = isRecord(item) && isRecord(item.feeds) ? item.feeds : {};
    const title = text(entry.title, "Untitled entry");
    const feedTitle = text(feed.title, "Unknown feed");
    const author = text(entry.author);
    const summary = text(entry.description ?? entry.content);
    const date = formatDate(entry.publishedAt);
    const subtitle = [feedTitle, author, date].filter(Boolean).join(" · ");
    const url = optionalString(entry.url) ?? optionalString(feed.siteUrl) ?? "https://app.folo.is";
    const searchable = [title, feedTitle, author, summary, url].join(" ").toLocaleLowerCase();

    return new AlfredSFItem(title, {
      subtitle,
      arg: url,
      uid: optionalString(entry.id),
      match: searchable,
      quicklookurl: url,
      text: new AlfredSFItemText(url, summary || title),
    });
  });

  return needle ? items.filter((item) => item.match?.includes(needle)) : items;
}

export function subscriptionItems(data: unknown, query = ""): AlfredSFItem[] {
  const subscriptions = isRecord(data) && Array.isArray(data.subscriptions) ? data.subscriptions : [];
  const needle = query.trim().toLocaleLowerCase();

  const items = subscriptions.flatMap((item): AlfredSFItem[] => {
    const subscription = isRecord(item) ? item : {};
    const feed = isRecord(subscription.feeds) ? subscription.feeds : undefined;
    const list = isRecord(subscription.lists) ? subscription.lists : undefined;
    const target = list ?? feed;
    if (!target) return [];

    const kind = list ? "List" : "Feed";
    const id = optionalString(subscription.listId)
      ?? optionalString(subscription.feedId)
      ?? optionalString(target.id);
    if (!id) return [];

    const title = text(optionalString(subscription.title) ?? target.title, `Untitled ${kind.toLowerCase()}`);
    const description = text(target.description);
    const category = text(subscription.category);
    const feedCount = list && Array.isArray(list.feedIds) ? list.feedIds.length : undefined;
    const detail = feedCount === undefined ? undefined : `${feedCount} ${feedCount === 1 ? "feed" : "feeds"}`;
    const subtitle = [kind, category, detail, description]
      .filter(Boolean)
      .join(" · ");
    const foloUrl = list
      ? `https://app.folo.is/share/lists/${encodeURIComponent(id)}`
      : `https://app.folo.is/share/feeds/${encodeURIComponent(id)}`;
    const originalUrl = feed ? optionalString(feed.siteUrl) ?? optionalString(feed.url) : undefined;
    const searchable = [title, kind, category, description, id].join(" ").toLocaleLowerCase();

    return [new AlfredSFItem(title, {
      subtitle,
      arg: foloUrl,
      uid: `${kind.toLocaleLowerCase()}-${id}`,
      match: searchable,
      mods: originalUrl ? {
        alt: {
          arg: originalUrl,
          subtitle: "Open original URL",
          valid: true,
        },
      } : undefined,
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, description || title),
    })];
  });

  return needle ? items.filter((item) => item.match?.includes(needle)) : items;
}

export function errorItem(error: unknown): AlfredSFItem {
  const code = isRecord(error) ? error.code : undefined;
  const unauthorized = code === "UNAUTHORIZED";
  const timedOut = code === "TIMEOUT";
  const message = isRecord(error) ? error.message : undefined;

  return new AlfredSFItem(unauthorized ? "Folo authentication required" : "Unable to load Folo", {
    subtitle: unauthorized
      ? "Run flogin to authenticate"
      : timedOut
        ? "The Folo request timed out; check your network and try again"
        : text(message, "Open Alfred's debugger for details"),
    valid: false,
  });
}

export function emptyItem(title: string, subtitle: string): AlfredSFItem {
  return new AlfredSFItem(title, { subtitle, valid: false });
}

export function output(items: AlfredSFItem[], cacheSeconds?: number): void {
  const response = new AlfredSF(items, {
    cache: cacheSeconds ? new AlfredSFCache(cacheSeconds, true) : undefined,
    skipknowledge: true,
  });
  process.stdout.write(JSON.stringify(response));
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
