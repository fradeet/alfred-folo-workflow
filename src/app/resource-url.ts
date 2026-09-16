#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { foloResourceUrl } from "../shared/folo-url.js";

/** Prints the Folo resource URL for a subscription or unread item passed as JSON on argv. */
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
