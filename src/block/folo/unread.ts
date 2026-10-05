import { FoloUnreadResult } from "../../types/folo-types.js";
import { runFolo } from "./client.js";

export class UnreadBlockInput {
  constructor(readonly view?: string) {}

  toArguments(): string[] {
    const args = ["unread", "list"];
    if (this.view?.trim()) args.push("--view", this.view.trim());
    return args;
  }
}

export function getUnread(input: UnreadBlockInput): FoloUnreadResult {
  return runFolo(input.toArguments(), { cache: true }, FoloUnreadResult.from);
}
