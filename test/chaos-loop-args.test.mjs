import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, finding, runLoop } from "./support/chaos-loop-harness.mjs";

const rejectsWith = (args, pattern) =>
  assert.rejects(runLoop({ args }), (e) => {
    assert.match(e.message, pattern);
    return true;
  });

test("missing required args are all named", async () => {
  await rejectsWith({}, /missing args: workdir, scratch, judgeCmd, target/);
  await rejectsWith(baseArgs({ target: "   " }), /missing args: target/);
  await rejectsWith(baseArgs({ judgeCmd: 5 }), /missing args: judgeCmd/);
});

test("args that are not JSON fail with a clear message", async () => {
  await rejectsWith("{not json", /args must be a JSON object/);
});

test("workdir and scratch must be absolute, plain paths", async () => {
  for (const bad of ["relative/path", "/has space/x", "/a/../b", "/a//b", "/a/./b", "/a/$(id)"]) {
    await rejectsWith(baseArgs({ workdir: bad }), /absolute paths/);
    await rejectsWith(baseArgs({ scratch: bad }), /absolute paths/);
  }
});

test("workdir and scratch may not contain each other", async () => {
  await rejectsWith(baseArgs({ workdir: "/w/repo", scratch: "/w/repo/tmp" }), /separate directories/);
  await rejectsWith(baseArgs({ workdir: "/w/repo/sub", scratch: "/w/repo" }), /separate directories/);
  await rejectsWith(baseArgs({ workdir: "/w/repo", scratch: "/w/repo" }), /separate directories/);
});

test("sibling directories that only share a name prefix are allowed", async () => {
  const { result } = await runLoop({ args: baseArgs({ workdir: "/w/repo", scratch: "/w/repo-scratch" }) });
  assert.equal(result.haltReason, "plateau");
});

test("target and judgeCmd must be single-line", async () => {
  await rejectsWith(baseArgs({ target: "a\nb" }), /single-line/);
  await rejectsWith(baseArgs({ judgeCmd: "npm test\nrm x" }), /single-line/);
});

test("judge commands that could mask a failure are refused", async () => {
  const refused = [
    "npm test | tee out.txt",
    "npm test || true",
    "npm test; echo done",
    "npm test &",
    "npm test --passWithNoTests",
    "vitest run --bail",
    "pytest --lf",
    "jest -u",
    "jest --updateSnapshot",
    "eslint . --exit-zero",
    "go test --ignore=x",
    "npm test | grep ok",
  ];
  for (const judgeCmd of refused) await rejectsWith(baseArgs({ judgeCmd }), /best-effort screening/);
});

test("ordinary documented test commands pass the screening", async () => {
  const accepted = [
    "npm test",
    "node --test",
    "npm run build && npm test",
    "pytest -q tests/",
    "go test ./...",
    "cargo test --all",
    "make test",
  ];
  for (const judgeCmd of accepted) {
    const { result } = await runLoop({ args: baseArgs({ judgeCmd }) });
    assert.equal(result.judgeCmd, judgeCmd);
  }
});

test("lens keys, protected paths and runners are validated", async () => {
  await rejectsWith(baseArgs({ lenses: [{ key: "Bad Key", brief: "x" }] }), /lens keys must match/);
  await rejectsWith(baseArgs({ lenses: [{ key: "x".repeat(25), brief: "x" }] }), /lens keys must match/);
  await rejectsWith(baseArgs({ protectedPaths: ["test", "--force"] }), /not starting with a dash/);
  await rejectsWith(baseArgs({ protectedPaths: ["a\nb"] }), /single-line pathspecs/);
  await rejectsWith(baseArgs({ reproRunners: ["node; rm"] }), /reproRunners entries/);
  await rejectsWith(baseArgs({ reproRunners: ["node|bash"] }), /reproRunners entries/);
});

test("numeric caps are clamped, non-integers fall back to defaults", async () => {
  const lensCall = async (extra) => {
    const { calls } = await runLoop({ args: baseArgs(extra) });
    return calls.filter((c) => c.label.startsWith("break:R1:")).length;
  };
  assert.equal(await lensCall({ lenses: Array.from({ length: 9 }, (_, i) => ({ key: "l" + i, brief: "b" })) }), 6);

  // A fresh confirmed break every round (lead-only mode) keeps the plateau stop away.
  const everyRound = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((r) => ["R" + r + ":boundaries", [finding(r)]]),
  );
  const maxRoundsSeen = async (maxRounds) => {
    const { result } = await runLoop({
      args: baseArgs({ maxRounds, fixEnabled: false }),
      plan: everyRound,
    });
    assert.equal(result.haltReason, "max-rounds");
    return result.rounds.length;
  };
  assert.equal(await maxRoundsSeen(99), 6);
  assert.equal(await maxRoundsSeen(0), 1);
  assert.equal(await maxRoundsSeen(-5), 1);
  assert.equal(await maxRoundsSeen(2.5), 3);
  assert.equal(await maxRoundsSeen("4"), 3);
});

test("a lens brief keeps up to 600 characters so a rule at its end is not cut off", async () => {
  const { calls } = await runLoop({
    args: baseArgs({ lenses: [{ key: "long", brief: "x".repeat(550) + " END-MARKER" }, { key: "cut", brief: "y".repeat(700) + " LOST-MARKER" }] }),
  });
  const kept = calls.find((c) => c.label === "break:R1:long").prompt;
  const cut = calls.find((c) => c.label === "break:R1:cut").prompt;
  assert.match(kept, /END-MARKER/);
  assert.doesNotMatch(cut, /LOST-MARKER/);
});
