import assert from "node:assert/strict";
import test from "node:test";
import { mapWithConcurrency } from "../src/shared/concurrency.js";

test("mapWithConcurrency keeps results in input order and bounds in-flight calls", async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await mapWithConcurrency([30, 20, 10, 40, 0], 2, async (delay) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delay));
    inFlight -= 1;
    return delay * 2;
  });

  assert.deepEqual(results, [60, 40, 20, 80, 0]);
  assert.equal(peak, 2);
});

test("mapWithConcurrency resolves empty output for empty input", async () => {
  assert.deepEqual(await mapWithConcurrency([], 6, async (value: number) => value), []);
});
