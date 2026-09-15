/** Folo timeline view identifiers used by the CLI and API. */
export enum FoloView {
  Articles = 0,
  Social = 1,
  Pictures = 2,
  Videos = 3,
  Audio = 4,
  Notifications = 5,
}

/** Media metadata attached to a Folo entry. */
export class FoloMedia {
  constructor(
    readonly url?: string,
    readonly type?: "photo" | "video",
    readonly previewImageUrl?: string,
    readonly width?: number,
    readonly height?: number,
    readonly blurhash?: string,
  ) {}

  /** Creates media metadata from an untrusted CLI value. */
  static from(value: unknown): FoloMedia {
    const data = record(value);
    return new FoloMedia(
      string(data.url),
      mediaType(data.type),
      string(data.preview_image_url),
      number(data.width),
      number(data.height),
      string(data.blurhash),
    );
  }
}

/** Downloadable attachment metadata attached to a Folo entry. */
export class FoloAttachment {
  readonly url?: string;
  readonly title?: string;
  readonly durationInSeconds?: number;
  readonly mimeType?: string;
  readonly sizeInBytes?: number;

  constructor(value: unknown) {
    const data = record(value);
    this.url = string(data.url);
    this.title = string(data.title);
    this.durationInSeconds = number(data.duration_in_seconds);
    this.mimeType = string(data.mime_type);
    this.sizeInBytes = number(data.size_in_bytes);
  }
}

/** Topic classification metadata generated for a Folo entry. */
export class FoloEntryTags {
  readonly schemaOrgCategory?: string | null;
  readonly mediaTopics: string[];

  constructor(value: unknown) {
    const data = record(value);
    this.schemaOrgCategory = nullableString(data.schemaOrgCategory);
    this.mediaTopics = stringArray(data.mediaTopics);
  }
}

/** Content metadata returned in the `entries` field of a timeline row. */
export class FoloEntry {
  readonly id: string;
  readonly title?: string;
  readonly url?: string;
  readonly description?: string;
  readonly content?: string;
  readonly guid?: string;
  readonly author?: string;
  readonly authorUrl?: string | null;
  readonly authorAvatar?: string | null;
  readonly insertedAt?: string;
  readonly publishedAt?: string;
  readonly media: FoloMedia[];
  readonly categories: string[];
  readonly attachments: FoloAttachment[];
  readonly extra?: unknown;
  readonly language?: string | null;
  readonly summary?: string;
  readonly tags?: FoloEntryTags;

  /** Creates an entry from an untrusted CLI value, omitting invalid optional fields. */
  constructor(value: unknown) {
    const data = record(value);
    if (typeof data.id !== "string" || !data.id.trim()) {
      throw new TypeError("Folo entry did not contain an entry ID.");
    }
    this.id = data.id;
    this.title = string(data.title);
    this.url = string(data.url);
    this.description = string(data.description);
    this.content = string(data.content);
    this.guid = string(data.guid);
    this.author = string(data.author);
    this.authorUrl = nullableString(data.authorUrl);
    this.authorAvatar = nullableString(data.authorAvatar);
    this.insertedAt = string(data.insertedAt);
    this.publishedAt = string(data.publishedAt);
    this.media = array(data.media).map(FoloMedia.from);
    this.categories = stringArray(data.categories);
    this.attachments = array(data.attachments).map((item) => new FoloAttachment(item));
    this.extra = data.extra;
    this.language = nullableString(data.language);
    this.summary = string(data.summary);
    this.tags = optionalRecord(data.tags) ? new FoloEntryTags(data.tags) : undefined;
  }
}

/** Collection metadata attached to a collected timeline entry. */
export class FoloCollection {
  readonly createdAt?: string;

  constructor(value: unknown) {
    this.createdAt = string(record(value).createdAt);
  }
}

/** Partial public user data embedded in feeds and boosts. */
export class FoloUserPreview {
  readonly id?: string;
  readonly name?: string | null;
  readonly handle?: string | null;
  readonly image?: string | null;

  constructor(value: unknown) {
    const data = record(value);
    this.id = string(data.id);
    this.name = nullableString(data.name);
    this.handle = nullableString(data.handle);
    this.image = nullableString(data.image);
  }
}

/** Feed metadata associated with a timeline entry. */
export class FoloFeed {
  readonly type?: string;
  readonly id?: string;
  readonly url?: string;
  readonly title?: string;
  readonly description?: string;
  readonly siteUrl?: string;
  readonly image?: string | null;
  readonly errorMessage?: string | null;
  readonly errorAt?: string | null;
  readonly ownerUserId?: string | null;
  readonly owner?: FoloUserPreview;

  /** Creates feed metadata from an untrusted CLI value. */
  constructor(value: unknown) {
    const data = record(value);
    this.type = string(data.type);
    this.id = string(data.id);
    this.url = string(data.url);
    this.title = string(data.title);
    this.description = string(data.description);
    this.siteUrl = string(data.siteUrl);
    this.image = nullableString(data.image);
    this.errorMessage = nullableString(data.errorMessage);
    this.errorAt = nullableString(data.errorAt);
    this.ownerUserId = nullableString(data.ownerUserId);
    this.owner = optionalRecord(data.owner) ? new FoloUserPreview(data.owner) : undefined;
  }
}

/** A single row returned by `folo timeline`. */
export class FoloTimelineItem {
  readonly read?: boolean;
  readonly view?: FoloView;
  readonly aiScore?: number | null;
  readonly from: string[];
  readonly entries: FoloEntry;
  readonly feeds: FoloFeed;
  readonly settings: Record<string, unknown>;
  readonly collections?: FoloCollection;

  /** Creates a timeline row from an untrusted CLI value. */
  constructor(value: unknown) {
    const data = record(value);
    this.read = boolean(data.read);
    this.view = view(data.view);
    this.aiScore = nullableNumber(data.aiScore);
    this.from = stringArray(data.from);
    this.entries = new FoloEntry(data.entries);
    this.feeds = new FoloFeed(data.feeds);
    this.settings = record(data.settings);
    this.collections = optionalRecord(data.collections)
      ? new FoloCollection(data.collections)
      : undefined;
  }
}

/** Paginated result returned by `folo timeline`. */
export class FoloTimelineResult {
  constructor(
    readonly entries: FoloTimelineItem[],
    readonly nextCursor: string | null,
    readonly hasNext: boolean,
  ) {}

  /** Validates and converts the top-level timeline payload. */
  static from(value: unknown): FoloTimelineResult {
    const data = requiredRecord(value, "timeline");
    if (!Array.isArray(data.entries)) throw new TypeError("Folo timeline did not contain an entries array.");

    return new FoloTimelineResult(
      data.entries.map((item) => new FoloTimelineItem(item)),
      nullableString(data.nextCursor) ?? null,
      boolean(data.hasNext) ?? false,
    );
  }
}

/** List metadata attached to a list subscription. */
export class FoloList {
  readonly id?: string;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly image?: string | null;
  readonly ownerUserId?: string | null;
  readonly feedIds: string[];
  readonly view?: FoloView;
  readonly fee?: number;

  constructor(value: unknown) {
    const data = record(value);
    this.id = string(data.id);
    this.title = nullableString(data.title);
    this.description = nullableString(data.description);
    this.image = nullableString(data.image);
    this.ownerUserId = nullableString(data.ownerUserId);
    this.feedIds = array(data.feedIds).flatMap((item) => typeof item === "string" ? [item] : []);
    this.view = view(data.view);
    this.fee = number(data.fee);
  }
}

/** Inbox metadata attached to an inbox subscription. */
export class FoloInbox {
  readonly id?: string;
  readonly title?: string | null;

  constructor(value: unknown) {
    const data = record(value);
    this.id = string(data.id);
    this.title = nullableString(data.title);
  }
}

/** A feed, list, or inbox subscription. */
export class FoloSubscription {
  readonly userId?: string;
  readonly feedId?: string;
  readonly listId?: string;
  readonly inboxId?: string;
  readonly title?: string | null;
  readonly category?: string | null;
  readonly view?: FoloView;
  readonly isPrivate?: boolean;
  readonly hideFromTimeline?: boolean | null;
  readonly createdAt?: string;
  readonly feeds?: FoloFeed;
  readonly lists?: FoloList;
  readonly inboxes?: FoloInbox;
  readonly boost?: FoloBoost;

  constructor(value: unknown) {
    const data = record(value);
    this.userId = string(data.userId);
    this.feedId = string(data.feedId);
    this.listId = string(data.listId);
    this.inboxId = string(data.inboxId);
    this.title = nullableString(data.title);
    this.category = nullableString(data.category);
    this.view = view(data.view);
    this.isPrivate = boolean(data.isPrivate);
    this.hideFromTimeline = nullableBoolean(data.hideFromTimeline);
    this.createdAt = string(data.createdAt);
    this.feeds = optionalRecord(data.feeds) ? new FoloFeed(data.feeds) : undefined;
    this.lists = optionalRecord(data.lists) ? new FoloList(data.lists) : undefined;
    this.inboxes = optionalRecord(data.inboxes) ? new FoloInbox(data.inboxes) : undefined;
    this.boost = optionalRecord(data.boost) ? new FoloBoost(data.boost) : undefined;
  }
}

/** Users boosting a subscribed feed. */
export class FoloBoost {
  readonly boosters: FoloUserPreview[];

  constructor(value: unknown) {
    this.boosters = array(record(value).boosters).map((item) => new FoloUserPreview(item));
  }
}

/** All subscriptions returned by `folo subscription list`. */
export class FoloSubscriptionsResult {
  constructor(readonly subscriptions: FoloSubscription[]) {}

  static from(value: unknown): FoloSubscriptionsResult {
    const data = requiredRecord(value, "subscription list");
    if (!Array.isArray(data.subscriptions)) {
      throw new TypeError("Folo subscription list did not contain a subscriptions array.");
    }

    return new FoloSubscriptionsResult(
      data.subscriptions.map((item) => new FoloSubscription(item)),
    );
  }
}

/** A subscription source with unread entries. */
export class FoloUnreadItem {
  readonly sourceType: "feed" | "list" | "inbox";
  readonly sourceId: string;
  readonly feedId?: string;
  readonly title?: string | null;
  readonly category?: string | null;
  readonly view?: FoloView;
  readonly unreadCount: number;
  readonly isPrivate?: boolean;

  constructor(value: unknown) {
    const data = requiredRecord(value, "unread item");
    if (data.sourceType !== "feed" && data.sourceType !== "list" && data.sourceType !== "inbox") {
      throw new TypeError("Folo unread item did not contain a valid source type.");
    }
    if (typeof data.sourceId !== "string" || !data.sourceId) {
      throw new TypeError("Folo unread item did not contain a source ID.");
    }

    this.sourceType = data.sourceType;
    this.sourceId = data.sourceId;
    this.feedId = string(data.feedId);
    this.title = nullableString(data.title);
    this.category = nullableString(data.category);
    this.view = view(data.view);
    this.unreadCount = number(data.unreadCount) ?? 0;
    this.isPrivate = boolean(data.isPrivate);
  }
}

/** Subscriptions returned by `folo unread list`, ordered by unread count. */
export class FoloUnreadResult {
  constructor(
    readonly total: number,
    readonly items: FoloUnreadItem[],
  ) {}

  static from(value: unknown): FoloUnreadResult {
    const data = requiredRecord(value, "unread list");
    if (!Array.isArray(data.items)) {
      throw new TypeError("Folo unread list did not contain an items array.");
    }

    return new FoloUnreadResult(
      number(data.total) ?? 0,
      data.items.map((item) => new FoloUnreadItem(item)),
    );
  }
}

/** User profile included in login and whoami responses. */
export class FoloUser {
  readonly id: string;
  readonly name?: string | null;
  readonly handle?: string | null;
  readonly email: string;
  readonly emailVerified?: boolean | null;
  readonly image?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly twoFactorEnabled?: boolean | null;
  readonly isAnonymous?: boolean | null;
  readonly suspended?: boolean | null;
  readonly lastLoginMethod?: string | null;
  readonly socialLinks?: Record<string, unknown> | null;
  readonly bio?: string | null;
  readonly website?: string | null;
  readonly stripeCustomerId?: string | null;
  readonly appleAppAccountToken?: string | null;
  readonly deleted?: boolean | null;
  readonly role?: string | null;
  readonly roleEndAt?: string | null;
  readonly inactive?: boolean | null;

  /** Creates a user profile from an untrusted CLI value. */
  constructor(value: unknown) {
    const data = requiredRecord(value, "user");
    this.id = requiredString(data.id, "user ID");
    this.name = nullableString(data.name);
    this.handle = nullableString(data.handle);
    this.email = requiredString(data.email, "user email");
    this.emailVerified = nullableBoolean(data.emailVerified);
    this.image = nullableString(data.image);
    this.createdAt = requiredString(data.createdAt, "user creation time");
    this.updatedAt = requiredString(data.updatedAt, "user update time");
    this.twoFactorEnabled = nullableBoolean(data.twoFactorEnabled);
    this.isAnonymous = nullableBoolean(data.isAnonymous);
    this.suspended = nullableBoolean(data.suspended);
    this.lastLoginMethod = nullableString(data.lastLoginMethod);
    this.socialLinks = data.socialLinks === null ? null : optionalRecord(data.socialLinks);
    this.bio = nullableString(data.bio);
    this.website = nullableString(data.website);
    this.stripeCustomerId = nullableString(data.stripeCustomerId);
    this.appleAppAccountToken = nullableString(data.appleAppAccountToken);
    this.deleted = nullableBoolean(data.deleted);
    this.role = nullableString(data.role);
    this.roleEndAt = nullableString(data.roleEndAt);
    this.inactive = nullableBoolean(data.inactive);
  }
}

/** Authentication session included in a whoami response. */
export class FoloSession {
  readonly id?: string;
  readonly userId?: string;
  readonly expiresAt?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly userAgent?: string;

  /** Creates session metadata from an untrusted CLI value. */
  constructor(value: unknown) {
    const data = record(value);
    this.id = string(data.id);
    this.userId = string(data.userId);
    this.expiresAt = string(data.expiresAt);
    this.createdAt = string(data.createdAt);
    this.updatedAt = string(data.updatedAt);
    this.userAgent = string(data.userAgent);
  }
}

/** Successful result returned by `folo login`. */
export class FoloLoginResult {
  constructor(
    readonly message: string,
    readonly configPath: string,
    readonly user: FoloUser,
  ) {}

  /** Validates and converts a login payload without exposing the saved token. */
  static from(value: unknown): FoloLoginResult {
    const data = requiredRecord(value, "login");
    if (typeof data.configPath !== "string" || !data.configPath.trim()) {
      throw new TypeError("Folo login did not return a config path.");
    }
    return new FoloLoginResult(
      string(data.message) ?? "Login successful.",
      data.configPath,
      new FoloUser(data.user),
    );
  }
}

/** Successful result returned by `folo whoami`. */
export class FoloWhoamiResult {
  readonly user: FoloUser;
  readonly session: FoloSession;
  readonly role?: string;
  readonly roleEndAt?: string | null;
  readonly feedSubscriptionLimit?: number | null;
  readonly rsshubSubscriptionLimit?: number | null;

  /** Validates and converts a whoami payload. */
  constructor(value: unknown) {
    const data = requiredRecord(value, "whoami");
    this.user = new FoloUser(data.user);
    this.session = new FoloSession(data.session);
    this.role = string(data.role);
    this.roleEndAt = nullableString(data.roleEndAt);
    this.feedSubscriptionLimit = nullableNumber(data.feedSubscriptionLimit);
    this.rsshubSubscriptionLimit = nullableNumber(data.rsshubSubscriptionLimit);
  }

  static from(value: unknown): FoloWhoamiResult {
    return new FoloWhoamiResult(value);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  const data = record(value);
  if (Object.keys(data).length === 0) throw new TypeError(`Folo ${name} returned an invalid payload.`);
  return data;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return array(value).flatMap((item) => typeof item === "string" ? [item] : []);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Folo response did not contain a valid ${name}.`);
  }
  return value;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : string(value);
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nullableNumber(value: unknown): number | null | undefined {
  return value === null ? null : number(value);
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function nullableBoolean(value: unknown): boolean | null | undefined {
  return value === null ? null : boolean(value);
}

function mediaType(value: unknown): "photo" | "video" | undefined {
  return value === "photo" || value === "video" ? value : undefined;
}

function view(value: unknown): FoloView | undefined {
  const parsed = number(value);
  return parsed !== undefined && parsed >= FoloView.Articles && parsed <= FoloView.Notifications
    ? parsed as FoloView
    : undefined;
}
