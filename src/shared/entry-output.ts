import { isRecord } from "./guards.js";

/** Serialized value passed from an entry result to downstream workflow actions. */
export class FoloEntryOutput {
  constructor(
    readonly url: string,
    readonly entryId: string,
  ) {
    if (!url.trim()) throw new TypeError("Entry URL is required");
    if (!entryId.trim()) throw new TypeError("Entry ID is required");
  }

  /** Converts the value to the stable JSON shape emitted by Script Filter items. */
  toJSON(): { url: string; entryId: string } {
    return {
      url: this.url,
      entryId: this.entryId,
    };
  }

  /** Serializes the value for Alfred's string-based `arg` field. */
  serialize(): string {
    return JSON.stringify(this);
  }

  /** Parses and validates a value received by a downstream workflow action. */
  static parse(value: string): FoloEntryOutput {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new TypeError("Entry output must be valid JSON");
    }

    if (!isRecord(parsed) || typeof parsed.url !== "string" || !parsed.url.trim()) {
      throw new TypeError("Entry output must contain a URL");
    }
    if (typeof parsed.entryId !== "string" || !parsed.entryId.trim()) {
      throw new TypeError("Entry output must contain an entry ID");
    }

    return new FoloEntryOutput(parsed.url, parsed.entryId);
  }
}
