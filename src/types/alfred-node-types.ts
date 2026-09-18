/**
 * Configuration emitted by an Alfred workflow node to an app entry point.
 *
 * Alfred carries the JSON in a workflow variable, for example
 * `{"view": "articles"}`. The class is the receiving boundary: it validates the
 * untrusted value and exposes the node's settings as typed fields.
 */
export class TimelineViewInput {
  /** Folo timeline view name the workflow node asks the app to fetch. */
  readonly view?: string;

  constructor(view?: string) {
    this.view = optionalString(view);
  }

  /** Creates a node configuration from an untrusted JSON value. */
  static from(value: unknown): TimelineViewInput {
    if (!isRecord(value)) throw new TypeError("Alfred node config must be an object");
    return new TimelineViewInput(optionalString(value.view));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
