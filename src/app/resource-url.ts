#!/usr/bin/env node
/**
 * Transform entry: prints the Folo share URL for a subscription or unread item.
 *
 * Input (argv joined with spaces): a raw `subscription list` or `unread list`
 * item as JSON, as emitted in the `arg` of the subscriptions / unread Script
 * Filters.
 *
 * Output:
 * - stdout: the Folo share URL on success.
 * - On failure: a message is written to stderr and the exit code is 1.
 */
import { pathToFileURL } from "node:url";
import { foloResourceUrl } from "../shared/folo-url.js";

function main(): void {
  const input = process.argv.slice(2).join(" ").trim();
  try {
    const url = foloResourceUrl(JSON.parse(input));
    if (url) {
      process.stdout.write(url);
      return;
    }
  } catch {
    // Fall through to the failure path for non-JSON input.
  }

  console.error(`No Folo resource URL found in: ${input}`);
  process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main();
}
