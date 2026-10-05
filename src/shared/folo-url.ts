import { isRecord } from "./guards.js";

export interface FoloShareTarget {
  type: "feed" | "list";
  id: string;
}

export function parseFoloShareUrl(value: string): FoloShareTarget | undefined {
  try {
    const url = new URL(value.trim());
    const match = /^\/share\/(feeds|lists)\/([^/]+)\/?$/.exec(url.pathname);
    if (url.hostname !== "app.folo.is" || !match) return undefined;

    return {
      type: match[1] === "lists" ? "list" : "feed",
      id: decodeURIComponent(match[2]!),
    };
  } catch {
    return undefined;
  }
}

const idString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

const nestedId = (value: unknown): string | undefined =>
  isRecord(value) ? idString(value.id) : undefined;

const shareUrl = (segment: "feeds" | "lists", id: string | undefined): string | undefined =>
  id ? `https://app.folo.is/share/${segment}/${encodeURIComponent(id)}` : undefined;

/** Composes the Folo share URL for a raw `subscription list` or `unread list` item. */
export function foloResourceUrl(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  if (typeof value.sourceType === "string") {
    if (value.sourceType === "list") return shareUrl("lists", idString(value.sourceId));
    if (value.sourceType === "feed") return shareUrl("feeds", idString(value.sourceId));
    if (value.sourceType === "inbox") return shareUrl("feeds", idString(value.feedId) ?? idString(value.sourceId));
    return undefined;
  }

  const listId = idString(value.listId) ?? nestedId(value.lists);
  if (listId) return shareUrl("lists", listId);

  const feedId = idString(value.feedId) ?? nestedId(value.feeds) ?? nestedId(value.inboxes);
  if (feedId) return shareUrl("feeds", feedId);

  return undefined;
}
