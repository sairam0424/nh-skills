import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, callsFor, finding, hexSha, labelsOf, runLoop } from "./support/chaos-loop-harness.mjs";

const ONE = { "R1:boundaries": [finding(1)] };
const TWO = { "R1:boundaries": [finding(1), finding(2)] };

// Patch the reply of every agent whose label matches.
const patchWhen = (pattern, patch) => (call, world, dflt) =>
  pattern.test(call.label) ? (typeof patch === "function" ? patch(dflt, call, world) : patch) : undefined;

const run = (over = {}) =>
  runLoop({ args: baseArgs({ maxRounds: 1, ...(over.args || {}) }), plan: over.plan || ONE, override: over.override });

// ---------- the verifier's checklist: each failed check rejects the attempt ----------
const VERIFY_FAILURES = [
  ["a protected file changed", { protectedExit: 1 }, /protected file changed or vanished/],
  ["the reproducer still fails", { reproExit: 1 }, /reproducer still fails/],
  ["the reproducer file changed", { reproSha: "f".repeat(64) }, /reproducer file was modified/],
  ["the judge is red", { judgeExit: 1 }, /judge fails after the change/],
  ["the test count did not rise", { testCount: 10 }, /test count did not rise/],
  ["the test count fell", { testCount: 9 }, /test count did not rise/],
  ["the regression test passes without the fix", { armExit: 0 }, /did not fail on the pre-fix code/],
  ["the regression test could not run in isolation", { armExit: -1 }, /did not fail on the pre-fix code/],
  ["protected paths were touched", { protectedTouched: ["package.json"] }, /protected paths touched/],
  ["tests were weakened", { testsWeakened: true }, /skipped or loosened/],
  ["expected values were special-cased", { specialCased: true }, /hardcoded|special-cased/],
  ["the symptom was patched, not the cause", { rootCause: false }, /symptom, not the root cause/],
];

test("every failed verifier check rejects the fix and nothing is committed", async () => {
  for (const [name, patch, reason] of VERIFY_FAILURES) {
    const { result, calls } = await run({
      args: { maxFixAttempts: 1 },
      override: patchWhen(/^verify:/, (d) => ({ ...d, ...patch })),
    });
    const record = result.findings[0];
    assert.equal(record.class, "confirmed-unfixed", name);
    assert.match(record.rejections[0].join(" | "), reason, name);
    assert.equal(callsFor(calls, "commit:").length, 0, name + ": must not commit");
    assert.equal(result.commits.length, 0, name);
    assert.equal(callsFor(calls, "rejudge:").length, 0, name + ": no commit means no rejudge");
    assert.equal(callsFor(calls, "reset:").length, 1, name + ": the attempt is stashed");
  }
});

test("all failed checks are reported together, not just the first", async () => {
  const { result } = await run({
    args: { maxFixAttempts: 1 },
    override: patchWhen(/^verify:/, (d) => ({ ...d, judgeExit: 1, armExit: 0, rootCause: false })),
  });
  const reasons = result.findings[0].rejections[0];
  assert.equal(reasons.length, 3);
});

test("a rejected first attempt is retried and the retry sees why it was rejected", async () => {
  const { result, calls } = await run({
    override: patchWhen(/^verify:R1-1:a1:/, (d) => ({ ...d, armExit: 0 })),
  });
  const record = result.findings[0];
  assert.equal(record.class, "fixed-agent-verified");
  assert.equal(record.attempts, 2);
  const second = calls.find((c) => c.label === "fix:R1-1:a2").prompt;
  assert.match(second, /BEGIN EARLIER-REJECTIONS/);
  assert.match(second, /did not fail on the pre-fix code/);
  assert.match(second, /approach must differ/);
  assert.doesNotMatch(calls.find((c) => c.label === "fix:R1-1:a1").prompt, /EARLIER-REJECTIONS/);
  assert.deepEqual(
    labelsOf(calls).filter((l) => /^(fix|verify|reset|commit):/.test(l)),
    ["fix:R1-1:a1", "verify:R1-1:a1:t1", "reset:R1-1:a1", "fix:R1-1:a2", "verify:R1-1:a2:t1", "commit:R1-1"],
  );
});

test("when every attempt is rejected the break stays confirmed-unfixed and the loop moves on", async () => {
  const { result, calls } = await run({
    args: { maxFixAttempts: 3 },
    plan: TWO,
    override: patchWhen(/^verify:R1-1:/, (d) => ({ ...d, judgeExit: 1 })),
  });
  const [first, second] = ["R1-1", "R1-2"].map((id) => result.findings.find((f) => f.id === id));
  assert.equal(first.class, "confirmed-unfixed");
  assert.equal(first.attempts, 3);
  assert.equal(first.rejections.length, 3);
  assert.equal(second.class, "fixed-agent-verified");
  assert.equal(callsFor(calls, "fix:R1-1:").length, 3);
  assert.equal(result.haltReason, "max-rounds");
});

test("a dead fixer counts as a rejected attempt", async () => {
  const { result } = await run({
    args: { maxFixAttempts: 2 },
    override: patchWhen(/^fix:R1-1:a1$/, null),
  });
  assert.equal(result.findings[0].class, "fixed-agent-verified");
  assert.equal(result.findings[0].attempts, 2);
});

test("unsafe changed-file lists are rejected before any verifier runs", async () => {
  const unsafe = [
    ["an empty list", () => ({ changedFiles: [] })],
    ["a parent directory", (d) => ({ changedFiles: ["../outside.js", d.regressionTestPath] })],
    ["an absolute path", (d) => ({ changedFiles: ["/etc/hosts", d.regressionTestPath] })],
    ["a path inside .git", (d) => ({ changedFiles: [".git/hooks/pre-commit", d.regressionTestPath] })],
    ["a path inside .husky", (d) => ({ changedFiles: [".husky/pre-commit", d.regressionTestPath] })],
    ["a path with a space", (d) => ({ changedFiles: ["src/a b.js", d.regressionTestPath] })],
    ["a dash first path", (d) => ({ changedFiles: ["-rf", d.regressionTestPath] })],
    ["an unsafe regression test path", () => ({ regressionTestPath: "../t.test.js" })],
  ];
  for (const [name, patch] of unsafe) {
    const { result, calls } = await run({
      args: { maxFixAttempts: 1 },
      override: patchWhen(/^fix:/, (d) => ({ ...d, ...patch(d) })),
    });
    assert.equal(result.findings[0].class, "confirmed-unfixed", name);
    assert.match(result.findings[0].rejections[0][0], /not safe relative paths/, name);
    assert.equal(callsFor(calls, "verify:").length, 0, name + ": the verifier must not see unsafe paths");
    assert.equal(callsFor(calls, "commit:").length, 0, name);
  }
});

test("a verifier that fails once is retried once, with a distinct label", async () => {
  let first = true;
  const { result, calls } = await run({
    override: patchWhen(/^verify:/, (d) => {
      if (first) {
        first = false;
        return null;
      }
      return d;
    }),
  });
  assert.equal(result.findings[0].class, "fixed-agent-verified");
  assert.deepEqual(callsFor(calls, "verify:").map((c) => c.label), ["verify:R1-1:a1:t1", "verify:R1-1:a1:t2"]);
});

test("a verifier that fails twice stops the run and stashes the attempt", async () => {
  const { result, calls } = await run({ override: patchWhen(/^verify:/, null), plan: TWO });
  assert.match(result.haltReason, /^verifier-unavailable:R1-1/);
  assert.equal(result.findings.find((f) => f.id === "R1-1").class, "confirmed-unfixed");
  assert.equal(callsFor(calls, "fix:R1-2").length, 0, "no second fix after the verifier died");
  assert.equal(callsFor(calls, "reset:").length, 1);
});

test("a verifier outage plus a failed stash says the worktree is dirty", async () => {
  const { result } = await run({
    override: (call, world, dflt) =>
      /^verify:/.test(call.label) ? null : /^reset:/.test(call.label) ? { ...dflt, clean: false } : undefined,
  });
  assert.match(result.haltReason, /^verifier-unavailable-and-worktree-dirty:R1-1/);
});

test("a stash that leaves the worktree dirty stops the run", async () => {
  for (const reset of [null, (d) => ({ ...d, clean: false })]) {
    const { result, calls } = await run({
      plan: TWO,
      override: (call, world, dflt) => {
        if (/^verify:/.test(call.label)) return { ...dflt, judgeExit: 1 };
        if (/^reset:/.test(call.label)) return typeof reset === "function" ? reset(dflt) : reset;
        return undefined;
      },
    });
    assert.match(result.haltReason, /^worktree-not-clean-after-rejected-attempt:R1-1/);
    assert.equal(callsFor(calls, "fix:R1-2").length, 0);
  }
});

test("a commit that fails stops the run", async () => {
  const bad = [
    ["no reply", null],
    ["a dirty tree after the commit", (d) => ({ ...d, clean: false })],
    ["a sha that is not a sha", (d) => ({ ...d, sha: "HEAD" })],
    ["a short sha", (d) => ({ ...d, sha: "abc123" })],
  ];
  for (const [name, patch] of bad) {
    const { result, calls } = await run({ override: patchWhen(/^commit:/, patch) });
    assert.match(result.haltReason, /^commit-failed:R1-1/, name);
    assert.equal(result.commits.length, 0, name);
    assert.equal(callsFor(calls, "rejudge:").length, 0, name);
  }
});

test("later fixes build on the head and test count left by earlier commits", async () => {
  const { result, calls } = await run({ plan: TWO });
  assert.deepEqual(result.commits.map((c) => c.sha), [hexSha(100), hexSha(101)]);
  const second = calls.find((c) => c.label === "verify:R1-2:a1:t1").prompt;
  assert.ok(second.includes(hexSha(100)), "the verifier must branch from the first commit");
  assert.match(second, /The count before this fix was 11/);
  assert.ok(second.includes("test/regress-R1-1.test.js"), "the first regression test is an allowed addition");
  assert.ok(second.includes("test/regress-R1-2.test.js"));
  const first = calls.find((c) => c.label === "verify:R1-1:a1:t1").prompt;
  assert.match(first, /The count before this fix was 10/);
  assert.doesNotMatch(first, /regress-R1-2/);
  const rejudge = calls.find((c) => c.label === "rejudge:R1");
  assert.equal(callsFor(calls, "rejudge:").length, 1, "one rejudge per round that committed");
  assert.ok(rejudge.prompt.includes(hexSha(1)), "the rejudge compares against the baseline head");
});

// ---------- independent rejudge ----------
const REJUDGE_FAILURES = [
  ["no reply", null],
  ["a red judge", (d) => ({ ...d, judgeExit: 1 })],
  ["a protected file changed", (d) => ({ ...d, protectedExit: 2 })],
  ["a dirty tree", (d) => ({ ...d, clean: false })],
  ["a different test count than the verifier claimed", (d) => ({ ...d, testCount: d.testCount + 5 })],
  ["a different head than the last commit", (d) => ({ ...d, headSha: hexSha(777) })],
];

test("the independent rejudge halts the run when it disagrees with the verifier", async () => {
  for (const [name, patch] of REJUDGE_FAILURES) {
    const { result } = await run({ override: patchWhen(/^rejudge:/, patch) });
    assert.match(result.haltReason, /^independent-rejudge-disagrees-with-verifier-claims/, name);
    assert.equal(result.findings[0].class, "fixed-agent-verified", name + ": the record is kept but flagged by the halt");
  }
});

test("a plateau only ends the run after the round's commits were rejudged", async () => {
  const { result, calls } = await runLoop({ args: baseArgs(), plan: ONE });
  assert.equal(result.haltReason, "plateau");
  const labels = labelsOf(calls);
  assert.ok(labels.indexOf("rejudge:R1") < labels.indexOf("break:R2:boundaries"));
});
