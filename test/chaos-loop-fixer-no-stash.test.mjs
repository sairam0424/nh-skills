import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

const finding = (n) => ({ title: "t" + n, file: "src/a.js", line: n, claim: "c" + n, severity: "medium" });
const fixerPrompt = async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  return calls.find((c) => c.label === "fix:R1-1:a1").prompt;
};

// Dogfood 2026-11-24 (nh-chaos-monkey on its own sandbox probe): both fixers ran git stash to prove their new test
// fails on the old code, which left stray entries in the stash that the worktree shares with the user's checkout.
// In a second real-project run a fixer added its test to an existing protected test file and the re-judge halted.
test("the fixer prompt shows how to see a test fail on the old code without touching the stash, the refs or the worktree", async () => {
  const fixer = await fixerPrompt();
  assert.match(fixer, /export HEAD with git archive into a new directory under '\/w\/scratch'/);
  assert.match(fixer, /the one place besides '\/w\/repo' where you may create files/);
  assert.match(fixer, /link the ones the test needs into it/);
  assert.match(fixer, /Do not undo your own change in '\/w\/repo' to see the test fail/);
  assert.match(fixer, /never use git stash or any other command that changes the stash, the refs or the index/);
  assert.match(fixer, /those are shared with the user's checkout/);
});

test("the fixer prompt prefers a new test file over a change to a protected one", async () => {
  const fixer = await fixerPrompt();
  assert.match(fixer, /Prefer a NEW test file over adding to an existing one/);
  assert.match(fixer, /a modified existing test file that is protected \(every test directory is, by default\) voids the fix/);
});

test("the earlier rules of the fixer prompt are still there", async () => {
  const fixer = await fixerPrompt();
  assert.match(fixer, /It must fail on the code as it is now, pass after your change, and be runnable on its own/);
  assert.match(fixer, /Do not commit; leave the changes in the working tree/);
});
