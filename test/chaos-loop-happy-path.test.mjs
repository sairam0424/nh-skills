import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, finding, hexSha, labelsOf, runLoop } from "./support/chaos-loop-harness.mjs";

test("a clean run fixes one break, rejudges, then stops on plateau", async () => {
  const { result, calls, phases } = await runLoop({
    args: baseArgs(),
    plan: { "R1:boundaries": [finding(1)] },
  });

  assert.match(result.haltReason, /^plateau$/);
  assert.deepEqual(result.counts, { "fixed-agent-verified": 1 });
  assert.equal(result.baseSha, hexSha(1));
  assert.equal(result.commits.length, 1);
  assert.equal(result.commits[0].id, "R1-1");
  assert.equal(result.rounds.length, 2);
  assert.equal(result.rounds[0].rejudge.judgeExit, 0);
  assert.equal(result.rounds[1].rejudge, undefined);

  const fixed = result.findings[0];
  assert.equal(fixed.class, "fixed-agent-verified");
  assert.equal(fixed.regressionTest, "test/regress-R1-1.test.js");
  assert.equal(fixed.attempts, 1);

  assert.deepEqual(labelsOf(calls), [
    "isolation",
    "baseline",
    "break:R1:boundaries",
    "break:R1:state-order",
    "break:R1:error-paths",
    "break:R1:contract",
    "break:R1:faults",
    "confirm:R1-1",
    "fix:R1-1:a1",
    "verify:R1-1:a1:t1",
    "commit:R1-1",
    "rejudge:R1",
    "break:R2:boundaries",
    "break:R2:state-order",
    "break:R2:error-paths",
    "break:R2:contract",
    "break:R2:faults",
  ]);
  assert.deepEqual(phases.slice(0, 5), ["Baseline", "Break", "Confirm", "Fix", "Rejudge"]);
});

test("the result always tells the main session to re-run the judge itself", async () => {
  const { result } = await runLoop({ args: baseArgs() });
  assert.match(result.nextStep, /Re-run the judge yourself/);
  assert.match(result.nextStep, /not that it is proven/);
});

test("args may arrive as a JSON string", async () => {
  const { result } = await runLoop({ args: JSON.stringify(baseArgs()) });
  assert.equal(result.haltReason, "plateau");
  assert.equal(result.workdir, "/w/repo");
});

test("a run with no breaks at all is a plateau after one dry round", async () => {
  const { result, calls } = await runLoop({ args: baseArgs() });
  assert.equal(result.haltReason, "plateau");
  assert.deepEqual(result.counts, {});
  assert.equal(result.rounds.length, 1);
  assert.equal(calls.filter((c) => c.label.startsWith("confirm:")).length, 0);
});
