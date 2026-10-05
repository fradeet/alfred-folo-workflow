import { isRecord } from "./guards.js";
import { en } from "../locales/en.js";
import { AlfredSFItem, AlfredSFItemAction, AlfredSFItemIcon, AlfredSFItemText } from "../types/alfred-types.js";
import { IconResolver } from "./icon-cache.js";
import { SubscriptionSelection } from "../contracts/subscription-selection.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { UnreadSelection } from "../contracts/unread-selection.js";
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

export function timelineItems(
  data: FoloTimelineResult,
  iconFor?: IconResolver,
  nextPageArg = "",
  latestPageArg?: string,
): AlfredSFItem[] {
  return data.entries.flatMap((item): AlfredSFItem[] => {
    const entry = item.entries;
    const feed = item.feeds;
    const title = text(entry.title, en.timeline.untitledEntry);
    const feedTitle = text(feed.title, en.timeline.unknownFeed);
    const author = text(entry.author);
    const date = formatDate(entry.publishedAt);
    const subtitle = [feedTitle, author, date].filter(Boolean).join(" · ");
    const url = optionalString(entry.url) ?? optionalString(feed.siteUrl) ?? "https://app.folo.is";
    const entryId = entry.id;
    const entryOutput = new TimelineSelection(url, entryId, entry, feed, item.subscriptions);

    return [new AlfredSFItem(title, {
      action: url,
      subtitle,
      arg: entryOutput.serialize(),
      mods: {
        alt: nextPageArg
          ? { arg: nextPageArg }
          : { arg: "", subtitle: en.timeline.noNextPage, valid: false },
        "shift+alt": latestPageArg
          ? { arg: latestPageArg }
          : { arg: "", subtitle: en.timeline.alreadyAtTop, valid: false },
      },
      icon: icon(feed, iconFor),
      uid: entryId,
      quicklookurl: url,
      text: new AlfredSFItemText(url, title),
    })];
  });
}

export function subscriptionItems(data: FoloSubscriptionsResult, iconFor?: IconResolver): AlfredSFItem[] {
  return data.subscriptions.flatMap((subscription): AlfredSFItem[] => {
    const feed = subscription.feeds;
    const list = subscription.lists;
    const target = list ?? feed;
    if (!target) return [];

    const selection = new SubscriptionSelection(subscription);
    const kind = selection.resourceType === "list" ? en.subscriptions.list : en.subscriptions.feed;
    const id = selection.resourceId;

    const title = text(optionalString(subscription.title) ?? target.title, en.subscriptions.untitled(kind));
    const description = text(target.description);
    const category = text(subscription.category);
    const feedCount = list ? list.feedIds.length : undefined;
    const detail = feedCount === undefined ? undefined : en.subscriptions.feedCount(feedCount);
    const subtitle = [kind, category, detail, description]
      .filter(Boolean)
      .join(" · ");
    const foloUrl = selection.shareUrl;
    const serializedSelection = selection.serialize();

    return [new AlfredSFItem(title, {
      action: foloUrl,
      subtitle,
      arg: serializedSelection,
      icon: icon(target, iconFor),
      uid: `${selection.resourceType}-${id}`,
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, title),
    })];
  });
}

export function unreadItems(data: FoloUnreadResult, iconFor?: IconResolver): AlfredSFItem[] {
  return data.items.flatMap((source): AlfredSFItem[] => {
    const sourceType = source.sourceType;
    const sourceId = source.sourceId;
    const selection = new UnreadSelection(source);

    const kind = sourceType[0]!.toUpperCase() + sourceType.slice(1);
    const title = text(source.title, en.unread.untitled(sourceType));
    const category = text(source.category);
    const unreadCount = source.unreadCount;
    const unreadDetail = en.unread.count(unreadCount);
    const subtitle = [unreadDetail, kind, category].filter(Boolean).join(" · ");
    const foloUrl = selection.shareUrl;
    const serializedSelection = selection.serialize();

    return [new AlfredSFItem(title, {
      action: foloUrl,
      subtitle,
      arg: serializedSelection,
      icon: icon(source, iconFor),
      uid: `unread-${sourceType}-${sourceId}`,
      quicklookurl: foloUrl,
      text: new AlfredSFItemText(foloUrl, title),
    })];
  });
}

export function errorItem(error: unknown): AlfredSFItem {
  const code = isRecord(error) ? error.code : undefined;
  const unauthorized = code === "UNAUTHORIZED";
  const timedOut = code === "TIMEOUT";
  const message = isRecord(error) ? error.message : undefined;

  return new AlfredSFItem(unauthorized ? en.errors.authenticationRequired : en.errors.unableToLoad, {
    subtitle: unauthorized
      ? en.errors.authenticate
      : timedOut
        ? en.errors.timeout
        : text(message, en.errors.debugger),
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
