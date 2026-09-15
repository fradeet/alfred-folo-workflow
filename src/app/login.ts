#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { env } from "node:process";
import { pathToFileURL } from "node:url";
import { runFolo } from "../shared/folo-cli.js";
import { isRecord } from "../shared/guards.js";
import { FoloLoginResult } from "../types/folo-types.js";

export function readToken(configText: string): string {
  const config = JSON.parse(configText) as unknown;

  if (!isRecord(config) || typeof config.token !== "string" || !config.token.trim()) {
    throw new Error("Folo config does not contain a token.");
  }

  return config.token;
}

export function setWorkflowToken(token: string, environment: NodeJS.ProcessEnv = env): void {
  if (!token.trim()) {
    throw new Error("Folo token must not be empty.");
  }
  const workflowId = environment.alfred_workflow_bundleid?.trim();
  if (!workflowId) {
    throw new Error("Alfred did not provide alfred_workflow_bundleid.");
  }

  const appleScript = `
set tokenValue to system attribute "FOLO_LOGIN_TOKEN"
set workflowId to system attribute "ALFRED_WORKFLOW_BUNDLE_ID"
tell application id "com.runningwithcrayons.Alfred"
  set configuration "FOLO_TOKEN" to value tokenValue in workflow workflowId
end tell`;
  const result = spawnSync("/usr/bin/osascript", ["-e", appleScript], {
    encoding: "utf8",
    env: {
      ...environment,
      FOLO_LOGIN_TOKEN: token,
      ALFRED_WORKFLOW_BUNDLE_ID: workflowId,
    },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to save the Folo token in Alfred.");
  }
}

async function login(): Promise<void> {
  const data = runFolo(["login"], { timeout: 190_000 }, FoloLoginResult.from);

  const token = readToken(await readFile(data.configPath, "utf8"));
  setWorkflowToken(token);
  process.stdout.write(JSON.stringify(data.user));
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  login().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
