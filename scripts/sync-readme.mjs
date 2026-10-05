import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(projectDirectory, "workflow", "README.md");
const plistPath = join(projectDirectory, "workflow", "info.plist");

const readme = readFileSync(readmePath, "utf8");
const plist = readFileSync(plistPath, "utf8");
const readmeField = /(<key>readme<\/key>\s*<string>)[\s\S]*?(<\/string>)/g;
const matches = [...plist.matchAll(readmeField)];

if (matches.length !== 1) {
  throw new Error(`Expected one string-valued readme field in ${plistPath}; found ${matches.length}`);
}

const escapedReadme = readme
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");
const updated = plist.replace(readmeField, (_, prefix, suffix) => `${prefix}${escapedReadme}${suffix}`);

if (updated !== plist) {
  writeFileSync(plistPath, updated);
}
