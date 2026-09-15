import { isRecord } from "./guards.js";
import { FoloEntryOutput } from "./entry-output.js";
import { AlfredSF, AlfredSFCache, AlfredSFItem, AlfredSFItemIcon, AlfredSFItemText } from "../types/alfred-types.js";
import { IconResolver } from "./icon-cache.js";

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

export function timelineItems(data: unknown, query = "", iconFor?: IconResolver): AlfredSFItem[] {
  const entries = isRecord(data) && Array.isArray(data.entries) ? data.entries : [];
  const needle = query.trim().toLocaleLowerCase();

  const items = entries.flatMap((item): AlfredSFItem[] => {
    const entry = isRecord(item) && isRecord(item.entries) ? item.entries : {};
    const feed = isRecord(item) && isRecord(item.feeds) ? item.feeds : {};
    const title = text(entry.title, "Untitled entry");
    const feedTitle = text(feed.title, "Unknown feed");
    const author = text(entry.author);
    const summary = text(entry.description ?? entry.content);
    const date = formatDate(entry.publishedAt);
    const subtitle = [feedTitle, author, date].filter(Boolean).join(" · ");
    const url = optionalString(entry.url) ?? optionalString(feed.siteUrl) ?? "https://app.folo.is";
    const entryId = optionalString(entry.id);
    if (!entryId) return [];
    const entryOutput = new FoloEntryOutput(url, entryId);
    const searchable = [title, feedTitle, author, summary, url].join(" ").toLocaleLowerCase();

    return [new AlfredSFItem(title, {
      subtitle,
      arg: entryOutput.serialize(),
      icon: icon(feed, iconFor),
      uid: entryId,
      match: searchable,
      quicklookurl: url,
      text: new AlfredSFItemText(url, summary || title),
    })];
  });

  return needle ? items.filter((item) => item.match?.includes(needle)) : items;
}

export function subscriptionItems(data: unknown, query = "", iconFor?: IconResolver): AlfredSFItem[] {
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
      icon: icon(target, iconFor),
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

export function unreadItems(data: unknown, query = "", iconFor?: IconResolver): AlfredSFItem[] {
  const unread = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  const needle = query.trim().toLocaleLowerCase();

  const items = unread.flatMap((item): AlfredSFItem[] => {
    const source = isRecord(item) ? item : {};
    const sourceType = source.sourceType;
    const sourceId = optionalString(source.sourceId);
    if ((sourceType !== "feed" && sourceType !== "list" && sourceType !== "inbox") || !sourceId) return [];

    const kind = sourceType[0]!.toUpperCase() + sourceType.slice(1);
    const title = text(source.title, `Untitled ${sourceType}`);
    const category = text(source.category);
    const unreadCount = typeof source.unreadCount === "number" && Number.isFinite(source.unreadCount)
      ? source.unreadCount
      : 0;
    const unreadDetail = `${unreadCount} unread`;
    const subtitle = [unreadDetail, kind, category].filter(Boolean).join(" · ");
    const timelineType = sourceType === "list" ? "lists" : "feeds";
    const timelineId = sourceType === "inbox" ? optionalString(source.feedId) ?? sourceId : sourceId;
    const foloUrl = `https://app.folo.is/share/${timelineType}/${encodeURIComponent(timelineId)}`;
    const searchable = [title, kind, category, unreadDetail, sourceId].join(" ").toLocaleLowerCase();

    return [new AlfredSFItem(title, {
      subtitle,
      arg: foloUrl,
      icon: icon(source, iconFor),
      uid: `unread-${sourceType}-${sourceId}`,
      match: searchable,
      variables: { FOLO_IS_UNREAD: "1" },
      mods: {
        alt: {
          arg: foloUrl,
          subtitle: "Open in Folo",
          valid: true,
        },
      },
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, `${title} · ${unreadDetail}`),
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
    cache: cacheSeconds ? new AlfredSFCache(cacheSeconds) : undefined,
  });
  process.stdout.write(JSON.stringify(response));
}

function icon(source: unknown, iconFor?: IconResolver): AlfredSFItemIcon | undefined {
  const path = iconFor?.(source);
  return path ? new AlfredSFItemIcon(path) : undefined;
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
