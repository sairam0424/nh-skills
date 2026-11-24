import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

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
