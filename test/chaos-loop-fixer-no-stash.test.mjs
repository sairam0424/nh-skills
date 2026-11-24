import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

const finding = (n) => ({ title: "t" + n, file: "src/a.js", line: n, claim: "c" + n, severity: "medium" });

// Dogfood 2026-11-24 (nh-chaos-monkey on its own sandbox probe): both fixers ran git stash to prove their new test
// fails on the old code, which left stray entries in the stash that the worktree shares with the user's checkout.
test("the fixer prompt shows how to see a test fail on the old code without touching the stash or the refs", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  const fixer = calls.find((c) => c.label === "fix:R1-1:a1").prompt;
  assert.match(fixer, /export HEAD with git archive into a new directory under '\/w\/scratch'/);
  assert.match(fixer, /never use git stash, or any other command that rewrites the tree, the index or the refs, to undo your own change in '\/w\/repo'/);
  assert.match(fixer, /the stash and the refs are shared with the user's checkout/);
});

test("the earlier rules of the fixer prompt are still there", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  const fixer = calls.find((c) => c.label === "fix:R1-1:a1").prompt;
  assert.match(fixer, /It must fail on the code as it is now, pass after your change, and be runnable on its own/);
  assert.match(fixer, /Do not commit; leave the changes in the working tree/);
});
