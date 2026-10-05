import { FoloSubscriptionsResult } from "../../types/folo-types.js";
import { runFolo } from "./client.js";

export class SubscriptionsBlockInput {
  constructor(
    readonly view?: string,
    readonly category?: string,
  ) {}

  toArguments(): string[] {
    const args = ["subscription", "list"];
    if (this.view?.trim()) args.push("--view", this.view.trim());
    if (this.category?.trim()) args.push("--category", this.category.trim());
    return args;
  }
}

export function getSubscriptions(input: SubscriptionsBlockInput): FoloSubscriptionsResult {
  return runFolo(input.toArguments(), {}, FoloSubscriptionsResult.from);
}
