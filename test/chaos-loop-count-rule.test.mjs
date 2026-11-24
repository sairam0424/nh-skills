import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

const finding = (n) => ({ title: "t" + n, file: "src/a.js", line: n, claim: "c" + n, severity: "medium" });

// Dogfood 2026-11-25 (tracehub-mcp second pass): the verifier read "2038 passed, 2 skipped" as 2040, the
// independent re-judge read it as 2038, and a correct fix ended in independent-rejudge-disagrees-with-verifier-claims.
// The counts are compared with ===, so every agent that reads one must apply the same rule.
test("the baseline, verifier and re-judge prompts carry one passed-only counting rule", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  for (const label of ["baseline", "verify:R1-1:a1:t1", "rejudge:R1"]) {
    const prompt = calls.find((c) => c.label === label).prompt;
    assert.match(prompt, /Count passed tests only/, label);
    assert.match(prompt, /'2038 passed, 2 skipped' is 2038/, label);
    assert.match(prompt, /a Node summary is its pass line, not its tests total/, label);
    assert.match(prompt, /read every count the same way/, label);
  }
});

test("the baseline asks for passed tests, not tests that ran", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: {} });
  const baseline = calls.find((c) => c.label === "baseline").prompt;
  assert.match(baseline, /Report the number of tests that passed/);
  assert.doesNotMatch(baseline, /number of tests it ran/);
});

test("the rule comes with testCountHint, not instead of it", async () => {
  const { calls } = await runLoop({
    args: baseArgs({ maxRounds: 1, testCountHint: "use the tap summary" }),
    plan: { "R1:boundaries": [finding(1)] },
  });
  const rejudge = calls.find((c) => c.label === "rejudge:R1").prompt;
  assert.match(rejudge, /Count passed tests only[\s\S]*How to count: use the tap summary/);
});
