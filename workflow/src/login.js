#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runFolo } from "./folo-cli.js";

const workflowId = "com.fradeet.alfred-folo";

export function readToken(configText) {
  const config = JSON.parse(configText);

  if (typeof config?.token !== "string" || !config.token.trim()) {
    throw new Error("Folo config does not contain a token.");
  }

  return config.token;
}

export function displayName(whoami) {
  const user = whoami?.user ?? {};
  return [user.name, user.handle, user.email, user.id]
    .find((value) => typeof value === "string" && value.trim()) ?? "Folo user";
}

export function setWorkflowToken(token) {
  if (typeof token !== "string" || !token.trim()) {
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

async function login() {
  const data = runFolo(["login"], { timeout: 190_000 });

  if (typeof data?.configPath !== "string" || !data.configPath.trim()) {
    throw new Error("Folo login did not return a config path.");
  }

  const token = readToken(await readFile(data.configPath, "utf8"));
  const whoami = runFolo(["--token", token, "whoami"]);
  setWorkflowToken(token);
  process.stdout.write(`登录成功：${displayName(whoami)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  login().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
