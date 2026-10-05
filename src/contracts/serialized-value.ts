import { isRecord } from "../shared/guards.js";

export abstract class SerializedValue {
  serialize(): string {
    return JSON.stringify(this);
  }
}

export function parseRecord(value: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new TypeError(`${name} must be valid JSON`);
  }
  if (!isRecord(parsed)) throw new TypeError(`${name} must be a JSON object`);
  return parsed;
}
