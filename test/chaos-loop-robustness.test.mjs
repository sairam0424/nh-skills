import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, callsFor, finding, hexSha, runLoop } from "./support/chaos-loop-harness.mjs";

// Behaviour the loop must have when agents die, lie or exceed their remit.
// These cases were found by the harness itself: each one failed against the first version of the script.

const ONE = { "R1:boundaries": [finding(1)] };
const TWO = { "R1:boundaries": [finding(1), finding(2)] };
const patchWhen = (pattern, patch) => (call, world, dflt) =>
  pattern.test(call.label) ? (typeof patch === "function" ? patch(dflt, call, world) : patch) : undefined;

// ---------- a silent or dead agent is never a clean bill of health ----------
test("when every breaker dies the run does not claim a plateau", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs(),
    override: patchWhen(/^break:/, null),
  });
  assert.notEqual(result.haltReason, "plateau", "no breaker answered, so nothing was tested");
  assert.match(result.haltReason, /^breakers-unavailable/);
  assert.equal(callsFor(calls, "break:R2:").length, 0, "stop at once, do not burn more rounds on a dead runtime");
});

test("a round where some lenses never answered is not counted as dry", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 2 }),
    override: patchWhen(/^break:R\d:contract$/, null),
  });
  assert.notEqual(result.haltReason, "plateau");
  assert.equal(result.haltReason, "max-rounds");
  assert.equal(result.rounds[0].lensesAsked, 4);
  assert.equal(result.rounds[0].lensesAnswered, 3);
});

test("a full round of answers with nothing found is still a plateau, with coverage recorded", async () => {
  const { result } = await runLoop({ args: baseArgs() });
  assert.equal(result.haltReason, "plateau");
  assert.equal(result.rounds[0].lensesAsked, 4);
  assert.equal(result.rounds[0].lensesAnswered, 4);
});

test("a candidate whose confirmer died is kept as a lead, not silently dropped", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: TWO,
    override: patchWhen(/^confirm:R1-1$/, null),
  });
  const lost = result.findings.find((f) => f.id === "R1-1");
  assert.ok(lost, "R1-1 must still appear in the result");
  assert.equal(lost.class, "lead");
  assert.match(lost.confirmNote, /confirmer returned nothing/);
});

test("a round whose only candidates lost their confirmers is not dry", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: ONE,
    override: patchWhen(/^confirm:/, null),
  });
  assert.notEqual(result.haltReason, "plateau");
  assert.equal(result.haltReason, "max-rounds");
});

// ---------- halts keep the evidence gathered so far ----------
test("a halt during confirmation still reports the breaks that were confirmed", async () => {
  const { result } = await runLoop({
    args: baseArgs(),
    plan: TWO,
    override: patchWhen(/^confirm:R1-2$/, (d) => ({ ...d, workdirDirty: true })),
  });
  assert.match(result.haltReason, /^reproducer-dirtied-the-worktree: R1-2/);
  const first = result.findings.find((f) => f.id === "R1-1");
  assert.ok(first, "the confirmed break must not vanish with the halt");
  assert.equal(first.class, "confirmed-unfixed");
  assert.match(first.note, /halted before/);
});

test("a head that moved during confirm also keeps the evidence", async () => {
  const { result } = await runLoop({
    args: baseArgs(),
    plan: ONE,
    override: patchWhen(/^confirm:/, (d) => ({ ...d, headSha: hexSha(999) })),
  });
  assert.match(result.haltReason, /^head-moved-during-break-or-confirm/);
  assert.equal(result.findings.length, 1);
});

test("an agent that throws mid-run ends in a halt that keeps the commits made so far", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: TWO,
    override: (call, world, dflt) => {
      if (call.label === "fix:R1-2:a1") throw new Error("token budget exhausted");
      return undefined;
    },
  });
  assert.match(result.haltReason, /^agent-error: token budget exhausted \(while fixing R1-2\)/);
  assert.equal(result.commits.length, 1, "the first fix was committed before the failure");
  assert.match(result.haltReason, /uncommitted changes/);
});

// ---------- the fixer cannot choose what counts as its regression test ----------
test("the regression test must be among the files the fixer changed", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ maxFixAttempts: 1, maxRounds: 1 }),
    plan: ONE,
    override: patchWhen(/^fix:/, (d) => ({ ...d, changedFiles: ["src/only-source.js"] })),
  });
  assert.equal(result.findings[0].class, "confirmed-unfixed");
  assert.match(result.findings[0].rejections[0].join(" "), /regression test.*changed files/);
  assert.equal(callsFor(calls, "verify:").length, 0);
});

const NOT_TESTS = [
  ".github/workflows/ci.yml",
  ".husky/pre-commit",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "jest.config.js",
  "vitest.config.ts",
  "tsconfig.json",
  "Makefile",
  "src/handler.js",
  "scripts/run.sh",
  "README.md",
  "test/jest.config.js",
  "tests/conftest.py",
  "test/fixtures/data.json",
  ".github/test/ci.test.js",
  "tests/.hidden.test.js",
];

test("a regression test path outside the test locations is refused, even though the protected check would allow it", async () => {
  for (const path of NOT_TESTS) {
    const { result, calls } = await runLoop({
      args: baseArgs({ maxFixAttempts: 1, maxRounds: 1 }),
      plan: ONE,
      override: patchWhen(/^fix:/, (d) => ({ ...d, changedFiles: ["src/fix.js", path], regressionTestPath: path })),
    });
    assert.equal(result.findings[0].class, "confirmed-unfixed", path);
    assert.match(result.findings[0].rejections[0].join(" "), /not safe relative paths|not a recognised test file/, path);
    assert.equal(callsFor(calls, "verify:").length, 0, path + ": the verifier must never be asked to allow it");
  }
});

const REAL_TESTS = [
  "test/a.test.js",
  "tests/test_x.py",
  "src/foo_test.go",
  "__tests__/a.js",
  "spec/a_spec.rb",
  "src/test/java/com/x/AppTest.java",
  "tests/integration.rs",
  "lib/thing.spec.ts",
  "test/a.bats",
];

test("ordinary test file layouts for common languages are accepted", async () => {
  for (const path of REAL_TESTS) {
    const { result } = await runLoop({
      args: baseArgs({ maxFixAttempts: 1, maxRounds: 1 }),
      plan: ONE,
      override: patchWhen(/^fix:/, (d) => ({ ...d, changedFiles: ["src/fix.js", path], regressionTestPath: path })),
    });
    assert.equal(result.findings[0].class, "fixed-agent-verified", path);
  }
});

test("a project with an unusual test layout can say what a test file looks like", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxFixAttempts: 1, maxRounds: 1, regressionTestPattern: "^checks/.*\\.sh$" }),
    plan: ONE,
    override: patchWhen(/^fix:/, (d) => ({ ...d, changedFiles: ["src/fix.js", "checks/zero.sh"], regressionTestPath: "checks/zero.sh" })),
  });
  assert.equal(result.findings[0].class, "fixed-agent-verified");
});

test("a regression test path that an earlier fix already used is refused", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxFixAttempts: 1, maxRounds: 1 }),
    plan: TWO,
    override: patchWhen(/^fix:R1-2/, (d) => ({
      ...d,
      changedFiles: ["src/fix-2.js", "test/regress-R1-1.test.js"],
      regressionTestPath: "test/regress-R1-1.test.js",
    })),
  });
  const second = result.findings.find((f) => f.id === "R1-2");
  assert.equal(second.class, "confirmed-unfixed");
  assert.match(second.rejections[0].join(" "), /already used/);
});

// ---------- tests added by earlier fixes are protected too ----------
// One exact command per earlier fix: the test file must equal its content in the commit that added it.
const pairLine = (sha, path) =>
  "   git -C '/w/repo' diff --no-renames --name-only --diff-filter=MDT " + sha + " -- '" + path + "'";
const hasLine = (prompt, line) => prompt.split("\n").includes(line);

test("later verifiers must see that earlier regression tests are unchanged since their own commits", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: TWO });
  const second = calls.find((c) => c.label === "verify:R1-2:a1:t1").prompt;
  assert.ok(hasLine(second, pairLine(hexSha(100), "test/regress-R1-1.test.js")), second);
  const first = calls.find((c) => c.label === "verify:R1-1:a1:t1").prompt;
  assert.ok(!first.split("\n").some((l) => l.startsWith("   git -C ")), "nothing to compare before the first commit");
});

test("the rejudge checks every loop-made regression test against the commit that added it", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: TWO });
  const rejudge = calls.find((c) => c.label === "rejudge:R1").prompt;
  assert.ok(hasLine(rejudge, pairLine(hexSha(100), "test/regress-R1-1.test.js")), rejudge);
  assert.ok(hasLine(rejudge, pairLine(hexSha(101), "test/regress-R1-2.test.js")), rejudge);
  assert.match(rejudge, /if any prints a name, protectedExit is 4/);
});

test("the result lists the regression test that came with each commit", async () => {
  const { result } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: TWO });
  assert.deepEqual(
    result.commits.map((c) => [c.id, c.sha, c.test]),
    [
      ["R1-1", hexSha(100), "test/regress-R1-1.test.js"],
      ["R1-2", hexSha(101), "test/regress-R1-2.test.js"],
    ],
  );
});
