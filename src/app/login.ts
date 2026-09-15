#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runFolo } from "../shared/folo-cli.js";
import { isRecord } from "../shared/guards.js";
import { FoloLoginResult, FoloWhoamiResult } from "../types/folo-types.js";

const workflowId = "com.fradeet.alfred-folo";

export function readToken(configText: string): string {
  const config = JSON.parse(configText) as unknown;

  if (!isRecord(config) || typeof config.token !== "string" || !config.token.trim()) {
    throw new Error("Folo config does not contain a token.");
  }

  return config.token;
}

export function displayName(whoami: FoloWhoamiResult): string {
  const user = whoami.user;
  return [user.name, user.handle, user.email, user.id]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? "Folo user";
}

export function setWorkflowToken(token: string): void {
  if (!token.trim()) {
    throw new Error("Folo token must not be empty.");
  }

  const appleScript = `
set tokenValue to system attribute "FOLO_LOGIN_TOKEN"
tell application id "com.runningwithcrayons.Alfred"
  set configuration "FOLO_TOKEN" to value tokenValue in workflow "${workflowId}"
end tell`;
  const result = spawnSync("/usr/bin/osascript", ["-e", appleScript], {
    encoding: "utf8",
    env: { ...process.env, FOLO_LOGIN_TOKEN: token },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to save the Folo token in Alfred.");
  }
}

async function login(): Promise<void> {
  const data = runFolo(["login"], { timeout: 190_000 }, FoloLoginResult.from);

  const token = readToken(await readFile(data.configPath, "utf8"));
  const whoami = runFolo(["--token", token, "whoami"], {}, FoloWhoamiResult.from);
  setWorkflowToken(token);
  process.stdout.write(`Login Success：${displayName(whoami)}`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  login().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
