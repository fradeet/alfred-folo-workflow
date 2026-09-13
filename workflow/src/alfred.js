const stripMarkup = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const text = (value, fallback = "") => {
  const normalized = stripMarkup(value);
  return normalized || fallback;
};

export function timelineItems(data, query = "") {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const needle = query.trim().toLocaleLowerCase();

  const items = entries.map((item) => {
    const entry = item?.entries ?? {};
    const feed = item?.feeds ?? {};
    const title = text(entry.title, "Untitled entry");
    const feedTitle = text(feed.title, "Unknown feed");
    const author = text(entry.author);
    const summary = text(entry.description ?? entry.content);
    const date = formatDate(entry.publishedAt);
    const subtitle = [feedTitle, author, date].filter(Boolean).join(" · ");
    const url = entry.url ?? feed.siteUrl ?? "https://app.folo.is";
    const searchable = [title, feedTitle, author, summary, url].join(" ").toLocaleLowerCase();

    return {
      title,
      subtitle,
      arg: url,
      uid: entry.id,
      match: searchable,
      quicklookurl: url,
      text: { copy: url, largetype: summary || title },
    };
  });

  return needle ? items.filter((item) => item.match.includes(needle)) : items;
}

export function errorItem(error) {
  const unauthorized = error?.code === "UNAUTHORIZED";
  const timedOut = error?.code === "TIMEOUT";
  return {
    title: unauthorized ? "Folo authentication required" : "Unable to load Folo",
    subtitle: unauthorized
      ? "Run flogin to authenticate"
      : timedOut
        ? "The Folo request timed out; check your network and try again"
        : text(error?.message, "Open Alfred's debugger for details"),
    valid: false,
  };
}

export function emptyItem(title, subtitle) {
  return { title, subtitle, valid: false };
}

export function output(items, cacheSeconds) {
  const response = { items, skipknowledge: true };
  if (cacheSeconds) response.cache = { seconds: cacheSeconds, loosereload: true };
  process.stdout.write(JSON.stringify(response));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
