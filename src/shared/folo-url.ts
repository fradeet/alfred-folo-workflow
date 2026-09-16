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
