import { SerializedValue, parseRecord } from "./serialized-value.js";

export type FoloResourceType = "feed" | "list";

export class FoloResourceSelection extends SerializedValue {
  readonly kind = "folo-resource";

  constructor(
    readonly resourceType: FoloResourceType,
    readonly resourceId: string,
    readonly shareUrl: string,
    readonly websiteUrl?: string,
  ) {
    super();
    if (!resourceId.trim()) throw new TypeError("Folo resource ID is required");
    if (!shareUrl.trim()) throw new TypeError("Folo resource share URL is required");
  }

  get openUrl(): string {
    return this.websiteUrl || this.shareUrl;
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      shareUrl: this.shareUrl,
      ...(this.websiteUrl === undefined ? {} : { websiteUrl: this.websiteUrl }),
    };
  }

  static from(value: unknown): FoloResourceSelection {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Folo resource selection must be an object");
    }
    const data = value as Record<string, unknown>;
    if (data.kind !== "folo-resource") throw new TypeError("Invalid Folo resource selection kind");
    if (data.resourceType !== "feed" && data.resourceType !== "list") {
      throw new TypeError("Invalid Folo resource type");
    }
    if (typeof data.resourceId !== "string" || typeof data.shareUrl !== "string") {
      throw new TypeError("Folo resource selection is incomplete");
    }
    return new FoloResourceSelection(
      data.resourceType,
      data.resourceId,
      data.shareUrl,
      typeof data.websiteUrl === "string" && data.websiteUrl ? data.websiteUrl : undefined,
    );
  }

  static parse(value: string): FoloResourceSelection {
    return FoloResourceSelection.from(parseRecord(value, "Folo resource selection"));
  }
}
