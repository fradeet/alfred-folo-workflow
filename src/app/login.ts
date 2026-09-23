#!/usr/bin/env node
/**
 * `folologin` Script Filter entry: authenticates with Folo and stores the token.
 *
 * Input: either no arguments (the workflow must run inside Alfred, which
 * provides `alfred_workflow_bundleid` in the environment), or a standard input
 * JSON object marked with `kind: "standard"` or `isStandardInput: 1` (see
 * docs/reference/standard-input.md).
 *
 * Standard environment variables: `frrLoginKind` or `frrLoginIsStandardInput`
 * enable standard input when argv is empty; `frrLoginWorkflowBundleId` then
 * provides the workflow bundle ID the token is saved to. Standard input does
 * not remove this app's dependence on macOS, Alfred, and `osascript`.
 *
 * Output:
 * - stdout: a serialized {@link LoginAppOutput} containing the user profile.
 * - Side effect: the token from the Folo CLI config file is saved as the
 *   workflow's `FOLO_TOKEN` configuration variable via osascript.
 * - On failure: the error message is written to stderr and the exit code is 1.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { env } from "node:process";
import { pathToFileURL } from "node:url";
import { isRecord } from "../shared/guards.js";
import {
  StandardInputSpec,
  resolveStandardInput,
  standardRequiredString,
} from "../shared/standard-input.js";
import { LoginBlockInput, loginToFolo } from "../block/folo/login.js";
import { SerializedValue } from "../contracts/serialized-value.js";
import { FoloUser } from "../types/folo-types.js";

/** Standard input declaration for the login app. */
const loginStandardSpec: StandardInputSpec = {
  appId: "login",
  kindEnv: "frrLoginKind",
  isStandardEnv: "frrLoginIsStandardInput",
  fields: [{ field: "workflowBundleId", env: "frrLoginWorkflowBundleId", type: "string" }],
};

/** Legacy Alfred invocation input: everything comes from the environment. */
export class LoginAlfredInput {}

/** Standard input for external callers; the constructor validates every field. */
export class LoginStandardInput {
  readonly workflowBundleId: string;

  constructor(options: { workflowBundleId?: unknown } = {}) {
    this.workflowBundleId = standardRequiredString(options.workflowBundleId, "workflowBundleId");
  }

  static from(value: unknown): LoginStandardInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("Login standard input must be an object");
    }
    return new LoginStandardInput(value);
  }
}

export type LoginAppInput = LoginAlfredInput | LoginStandardInput;

/** Parses argv, activating the standard environment variables only when marked. */
export function parseLoginAppInput(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): LoginAppInput {
  const standard = resolveStandardInput(value, env, loginStandardSpec, () => false);
  if (standard !== undefined) return LoginStandardInput.from(standard);
  return new LoginAlfredInput();
}

export class LoginAppOutput extends SerializedValue {
  readonly kind = "login-result";

  constructor(
    readonly name: string,
    readonly user: FoloUser,
  ) {
    super();
  }

  toJSON(): Record<string, unknown> {
    return { kind: this.kind, name: this.name, user: this.user };
  }
}

/** Extracts the login token from the raw Folo CLI config file content. */
export function readToken(configText: string): string {
  const config = JSON.parse(configText) as unknown;

  if (!isRecord(config) || typeof config.token !== "string" || !config.token.trim()) {
    throw new Error("Folo config does not contain a token.");
  }

  return config.token;
}

/** Saves the token as the `FOLO_TOKEN` configuration of the running Alfred workflow. */
export function setWorkflowToken(
  token: string,
  environment: NodeJS.ProcessEnv = env,
  workflowBundleId?: string,
): void {
  if (!token.trim()) {
    throw new Error("Folo token must not be empty.");
  }
  const workflowId = workflowBundleId?.trim() || environment.alfred_workflow_bundleid?.trim();
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

/** Runs the Folo CLI login, persists its token, and prints the user profile. */
export async function login(input: LoginAppInput): Promise<LoginAppOutput> {
  const data = loginToFolo(new LoginBlockInput());

  const token = readToken(await readFile(data.configPath, "utf8"));
  setWorkflowToken(
    token,
    env,
    input instanceof LoginStandardInput ? input.workflowBundleId : undefined,
  );
  return new LoginAppOutput(data.user.name || data.user.handle || "Folo user", data.user);
}

async function main(): Promise<void> {
  try {
    const output = await login(parseLoginAppInput(process.argv.slice(2).join(" ")));
    process.stdout.write(output.serialize());
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  void main();
}
