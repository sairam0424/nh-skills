import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, finding, labelsOf, runLoop } from "./support/chaos-loop-harness.mjs";

const SAFE = /\(the worktree may hold uncommitted changes/;

// Run the loop with one agent's reply patched, and return the halt plus which agents ran.
async function withPatch(label, patch, args = baseArgs()) {
  const { result, calls } = await runLoop({
    args,
    plan: { "R1:boundaries": [finding(1)] },
    override: (call, world, dflt) =>
      call.label === label ? (typeof patch === "function" ? patch(dflt) : patch) : undefined,
  });
  return { result, labels: labelsOf(calls) };
}

test("isolation: a dead isolation agent stops everything before the judge runs", async () => {
  const { result, labels } = await withPatch("isolation", null);
  assert.equal(result.haltReason.split(" ")[0], "isolation-check-failed");
  assert.deepEqual(labels, ["isolation"]);
});

test("isolation: the primary checkout is refused and the judge never runs", async () => {
  const same = (d) => ({ ...d, gitDir: "/w/repo/.git", gitCommonDir: "/w/repo/.git" });
  const { result, labels } = await withPatch("isolation", same);
  assert.match(result.haltReason, /^not-an-isolated-worktree/);
  assert.match(result.haltReason, /the judge was not run/);
  assert.deepEqual(labels, ["isolation"]);
});

test("isolation: only a branch that starts with chaos/ is accepted", async () => {
  for (const branch of ["main", "develop", "chaos-x", "feature/chaos/x", "Chaos/x", "", "HEAD"]) {
    const { result, labels } = await withPatch("isolation", (d) => ({ ...d, branch }));
    assert.match(result.haltReason, /^not-an-isolated-worktree/, "branch " + JSON.stringify(branch));
    assert.ok(!labels.includes("baseline"), "baseline must not run on branch " + JSON.stringify(branch));
  }
  const { result } = await withPatch("isolation", (d) => ({ ...d, branch: "chaos/anything-goes" }));
  assert.doesNotMatch(result.haltReason, /^not-an-isolated-worktree/);
});

test("isolation: a dirty worktree at start is refused", async () => {
  const { result, labels } = await withPatch("isolation", (d) => ({ ...d, dirty: true }));
  assert.match(result.haltReason, /^workdir-not-clean-at-start/);
  assert.ok(!labels.includes("baseline"));
});

test("baseline: each unsafe starting condition halts with its own reason", async () => {
  const cases = [
    ["a dead baseline agent", null, /^baseline-agent-failed/],
    ["a head that is not a sha", (d) => ({ ...d, gitHead: "HEAD" }), /^baseline-head-not-a-commit-sha/],
    ["a 39 character sha", (d) => ({ ...d, gitHead: "a".repeat(39) }), /^baseline-head-not-a-commit-sha/],
    ["an upper case sha", (d) => ({ ...d, gitHead: "A".repeat(40) }), /^baseline-head-not-a-commit-sha/],
    ["a red judge", (d) => ({ ...d, judgeExit: 1 }), /^baseline-judge-red/],
    ["a judge exit of minus one", (d) => ({ ...d, judgeExit: -1 }), /^baseline-judge-red/],
    ["an unknown test count", (d) => ({ ...d, testCount: -1 }), /^baseline-test-count-unknown/],
    ["a zero test count", (d) => ({ ...d, testCount: 0 }), /^baseline-test-count-unknown/],
    ["an empty protected set", (d) => ({ ...d, manifestFiles: 0 }), /^no-protected-files-found/],
    ["a failing manifest self-check", (d) => ({ ...d, manifestCheckExit: 1 }), /^protected-manifest-self-check-failed/],
    ["a dirty tree after the judge", (d) => ({ ...d, dirty: true }), /^judge-run-left-the-worktree-dirty/],
  ];
  for (const [name, patch, pattern] of cases) {
    const { result, labels } = await withPatch("baseline", patch);
    assert.match(result.haltReason, pattern, name);
    assert.ok(
      !labels.some((l) => l.startsWith("break:")),
      name + ": no breaker may run on an unsafe baseline",
    );
  }
});

test("baseline: a red judge is reported before a bad test count", async () => {
  const { result } = await withPatch("baseline", (d) => ({ ...d, judgeExit: 1, testCount: -1 }));
  assert.match(result.haltReason, /^baseline-judge-red/);
});

test("baseline: a single test is enough", async () => {
  const { result } = await withPatch("baseline", (d) => ({ ...d, testCount: 1 }));
  assert.doesNotMatch(result.haltReason, /^baseline-test-count-unknown/);
});

test("halts after the loop started add the dirty-worktree warning, safe stops do not", async () => {
  const { result: early } = await withPatch("baseline", (d) => ({ ...d, judgeExit: 1 }));
  assert.match(early.haltReason, SAFE);
  const { result: clean } = await runLoop({ args: baseArgs() });
  assert.equal(clean.haltReason, "plateau");
  assert.doesNotMatch(clean.haltReason, SAFE);
});

test("verifier model: probed once when fixing is on, passed only to verifiers", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ verifierModel: "model-x" }),
    plan: { "R1:boundaries": [finding(1)] },
  });
  assert.equal(result.counts["fixed-agent-verified"], 1);
  const probes = calls.filter((c) => c.label === "probe-verifier-model");
  assert.equal(probes.length, 1);
  assert.equal(probes[0].model, "model-x");
  for (const c of calls.filter((c) => c.label.startsWith("verify:"))) assert.equal(c.model, "model-x");
  for (const c of calls.filter((c) => !/^(verify:|probe-)/.test(c.label)))
    assert.equal(c.model, undefined, c.label + " must use the session model");
});

test("verifier model: an unavailable model halts before any breaker runs", async () => {
  const { result, labels } = await withPatch("probe-verifier-model", null, baseArgs({ verifierModel: "model-x" }));
  assert.match(result.haltReason, /^verifier-model-unavailable: model-x/);
  assert.ok(!labels.some((l) => l.startsWith("break:")));
});

test("verifier model: lead-only mode never probes the model", async () => {
  const { labels } = await withPatch("baseline", undefined, baseArgs({ verifierModel: "model-x", fixEnabled: false }));
  assert.ok(!labels.includes("probe-verifier-model"));
});

test("budget: stops before a round when the token budget is nearly gone", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs(),
    budget: { total: 1_000_000, spent: () => 960_000, remaining: () => 40_000 },
  });
  assert.equal(result.haltReason, "budget");
  assert.ok(!calls.some((c) => c.label.startsWith("break:")));
});

test("budget: no budget target means no budget stop", async () => {
  const { result } = await runLoop({
    args: baseArgs(),
    budget: { total: null, spent: () => 0, remaining: () => 0 },
  });
  assert.equal(result.haltReason, "plateau");
});
