import { FoloSubscription } from "../types/folo-types.js";
import { SerializedValue, parseRecord } from "./serialized-value.js";

export class SubscriptionSelection extends SerializedValue {
  readonly kind = "subscription-selection";

  constructor(readonly subscription: FoloSubscription) {
    super();
    void this.resourceId;
  }

  get resourceType(): "feed" | "list" {
    if (this.subscription.lists) return "list";
    if (this.subscription.feeds) return "feed";
    throw new TypeError("Subscription selection must contain a feed or list");
  }

  get resourceId(): string {
    const id = this.resourceType === "list"
      ? this.subscription.listId ?? this.subscription.lists?.id
      : this.subscription.feedId ?? this.subscription.feeds?.id;
    if (!id?.trim()) throw new TypeError("Subscription selection must contain a resource ID");
    return id;
  }

  get shareUrl(): string {
    const path = this.resourceType === "list" ? "lists" : "feeds";
    return `https://app.folo.is/share/${path}/${encodeURIComponent(this.resourceId)}`;
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, subscription: this.subscription };
  }

  static from(value: unknown): SubscriptionSelection {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Subscription selection must be an object");
    }
    const data = value as Record<string, unknown>;
    if (data.kind !== "subscription-selection") {
      throw new TypeError("Invalid subscription selection kind");
    }
    return new SubscriptionSelection(new FoloSubscription(data.subscription));
  }

  static parse(value: string): SubscriptionSelection {
    return SubscriptionSelection.from(parseRecord(value, "Subscription selection"));
  }
}
