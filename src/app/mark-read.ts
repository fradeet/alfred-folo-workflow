#!/usr/bin/env node
/**
 * "Mark read" Run Script entry: marks a single timeline entry as read.
 *
 * Input (argv joined with spaces): either
 * - a serialized timeline selection passed down unchanged from the timeline
 *   Script Filter, or
 * - a standard input JSON object marked with `kind: "standard"` or
 *   `isStandardInput: 1` (see docs/reference/standard-input.md).
 *
 * Standard environment variables: `frrMarkReadKind` or
 * `frrMarkReadIsStandardInput` enable standard input when argv is empty;
 * `frrMarkReadEntryId` then provides the entry ID. A timeline selection is
 * never overridden by these variables.
 *
 * Output:
 * - stdout: a serialized {@link MarkReadAppOutput} on success.
 * - On failure: the error message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { MarkReadBlockInput, MarkReadBlockOutput, markEntryRead } from "../block/folo/mark-read.js";
import { TimelineSelection } from "../contracts/timeline-selection.js";
import { SerializedValue } from "../contracts/serialized-value.js";
import {
  StandardInputSpec,
  resolveStandardInput,
  standardRequiredString,
} from "../shared/standard-input.js";

/** Standard input declaration for the mark-read app. */
const markReadStandardSpec: StandardInputSpec = {
  appId: "mark-read",
  kindEnv: "frrMarkReadKind",
  isStandardEnv: "frrMarkReadIsStandardInput",
  fields: [{ field: "entryId", env: "frrMarkReadEntryId", type: "string" }],
};

/** Standard input for external callers; the constructor validates every field. */
export class MarkReadStandardInput {
  readonly entryId: string;

  constructor(options: { entryId?: unknown } = {}) {
    this.entryId = standardRequiredString(options.entryId, "entryId");
  }

  static from(value: unknown): MarkReadStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Mark-read standard input must be an object");
    }
    return new MarkReadStandardInput(value);
  }
}

export type MarkReadAppInput = TimelineSelection | MarkReadStandardInput;

/** Parses argv, activating the standard environment variables only when marked. */
export function parseMarkReadAppInput(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): MarkReadAppInput {
  const standard = resolveStandardInput(
    value,
    env,
    markReadStandardSpec,
    (data) => data.kind === "timeline-entry",
  );
  if (standard !== undefined) return MarkReadStandardInput.from(standard);
  return TimelineSelection.parse(value);
}

export class MarkReadAppOutput extends SerializedValue {
  readonly kind = "mark-read-result";

  constructor(readonly entryId: string) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, entryId: this.entryId };
  }
}

/** Marks the selected Folo entry as read. */
export async function markRead(input: MarkReadAppInput): Promise<MarkReadAppOutput> {
  const result: MarkReadBlockOutput = await markEntryRead(new MarkReadBlockInput(input.entryId));
  return new MarkReadAppOutput(result.entryId);
}

async function main(): Promise<void> {
  try {
    const output = await markRead(parseMarkReadAppInput(process.argv.slice(2).join(" ")));
    process.stdout.write(output.serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
