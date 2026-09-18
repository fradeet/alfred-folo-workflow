import { FoloUnreadItem } from "../types/folo-types.js";
import { SerializedValue, parseRecord } from "./serialized-value.js";

export class UnreadSelection extends SerializedValue {
  readonly kind = "unread-selection";

  constructor(readonly item: FoloUnreadItem) {
    super();
  }

  get resourceType(): "feed" | "list" {
    return this.item.sourceType === "list" ? "list" : "feed";
  }

  get resourceId(): string {
    return this.item.sourceType === "inbox"
      ? this.item.feedId ?? this.item.sourceId
      : this.item.sourceId;
  }

  get shareUrl(): string {
    const path = this.resourceType === "list" ? "lists" : "feeds";
    return `https://app.folo.is/share/${path}/${encodeURIComponent(this.resourceId)}`;
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, item: this.item };
  }

  static from(value: unknown): UnreadSelection {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Unread selection must be an object");
    }
    const data = value as Record<string, unknown>;
    if (data.kind !== "unread-selection") throw new TypeError("Invalid unread selection kind");
    return new UnreadSelection(new FoloUnreadItem(data.item));
  }

  static parse(value: string): UnreadSelection {
    return UnreadSelection.from(parseRecord(value, "Unread selection"));
  }
}
