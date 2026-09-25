import { SerializedValue } from "./serialized-value.js";

/** Result shared by actions that mark entries in a cached timeline page. */
export class MarkReadAboveAppOutput extends SerializedValue {
  readonly kind = "mark-read-above-result";

  constructor(
    readonly anchorEntryId: string,
    readonly markedEntryIds: string[],
  ) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      anchorEntryId: this.anchorEntryId,
      markedEntryIds: this.markedEntryIds,
    };
  }
}
