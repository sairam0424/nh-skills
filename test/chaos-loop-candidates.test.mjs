import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, callsFor, finding, h64, hexSha, labelsOf, runLoop } from "./support/chaos-loop-harness.mjs";

const SCRATCH = "/w/scratch";
const dir = (round, lens) => SCRATCH + "/" + round + "/" + lens + "/";

// Break candidates are checked by the script, not trusted: a rejected one must never reach a confirmer.
// Each case ships next to a control candidate that is valid, so the test cannot pass by dropping everything.
const BAD_CANDIDATES = [
  ["a reproducer outside the scratch directory", { reproFile: "/tmp/x.mjs", reproCmd: "node /tmp/x.mjs" }],
  ["a reproducer in another round's directory", (s) => ({ reproFile: dir("R2", "boundaries") + s.name + ".mjs", reproCmd: "node " + dir("R2", "boundaries") + s.name + ".mjs" })],
  ["a reproducer in another lens's directory", (s) => ({ reproFile: dir("R1", "contract") + s.name + ".mjs", reproCmd: "node " + dir("R1", "contract") + s.name + ".mjs" })],
  ["a reproducer in a nested directory", (s) => ({ reproFile: dir("R1", "boundaries") + "sub/" + s.name + ".mjs", reproCmd: "node " + dir("R1", "boundaries") + "sub/" + s.name + ".mjs" })],
  ["a reproducer named dot dot", () => ({ reproFile: dir("R1", "boundaries") + "..", reproCmd: "node " + dir("R1", "boundaries") + ".." })],
  ["a runner that is not on the allow list", (s) => ({ reproCmd: "rm " + dir("R1", "boundaries") + s.name + ".mjs" })],
  ["a command with extra arguments", (s) => ({ reproCmd: "node " + dir("R1", "boundaries") + s.name + ".mjs --flag" })],
  ["a command with a pipe", (s) => ({ reproCmd: "node " + dir("R1", "boundaries") + s.name + ".mjs | cat" })],
  ["a command with a substitution", (s) => ({ reproCmd: "node $(id) " + dir("R1", "boundaries") + s.name + ".mjs" })],
  ["a command with a different file than reproFile", (s) => ({ reproCmd: "node " + dir("R1", "boundaries") + "other.mjs" })],
  ["a reproducer that exited zero", { observedExit: 0 }],
  ["a reproducer with a negative exit", { observedExit: -1 }],
  ["a source path that climbs out", { file: "../etc/passwd" }],
  ["an absolute source path", { file: "/etc/passwd" }],
  ["a source path inside .git", { file: ".git/config" }],
  ["a source path inside .husky", { file: ".husky/pre-commit" }],
  ["a source path starting with a dash", { file: "-rf" }],
  ["a source path with a space", { file: "src/a b.js" }],
];

test("breaker candidates are validated by the script before any confirmer runs", async () => {
  for (const [name, mutation] of BAD_CANDIDATES) {
    const good = finding(1);
    const bad = finding(2);
    const { calls, result } = await runLoop({
      args: baseArgs({ fixEnabled: false }),
      plan: { "R1:boundaries": [good, bad] },
      override: (call, world, dflt) => {
        if (call.label !== "break:R1:boundaries") return undefined;
        const patch = typeof mutation === "function" ? mutation(bad) : mutation;
        const [first, second] = dflt.candidates;
        return { candidates: [first, { ...second, ...patch }] };
      },
    });
    assert.deepEqual(
      callsFor(calls, "confirm:").map((c) => c.label),
      ["confirm:R1-1"],
      name + ": only the control candidate may be confirmed",
    );
    assert.equal(result.findings.length, 1, name);
  }
});

test("a valid reproducer path may use dots, dashes and underscores in its name", async () => {
  const spec = finding(1, { name: "a.b-c_d.test" });
  const { calls } = await runLoop({
    args: baseArgs({ fixEnabled: false }),
    plan: { "R1:boundaries": [spec] },
  });
  assert.equal(callsFor(calls, "confirm:").length, 1);
});

test("custom reproducer runners are honoured, defaults are refused when replaced", async () => {
  const withPython = await runLoop({
    args: baseArgs({ fixEnabled: false, reproRunners: ["python3"] }),
    plan: { "R1:boundaries": [finding(1)] },
    override: (call, world, dflt) =>
      call.label === "break:R1:boundaries"
        ? { candidates: dflt.candidates.map((c) => ({ ...c, reproCmd: c.reproCmd.replace(/^node/, "python3") })) }
        : undefined,
  });
  assert.equal(callsFor(withPython.calls, "confirm:").length, 1);

  const nodeNowRefused = await runLoop({
    args: baseArgs({ fixEnabled: false, reproRunners: ["python3"] }),
    plan: { "R1:boundaries": [finding(1)] },
  });
  assert.equal(callsFor(nodeNowRefused.calls, "confirm:").length, 0);
});

test("duplicates are merged across lenses by file and title, and by file and line", async () => {
  const sameTitle = finding(1);
  const otherLens = { ...finding(1), name: "second", title: "DEFECT NUMBER 1 in the module!" };
  const sameLine = { ...finding(3), file: "src/m1.js", line: 10, name: "third" };
  const { calls } = await runLoop({
    args: baseArgs({ fixEnabled: false }),
    plan: {
      "R1:boundaries": [sameTitle],
      "R1:state-order": [otherLens],
      "R1:error-paths": [sameLine],
    },
  });
  assert.deepEqual(callsFor(calls, "confirm:").map((c) => c.label), ["confirm:R1-1"]);
});

test("a finding seen in an earlier round is not proposed again later", async () => {
  const { calls, result } = await runLoop({
    args: baseArgs({ fixEnabled: false, maxRounds: 3 }),
    plan: {
      "R1:boundaries": [finding(1)],
      "R2:boundaries": [finding(1), finding(2)],
    },
  });
  assert.deepEqual(
    callsFor(calls, "confirm:").map((c) => c.label),
    ["confirm:R1-1", "confirm:R2-1"],
  );
  assert.equal(result.findings.length, 2);
});

test("only the highest-severity candidates are pursued when the cap is hit, and the cut is logged and kept", async () => {
  const plan = {
    "R1:boundaries": [
      finding(1, { severity: "low" }),
      finding(2, { severity: "high" }),
      finding(3, { severity: "medium" }),
      finding(4, { severity: "high" }),
    ],
  };
  const { calls, result, logs } = await runLoop({
    args: baseArgs({ fixEnabled: false, maxFindingsPerRound: 2, maxRounds: 1 }),
    plan,
  });
  assert.deepEqual(callsFor(calls, "confirm:").map((c) => c.label), ["confirm:R1-1", "confirm:R1-2"]);
  assert.deepEqual(result.findings.map((f) => f.file), ["src/m2.js", "src/m4.js"]);
  assert.ok(logs.some((l) => /2 candidate\(s\) kept for the next round/.test(l)), logs.join("\n"));
  assert.deepEqual(result.backlog.map((b) => b.file).sort(), ["src/m1.js", "src/m3.js"]);
});

test("a breaker that returns nothing does not stop the other lenses", async () => {
  const { calls, logs } = await runLoop({
    args: baseArgs({ fixEnabled: false }),
    plan: { "R1:state-order": [finding(1)] },
    override: (call) => (call.label === "break:R1:boundaries" ? null : undefined),
  });
  assert.equal(callsFor(calls, "confirm:").length, 1);
  assert.ok(logs.some((l) => /1 breaker\(s\) returned nothing/.test(l)));
});

test("the number of candidates asked per lens follows the per-round cap", async () => {
  const { calls } = await runLoop({ args: baseArgs({ maxFindingsPerRound: 6 }) });
  assert.match(calls.find((c) => c.label === "break:R1:boundaries").prompt, /\(at most 3\)/);
  const small = await runLoop({ args: baseArgs({ maxFindingsPerRound: 1 }) });
  assert.match(small.calls.find((c) => c.label === "break:R1:boundaries").prompt, /\(at most 2\)/);
});

// ---------- confirmation classes ----------
const CLASS_CASES = [
  ["both runs fail, legit, symptom matches", {}, "confirmed"],
  ["flaky: fails once, passes once", { exit2: 0 }, "lead"],
  ["flaky the other way round", { exit1: 0, exit2: 1 }, "lead"],
  ["fails twice but is not reachable through the contract", { legit: false }, "invalid"],
  ["fails twice, legit, but the failure is unrelated to the claim", { symptomMatchesClaim: false }, "lead"],
  ["fails twice but the reproducer hash is malformed", { reproSha: "xyz" }, "lead"],
  ["fails twice but the reproducer hash is upper case", { reproSha: "A".repeat(64) }, "lead"],
  ["fails twice but the reproducer hash is a 40 character sha", { reproSha: "a".repeat(40) }, "lead"],
  ["not legit and flaky is still only a lead", { legit: false, exit2: 0 }, "lead"],
];

test("confirmation classes follow the two-run, legitimacy and hash rules", async () => {
  for (const [name, patch, expected] of CLASS_CASES) {
    const { result } = await runLoop({
      args: baseArgs({ fixEnabled: false, maxRounds: 1 }),
      plan: { "R1:boundaries": [finding(1)] },
      override: (call, world, dflt) => (call.label === "confirm:R1-1" ? { ...dflt, ...patch } : undefined),
    });
    const record = result.findings.find((f) => f.id === "R1-1");
    const cls = record.class === "confirmed-unfixed" ? "confirmed" : record.class;
    assert.equal(cls, expected, name);
  }
});

test("a reproducer that passes on both confirmation runs is never treated as a break", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ maxRounds: 1 }),
    plan: { "R1:boundaries": [finding(1)] },
    override: (call, world, dflt) => (call.label === "confirm:R1-1" ? { ...dflt, exit1: 0, exit2: 0 } : undefined),
  });
  assert.notEqual(result.findings[0].class, "confirmed-unfixed");
  assert.notEqual(result.findings[0].class, "fixed-agent-verified");
  assert.equal(callsFor(calls, "fix:").length, 0);
});

test("lead-only mode proves breaks but fixes nothing and never rejudges", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs({ fixEnabled: false }),
    plan: { "R1:boundaries": [finding(1)] },
  });
  assert.equal(result.findings[0].class, "confirmed-unfixed");
  assert.match(result.findings[0].note, /lead-only mode/);
  assert.equal(result.fixEnabled, false);
  for (const prefix of ["fix:", "verify:", "commit:", "reset:", "rejudge:"])
    assert.equal(callsFor(calls, prefix).length, 0, prefix);
  assert.equal(result.haltReason, "plateau");
  assert.equal(result.rounds.length, 2);
});

test("a reproducer that dirties the worktree halts the whole run", async () => {
  const { result, labels } = await dirtiedRun();
  assert.match(result.haltReason, /^reproducer-dirtied-the-worktree: R1-2/);
  assert.ok(!labels.some((l) => l.startsWith("fix:")), "no fix may start after the tree was dirtied");
});

async function dirtiedRun() {
  const { result, calls } = await runLoop({
    args: baseArgs(),
    plan: { "R1:boundaries": [finding(1), finding(2)] },
    override: (call, world, dflt) => (call.label === "confirm:R1-2" ? { ...dflt, workdirDirty: true } : undefined),
  });
  return { result, labels: labelsOf(calls) };
}

test("a head that moved during break or confirm halts the run", async () => {
  const { result, calls } = await runLoop({
    args: baseArgs(),
    plan: { "R1:boundaries": [finding(1)] },
    override: (call, world, dflt) => (call.label === "confirm:R1-1" ? { ...dflt, headSha: hexSha(999) } : undefined),
  });
  assert.match(result.haltReason, /^head-moved-during-break-or-confirm/);
  assert.equal(callsFor(calls, "fix:").length, 0);
});

test("the reproducer hash the confirmer returns is the one the verifier must match", async () => {
  const { result } = await runLoop({
    args: baseArgs({ maxFixAttempts: 1 }),
    plan: { "R1:boundaries": [finding(1)] },
    override: (call, world, dflt) => (call.label.startsWith("verify:") ? { ...dflt, reproSha: h64("tampered") } : undefined),
  });
  assert.equal(result.findings[0].class, "confirmed-unfixed");
  assert.match(result.findings[0].rejections[0].join(" "), /reproducer file was modified after confirmation/);
});
