import { FoloError, runFolo } from "./client.js";

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

export function markEntryRead(input: MarkReadBlockInput): MarkReadBlockOutput {
  runFolo(input.toArguments(), {}, (data) => data);
  return new MarkReadBlockOutput(input.entryId);
}
