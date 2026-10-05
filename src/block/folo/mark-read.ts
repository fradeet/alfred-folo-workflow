import { FoloError, runFoloAsync } from "./client.js";

export class MarkReadBlockInput {
  readonly entryId: string;

  constructor(entryId: string) {
    this.entryId = entryId.trim();
    if (!this.entryId) throw new FoloError("INVALID_ARGUMENT", "Entry ID is required");
  }

  toArguments(): string[] {
    return ["entry", "mark-read", this.entryId];
  }
}

export class MarkReadBlockOutput {
  constructor(readonly entryId: string) {}
}

/** Marks one entry as read; async so apps can mark several entries concurrently. */
export async function markEntryRead(input: MarkReadBlockInput): Promise<MarkReadBlockOutput> {
  await runFoloAsync(input.toArguments(), {}, (data) => data);
  return new MarkReadBlockOutput(input.entryId);
}
