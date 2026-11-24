import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, candidate, runLoop } from "./support/chaos-loop-harness.mjs";

for (const c of [
  { workdir: "/w/repo/", scratch: "/w/repo/tmp" },
  { workdir: "/w/repo/sub", scratch: "/w/repo/" },
  { workdir: "/w/repo/", scratch: "/w/repo/" },
  { workdir: "/w/", scratch: "/w/repo" },
  { workdir: "/w/repo/", scratch: "/w/" },
]) {
  test(`nested dirs written with a trailing slash are refused: ${c.workdir} ${c.scratch}`, async () => {
    await assert.rejects(runLoop({ args: baseArgs(c) }), /must be separate directories/);
  });
}

test("separate directories are not refused by the nesting check, with or without a trailing slash", async () => {
  for (const c of [
    { workdir: "/w/repo/", scratch: "/w/scratch/" },
    { workdir: "/w/repo", scratch: "/w/repo-scratch" },
    { workdir: "/w/repo-wt/", scratch: "/w/repo" },
  ]) {
    try {
      await runLoop({ args: baseArgs({ ...c, maxRounds: 1 }) });
    } catch (e) {
      assert.doesNotMatch(String(e.message), /must be separate directories/, `${c.workdir} ${c.scratch}`);
    }
  }
});

test("a trailing slash on scratch does not double the slash in the paths agents are given or reject their reproducers", async () => {
  const { calls, result } = await runLoop({
    args: baseArgs({ scratch: "/w/scratch/", fixEnabled: false, maxRounds: 1 }),
    override: (call) =>
      call.label === "break:R1:boundaries"
        ? { candidates: [candidate("/w/scratch", "R1", "boundaries", { name: "a", title: "t", file: "src/a.js", line: 1, severity: "medium" })] }
        : undefined,
  });
  const prompt = calls.find((c) => c.label === "break:R1:boundaries").prompt;
  assert.match(prompt, /'\/w\/scratch\/R1\/boundaries'/);
  assert.doesNotMatch(prompt, /scratch\/\//);
  assert.equal(result.findings.length, 1, "the reproducer under the single-slash path is accepted");
});
