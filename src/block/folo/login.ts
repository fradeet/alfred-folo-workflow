import { FoloLoginResult } from "../../types/folo-types.js";
import { runFolo } from "./client.js";

export class LoginBlockInput {
  constructor(readonly timeout = 190_000) {
    if (!Number.isInteger(timeout) || timeout <= 0) {
      throw new TypeError("Login timeout must be a positive integer");
    }
  }
}

export function loginToFolo(input: LoginBlockInput): FoloLoginResult {
  return runFolo(["login"], { timeout: input.timeout }, FoloLoginResult.from);
}
