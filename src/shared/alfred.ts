import { isRecord } from "./guards.js";
import { AlfredSFItem, AlfredSFItemIcon, AlfredSFItemText } from "../types/alfred-types.js";
import { IconResolver } from "./icon-cache.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { FoloResourceSelection } from "../contracts/resource-selection.js";
import {
  FoloSubscriptionsResult,
  FoloTimelineResult,
  FoloUnreadResult,
} from "../types/folo-types.js";

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

export function timelineItems(data: FoloTimelineResult, query = "", iconFor?: IconResolver): AlfredSFItem[] {
  const needle = query.trim().toLocaleLowerCase();

  const items = data.entries.flatMap((item): AlfredSFItem[] => {
    const entry = item.entries;
    const feed = item.feeds;
    const title = text(entry.title, "Untitled entry");
    const feedTitle = text(feed.title, "Unknown feed");
    const author = text(entry.author);
    const summary = text(entry.description ?? entry.content);
    const date = formatDate(entry.publishedAt);
    const subtitle = [feedTitle, author, date].filter(Boolean).join(" · ");
    const url = optionalString(entry.url) ?? optionalString(feed.siteUrl) ?? "https://app.folo.is";
    const entryId = entry.id;
    const entryOutput = new TimelineSelection(url, entryId, entry, feed, item.subscriptions);
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

export function subscriptionItems(data: FoloSubscriptionsResult, query = "", iconFor?: IconResolver): AlfredSFItem[] {
  const needle = query.trim().toLocaleLowerCase();

  const items = data.subscriptions.flatMap((subscription): AlfredSFItem[] => {
    const feed = subscription.feeds;
    const list = subscription.lists;
    const target = list ?? feed;
    if (!target) return [];

    const kind = list ? "List" : "Feed";
    const id = subscription.listId ?? subscription.feedId ?? target.id;
    if (!id) return [];

    const title = text(optionalString(subscription.title) ?? target.title, `Untitled ${kind.toLowerCase()}`);
    const description = text(target.description);
    const category = text(subscription.category);
    const feedCount = list ? list.feedIds.length : undefined;
    const detail = feedCount === undefined ? undefined : `${feedCount} ${feedCount === 1 ? "feed" : "feeds"}`;
    const subtitle = [kind, category, detail, description]
      .filter(Boolean)
      .join(" · ");
    const foloUrl = list
      ? `https://app.folo.is/share/lists/${encodeURIComponent(id)}`
      : `https://app.folo.is/share/feeds/${encodeURIComponent(id)}`;
    const selection = new FoloResourceSelection(
      list ? "list" : "feed",
      id,
      foloUrl,
      feed?.siteUrl,
    );
    const serializedSelection = selection.serialize();
    const searchable = [title, kind, category, description, id].join(" ").toLocaleLowerCase();

    return [new AlfredSFItem(title, {
      subtitle,
      icon: icon(target, iconFor),
      uid: `${kind.toLocaleLowerCase()}-${id}`,
      match: searchable,
      mods: { alt: { arg: serializedSelection } },
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, description || title),
      variables: { frr_timeline_filter: serializedSelection },
    })];
  });

  return needle ? items.filter((item) => item.match?.includes(needle)) : items;
}

export function unreadItems(data: FoloUnreadResult, query = "", iconFor?: IconResolver): AlfredSFItem[] {
  const needle = query.trim().toLocaleLowerCase();

  const items = data.items.flatMap((source): AlfredSFItem[] => {
    const sourceType = source.sourceType;
    const sourceId = source.sourceId;

    const kind = sourceType[0]!.toUpperCase() + sourceType.slice(1);
    const title = text(source.title, `Untitled ${sourceType}`);
    const category = text(source.category);
    const unreadCount = source.unreadCount;
    const unreadDetail = `${unreadCount} unread`;
    const subtitle = [unreadDetail, kind, category].filter(Boolean).join(" · ");
    const timelineType = sourceType === "list" ? "lists" : "feeds";
    const timelineId = sourceType === "inbox" ? source.feedId ?? sourceId : sourceId;
    const foloUrl = `https://app.folo.is/share/${timelineType}/${encodeURIComponent(timelineId)}`;
    const selection = new FoloResourceSelection(
      sourceType === "list" ? "list" : "feed",
      timelineId,
      foloUrl,
    );
    const serializedSelection = selection.serialize();
    const searchable = [title, kind, category, unreadDetail, sourceId].join(" ").toLocaleLowerCase();

    return [new AlfredSFItem(title, {
      subtitle,
      icon: icon(source, iconFor),
      uid: `unread-${sourceType}-${sourceId}`,
      match: searchable,
      mods: { alt: { arg: serializedSelection } },
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, `${title} · ${unreadDetail}`),
      variables: { frr_timeline_filter: serializedSelection },
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
