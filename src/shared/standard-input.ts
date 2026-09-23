/**
 * Shared "standard input" protocol for app entry points called by Alfred.
 *
 * Standard input is the public calling convention for external callers: one
 * JSON object passed as the complete argv argument (marked by `kind:
 * "standard"` or `isStandardInput: 1`), or the app's `frr<AppId>…` environment
 * variables, or both. It does not replace the workflow's internal contracts,
 * which keep their existing parsing path and never merge these variables.
 *
 * This module knows nothing about individual apps. Each app declares a
 * {@link StandardInputSpec} with hardcoded environment variable names; the
 * module decides whether a call is standard input, merges field sources, and
 * returns one `unknown` record for the app's input class to validate.
 */
export const STANDARD_INPUT_VERSION = 1;

/** Value kinds an environment variable is converted into for a field. */
export type StandardInputFieldType = "string" | "boolean" | "integer";

/** One standard input field: its JSON name, hardcoded variables, and type. */
export interface StandardInputFieldSpec {
  /** JSON field name, such as `entryId`. */
  readonly field: string;
  /** Hardcoded app environment variable, such as `frrMarkReadEntryId`. */
  readonly env: string;
  readonly type: StandardInputFieldType;
  /** Hardcoded global configuration fallback, such as `FRR_TIMELINE_LIMIT`. */
  readonly global?: string;
}

/** Everything the shared parser needs to know about one app's standard input. */
export interface StandardInputSpec {
  /** Stable app ID used for documentation, such as `mark-read`. */
  readonly appId: string;
  /** App marker variable that must equal `standard` to opt in from the environment. */
  readonly kindEnv: string;
  /** App marker variable that must equal `1` to opt in from the environment. */
  readonly isStandardEnv: string;
  readonly fields: readonly StandardInputFieldSpec[];
}

/** Error raised for invalid standard input markers, versions, fields, or values. */
export class StandardInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandardInputError";
  }
}

/**
 * Decides whether an invocation uses the app's standard input and, when it
 * does, merges the argv JSON object, the app's standard environment variables,
 * and the linked global configuration into one record of `unknown` values.
 *
 * Returns `undefined` when the app must keep its existing input behavior; in
 * that case no standard business variable is read. `isKnownContract` reports
 * whether a parsed argv JSON object matches one of the app's existing
 * workflow contracts; such an object carrying standard markers is a conflict.
 */
export function resolveStandardInput(
  argvText: string,
  env: NodeJS.ProcessEnv,
  spec: StandardInputSpec,
  isKnownContract: (data: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  const argvData = parseArgvObject(argvText);

  if (argvText.trim() !== "") {
    if (argvData === undefined || !argvMarked(argvData)) return undefined;
    if (isKnownContract(argvData)) {
      throw new StandardInputError(
        "argv matches a known workflow contract and carries standard input markers; pass either the contract or a standard input, not both",
      );
    }
    checkArgvMarkers(argvData);
    return mergeStandardValues(argvData, env, spec);
  }

  const kindMarker = env[spec.kindEnv];
  const isMarker = env[spec.isStandardEnv];
  if (kindMarker === undefined && isMarker === undefined) return undefined;
  if (kindMarker !== undefined && kindMarker !== "standard") {
    throw new StandardInputError(`${spec.kindEnv} must be exactly "standard" when standard input is enabled`);
  }
  if (isMarker !== undefined && isMarker !== "1") {
    throw new StandardInputError(`${spec.isStandardEnv} must be exactly "1" when standard input is enabled`);
  }
  return mergeStandardValues({}, env, spec);
}

/** Parses argv into a JSON object, or returns `undefined` for anything else. */
function parseArgvObject(argvText: string): Record<string, unknown> | undefined {
  if (!argvText.trim().startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(argvText) as unknown;
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

/**
 * Reports standard input intent in argv without judging marker values: either
 * `kind` is `standard`, or `isStandardInput` is present at all (its value is
 * validated by {@link checkArgvMarkers} so typos fail loudly). Any other
 * `kind` belongs to another contract and is none of this protocol's business.
 */
function argvMarked(data: Record<string, unknown>): boolean {
  return data.kind === "standard" || "isStandardInput" in data;
}

/** Validates marker consistency inside a marked argv JSON object. */
function checkArgvMarkers(data: Record<string, unknown>): void {
  if ("isStandardInput" in data && data.isStandardInput !== 1) {
    throw new StandardInputError("isStandardInput must be the number 1");
  }
  if ("kind" in data && data.kind !== "standard") {
    throw new StandardInputError('kind must be "standard" when isStandardInput is present');
  }
}

/**
 * Merges one value per field by source priority: argv, the app's standard
 * environment variable, then the linked global configuration. Presence, not
 * truthiness, decides precedence, so `false`, `0`, `""`, and `null` from argv
 * are kept and lower-priority values are neither read nor validated.
 */
function mergeStandardValues(
  argvData: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  spec: StandardInputSpec,
): Record<string, unknown> {
  if ("version" in argvData) {
    const version = argvData.version;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      throw new StandardInputError("version must be a positive integer");
    }
    if (version !== STANDARD_INPUT_VERSION) {
      throw new StandardInputError(
        `Unsupported standard input version ${version}; this build supports version ${STANDARD_INPUT_VERSION}`,
      );
    }
  }
  const knownFields = new Set(["kind", "isStandardInput", "version", ...spec.fields.map((field) => field.field)]);
  for (const key of Object.keys(argvData)) {
    if (!knownFields.has(key)) {
      throw new StandardInputError(`Unknown standard input field "${key}"`);
    }
  }

  const values: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (field.field in argvData) {
      values[field.field] = argvData[field.field];
      continue;
    }
    const envRaw = env[field.env];
    if (envRaw !== undefined) {
      values[field.field] = convertEnvironmentValue(field.env, field.type, envRaw);
    } else if (field.global !== undefined) {
      const globalRaw = env[field.global];
      if (globalRaw !== undefined) {
        values[field.field] = convertEnvironmentValue(field.global, field.type, globalRaw);
      }
    }
  }
  return values;
}

/** Converts one environment string, named by its source, into the declared type. */
function convertEnvironmentValue(source: string, type: StandardInputFieldType, raw: string): unknown {
  switch (type) {
    case "string":
      return raw;
    case "boolean":
      if (raw === "1" || raw === "true") return true;
      if (raw === "0" || raw === "false") return false;
      throw new StandardInputError(`${source} must be 1, 0, true, or false`);
    case "integer":
      if (!/^\d+$/.test(raw)) {
        throw new StandardInputError(`${source} must be a non-negative integer`);
      }
      return Number(raw);
  }
}

/**
 * The validators below are shared by the apps' standard input classes so
 * every class applies the same rules to values that survived the merge:
 * `null` counts as an explicit "no value" and falls back, any other wrong
 * type is an error, and validity beyond the type is the class's decision.
 */

/** Validates a required non-empty string field. */
export function standardRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Standard input field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

/** Validates an optional string field that defaults when absent or null. */
export function standardString(value: unknown, field: string, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") {
    throw new TypeError(`Standard input field "${field}" must be a string`);
  }
  return value.trim();
}

/** Validates a string field that stays unset when absent, null, or blank. */
export function standardOptionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new TypeError(`Standard input field "${field}" must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Validates a boolean field that defaults when absent or null. */
export function standardBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new TypeError(`Standard input field "${field}" must be a boolean`);
  }
  return value;
}

/** Validates a positive integer field that defaults when absent or null. */
export function standardPositiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`Standard input field "${field}" must be a positive integer`);
  }
  return value;
}
