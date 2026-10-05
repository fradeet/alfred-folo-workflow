import { FoloView } from "../../types/folo-types.js";
import { FoloError, runFolo } from "./client.js";

const viewOptions = [
  { name: "articles", view: FoloView.Articles },
  { name: "social", view: FoloView.Social },
  { name: "pictures", view: FoloView.Pictures },
  { name: "videos", view: FoloView.Videos },
  { name: "audio", view: FoloView.Audio },
  { name: "notifications", view: FoloView.Notifications },
] as const;

/** View scope accepted by `entry mark-all-read --view`: a view name or its {@link FoloView} number. */
export type MarkAllReadView = FoloView | (typeof viewOptions)[number]["name"];

export class MarkAllReadBlockInput {
  readonly feed?: string;
  readonly list?: string;
  readonly view?: MarkAllReadView;

  constructor(options: { feed?: string; list?: string; view?: MarkAllReadView } = {}) {
    this.feed = optionalScope(options.feed);
    this.list = optionalScope(options.list);
    this.view = parseView(options.view);
    if (this.feed && this.list) {
      throw new FoloError("INVALID_ARGUMENT", "Use only one of feed or list");
    }
  }

  toArguments(): string[] {
    const args = ["entry", "mark-all-read"];
    if (this.view !== undefined) args.push("--view", String(this.view));
    if (this.feed) args.push("--feed", this.feed);
    if (this.list) args.push("--list", this.list);
    return args;
  }
}

export class MarkAllReadBlockOutput {
  constructor(
    readonly feed?: string,
    readonly list?: string,
    readonly view?: MarkAllReadView,
  ) {}
}

/** Marks every entry in the requested scope as read; the CLI returns no payload. */
export function markAllEntriesRead(input: MarkAllReadBlockInput): MarkAllReadBlockOutput {
  runFolo(input.toArguments(), {}, (data) => data);
  return new MarkAllReadBlockOutput(input.feed, input.list, input.view);
}

function parseView(value: MarkAllReadView | undefined): MarkAllReadView | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < FoloView.Articles || value > FoloView.Notifications) {
      throw new FoloError("INVALID_ARGUMENT", invalidViewMessage(value));
    }
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  const match = viewOptions.find((option) => option.name === normalized);
  if (match === undefined) throw new FoloError("INVALID_ARGUMENT", invalidViewMessage(value));
  return match.name;
}

function invalidViewMessage(value: MarkAllReadView): string {
  const options = viewOptions.map(({ name, view }) => `${name}(${view})`).join(" | ");
  return `Invalid view "${String(value)}". Use ${options}.`;
}

function optionalScope(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
