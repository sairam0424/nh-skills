import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, callsFor, finding, hexSha, runLoop } from "./support/chaos-loop-harness.mjs";

// Each test here comes from a confirmed finding of the independent review of the upgrade.
const patchWhen = (pattern, patch) => (call, world, dflt) =>
  pattern.test(call.label) ? (typeof patch === "function" ? patch(dflt, call, world) : patch) : undefined;
const sameBug = (n, name, extra = {}) => ({ ...finding(n, extra), name });
const rejects = (args, pattern) =>
  assert.rejects(runLoop({ args }), (e) => {
    assert.match(e.message, pattern);
    return true;
  });

// ---------- arguments fail closed ----------
test("safety switches accept only true or false", async () => {
  for (const bad of ["true", "false", 1, 0, null, "yes"]) {
    await rejects(baseArgs({ fixEnabled: bad }), /fixEnabled must be true or false/);
    await rejects(baseArgs({ requireSandbox: bad, probePath: "/w/p.mjs" }), /requireSandbox must be true or false/);
  }
});

test("list arguments must be non-empty arrays, not strings", async () => {
  for (const key of ["lenses", "reproRunners", "protectedPaths"]) {
    await rejects(baseArgs({ [key]: "node" }), new RegExp(key + " must be an array"));
    await rejects(baseArgs({ [key]: {} }), new RegExp(key + " must be an array"));
  }
  await rejects(baseArgs({ lenses: [] }), /lenses must not be empty/);
  await rejects(baseArgs({ reproRunners: [] }), /reproRunners must not be empty/);
});

test("unknown argument names are refused so a typo cannot be silently ignored", async () => {
  await rejects(baseArgs({ maxRound: 1 }), /unknown args: maxRound/);
  await rejects(baseArgs({ fixEnable: false, requireSandbx: true }), /unknown args: fixEnable, requireSandbx/);
});

test("protectedPaths adds to the defaults instead of replacing them", async () => {
  const { calls } = await runLoop({ args: baseArgs({ protectedPaths: ["docs"] }) });
  const prompt = calls.find((c) => c.label === "baseline").prompt;
  for (const kept of ["'.github'", "'.husky'", "'.gitignore'", "'package.json'", "':(glob)**/*.test.*'", "'docs'"])
    assert.ok(prompt.includes(kept), kept + " must be protected");
});

test("replaceProtectedDefaults makes the supplied list the whole list, and needs one", async () => {
  const { calls } = await runLoop({ args: baseArgs({ protectedPaths: ["docs"], replaceProtectedDefaults: true }) });
  const prompt = calls.find((c) => c.label === "baseline").prompt;
  assert.ok(prompt.includes("'docs'"));
  assert.ok(!prompt.includes("'.github'"));
  await rejects(baseArgs({ replaceProtectedDefaults: true }), /replaceProtectedDefaults needs a protectedPaths list/);
  await rejects(baseArgs({ protectedPaths: ["x"], replaceProtectedDefaults: "yes" }), /replaceProtectedDefaults must be true or false/);
});

test("the default protected set covers files that make tools run code", async () => {
  const { calls } = await runLoop({ args: baseArgs() });
  const prompt = calls.find((c) => c.label === "baseline").prompt;
  for (const must of [".npmrc", ".yarnrc.yml", ".envrc", ".cargo", ".vscode", ".devcontainer", "vite.config", "pnpm-lock.yaml", "Cargo.lock", "tsconfig"])
    assert.ok(prompt.includes(must), must + " must be in the default protected set");
});

test("the result echoes the effective settings so a mistyped request is visible", async () => {
  const { result } = await runLoop({ args: baseArgs({ maxRounds: 99, fixEnabled: false, maxPerFile: 3 }) });
  assert.deepEqual(result.settings, {
    maxRounds: 6,
    maxFindingsPerRound: 6,
    maxFixAttempts: 3,
    plateauRounds: 1,
    maxPerFile: 3,
    fixEnabled: false,
    requireSandbox: false,
    lenses: ["boundaries", "state-order", "error-paths", "contract", "faults"],
    reproRunners: "node|node --test|python3|python|pytest|bash|sh|ruby|deno run|bun|go run|php".split("|"),
    protectedPathCount: result.settings.protectedPathCount,
  });
  assert.ok(result.settings.protectedPathCount >= 30);
});

test("more than six lenses are cut, and the result shows which ran", async () => {
  const lenses = Array.from({ length: 8 }, (_, i) => ({ key: "l" + i, brief: "b" }));
  const { result, logs } = await runLoop({ args: baseArgs({ lenses }) });
  assert.deepEqual(result.settings.lenses, ["l0", "l1", "l2", "l3", "l4", "l5"]);
  assert.ok(logs.some((l) => /2 lens\(es\) beyond the limit of 6 were not run/.test(l)), logs.join("\n"));
});

test("finished tells a normal stop from a halt", async () => {
  assert.equal((await runLoop({ args: baseArgs() })).result.finished, true);
  const halted = await runLoop({ args: baseArgs(), override: patchWhen(/^baseline$/, (d) => ({ ...d, judgeExit: 1 })) });
  assert.equal(halted.result.finished, false);
  const silent = await runLoop({ args: baseArgs(), override: patchWhen(/^break:/, null) });
  assert.equal(silent.result.finished, false, "nothing was tested, so it is not a finished run");
});

// ---------- rounds and evidence ----------
test("a round whose candidates were all rejected by validation is not dry and counts them", async () => {
  const plan = Object.fromEntries(["boundaries", "state-order", "error-paths", "contract", "faults"].map((l, i) => ["R1:" + l, [finding(i + 1)]]));
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 3 }),
    plan,
    override: patchWhen(/^break:R1:/, (d) => ({ candidates: d.candidates.map((c) => ({ ...c, observedExit: 0 })) })),
  });
  assert.equal(result.rounds.length, 2, "round 1 must not end the run: rejected candidates are not a clean result");
  assert.equal(result.rounds[0].rejected, 5);
  assert.equal(result.rounds[1].rejected, 0);
  assert.equal(result.haltReason, "plateau", "the genuinely empty second round is the dry one");
});

test("a thrown agent call during the fix phase keeps every confirmed break that was not reached", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: { "R1:boundaries": [finding(1), finding(2), finding(3)] },
    override: (call) => {
      if (call.label === "recheck:R1-2") throw new Error("boom");
      return undefined;
    },
  });
  assert.match(result.haltReason, /^agent-error: boom \(while fixing R1-2\)/);
  assert.equal(result.commits.length, 1);
  assert.equal(result.findings.find((f) => f.id === "R1-1").class, "fixed-agent-verified");
  for (const id of ["R1-2", "R1-3"]) {
    const f = result.findings.find((x) => x.id === id);
    assert.ok(f, id + " must not vanish");
    assert.equal(f.class, "confirmed-unfixed");
  }
  assert.match(result.findings.find((f) => f.id === "R1-3").note, /threw before this break was fixed/);
});

// ---------- superseded must not hide an unfired fault ----------
test("a recheck that passes only because the fault never fired is not superseded", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: { "R1:boundaries": [finding(1), finding(2)] },
    override: patchWhen(/^recheck:R1-2$/, (d) => ({ ...d, exit: 0, outputTail: "NOT-FIRED: 0 faults delivered" })),
  });
  assert.equal(result.findings.find((f) => f.id === "R1-2").class, "fixed-agent-verified");
  assert.equal(callsFor(calls, "fix:R1-2").length, 1);
  assert.match(calls.find((c) => c.label === "recheck:R1-2").prompt, /first 15 lines of its output/);
});

test("a carried-over candidate that passes with NOT-FIRED in its output is not presumed fixed", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 2, maxFindingsPerRound: 1 }),
    plan: { "R1:boundaries": [finding(1), finding(2)] },
    override: patchWhen(/^confirm:R2-1$/, (d) => ({ ...d, exit1: 0, exit2: 0, legit: false, outputTail: "NOT-FIRED" })),
  });
  assert.notEqual(result.findings.find((f) => f.id === "R2-1").class, "superseded");
});

// ---------- corroboration counts lenses ----------
test("one lens listing near-duplicates counts once, two lenses count twice", async () => {
  const { result } = await runLoop({
    args: baseArgs({ fixEnabled: false, maxRounds: 1 }),
    plan: {
      "R1:boundaries": [finding(1), sameBug(1, "again")],
      "R1:state-order": [finding(2)],
      "R1:error-paths": [sameBug(2, "x")],
    },
  });
  const byFile = Object.fromEntries(result.findings.map((f) => [f.file, f.reports]));
  assert.equal(byFile["src/m1.js"], 1);
  assert.equal(byFile["src/m2.js"], 2);
});

test("a fresh report takes over the reproducer but never lowers the severity", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ fixEnabled: false, maxRounds: 2, maxFindingsPerRound: 1 }),
    plan: {
      "R1:boundaries": [finding(1), finding(2, { severity: "high" })],
      "R2:boundaries": [sameBug(2, "fresh", { severity: "low" })],
    },
  });
  const second = result.findings.find((f) => f.id === "R2-1");
  assert.equal(second.severity, "high");
  assert.match(callsFor(calls, "confirm:R2-1")[0].prompt, /R2\/boundaries\/fresh\.mjs/);
});

// ---------- pinned work from two runs must not collide ----------
test("rejected-attempt refs and stashes carry the run's own name", async () => {
  const { calls } = await runLoop({
    args: baseArgs({ maxRounds: 1, maxFixAttempts: 1, scratch: "/w/run-abc123" }),
    plan: { "R1:boundaries": [finding(1)] },
    override: patchWhen(/^verify:/, (d) => ({ ...d, judgeExit: 1 })),
  });
  const reset = calls.find((c) => c.label === "reset:R1-1:a1").prompt;
  assert.ok(reset.includes("refs/chaos/rejected/run-abc123/R1-1-a1"), reset);
  assert.ok(reset.includes("nh-chaos-monkey rejected run-abc123 R1-1 attempt 1"), reset);
});

// ---------- a failed commit does not lose the sha ----------
test("when the committer reports a sha but a dirty tree, the sha is kept in the record", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: { "R1:boundaries": [finding(1)] },
    override: patchWhen(/^commit:/, (d) => ({ ...d, clean: false })),
  });
  assert.match(result.haltReason, /^commit-failed:R1-1/);
  assert.equal(result.findings[0].attemptedCommitSha, hexSha(100));
  assert.equal(result.findings[0].commitSha, undefined, "a failed commit is never listed as a commit");
  assert.deepEqual(result.commits, []);
  assert.match(result.findings[0].note, /commit step failed/);
});

// ---------- more of what the run knew is returned ----------
test("a fixed finding carries the verifier's checks and the confirmer's output", async () => {
  const { result } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  const f = result.findings[0];
  assert.deepEqual(f.verifierChecks, { protectedExit: 0, reproExit: 0, judgeExit: 0, testCount: 11, armExit: 1, rootCause: true });
  assert.equal(f.confirmOutput, "AssertionError");
});

test("testCountHint reaches every agent that counts tests", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxRounds: 1 }), plan: { "R1:boundaries": [finding(1)] } });
  for (const label of ["baseline", "verify:R1-1:a1:t1", "rejudge:R1"])
    assert.match(calls.find((c) => c.label === label).prompt, /How to count: use the tap summary/, label);
});

test("the sandbox probe prompt maps anything but enforced to not-enforced and lists unresolved probes", async () => {
  const { calls } = await runLoop({ args: baseArgs({ requireSandbox: true, probePath: "/w/p.mjs" }) });
  const prompt = calls.find((c) => c.label === "sandbox-probe").prompt;
  assert.match(prompt, /anything other than enforced/);
  assert.match(prompt, /unresolved/);
});
