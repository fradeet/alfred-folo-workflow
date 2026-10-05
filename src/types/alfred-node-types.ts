/**
 * Configuration emitted by an Alfred workflow node to an app entry point.
 *
 * Alfred carries the JSON in a workflow variable, for example
 * `{"kind": "view-input", "view": "articles"}`. The class is the receiving
 * boundary: it validates the untrusted value and exposes the node's settings as
 * typed fields.
 */
export class TimelineViewInput {
  /** Discriminator identifying an Alfred node's view configuration. */
  readonly kind = "view-input";

  /** Folo timeline view name the workflow node asks the app to fetch. */
  readonly view: string;

  constructor(view: string) {
    this.view = view;
  }

  /** Creates a node configuration from an untrusted JSON value. */
  static from(value: unknown): TimelineViewInput {
    if (!isRecord(value)) throw new TypeError("TimelineViewInput must be an object");
    if (typeof value.view !== "string" || !value.view.trim()) {
      throw new TypeError("TimelineViewInput requires a view");
    }
    return new TimelineViewInput(value.view.trim());
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
