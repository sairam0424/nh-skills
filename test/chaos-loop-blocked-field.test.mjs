import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

// Dogfood 2026-11-24 (a real Python project, round 2): every breaker ran the code, fuzzed it and found nothing, and
// wrote "No defect found: ..." into the optional blocked field. The loop read that as "could not run the project"
// and stopped with breakers-blocked, so a plateau was reported as "nothing was tested".
const quietRound = (reply) => ({
  args: baseArgs({ fixEnabled: false, maxRounds: 3, plateauRounds: 1 }),
  override: (call) => (/^break:R\d:/.test(call.label) ? reply : undefined),
});

test("breakers that ran the code and say so are a plateau, not a blocked run", async () => {
  const { result } = await runLoop(
    quietRound({ candidates: [], blocked: "fuzzed 9-character strings on three dialects", ranProjectCode: true }),
  );
  assert.equal(result.haltReason, "plateau");
  assert.equal(result.finished, true);
});

test("a no-defect sentence in blocked without the flag is a plateau too", async () => {
  for (const note of [
    "No defect found: the nesting check uses a close+1 bound",
    "No fault-injection defect found in parser.py",
    "no bugs reproduced after 400 inputs",
    "  No issue found.",
    "No crash found after 300 inputs",
    "No failing input found",
    "Nothing found",
    "I found no defects",
  ]) {
    const { result } = await runLoop(quietRound({ candidates: [], blocked: note }));
    assert.equal(result.haltReason, "plateau", note);
  }
});

test("a breaker that says the code could not run is still blocked, with or without the flag", async () => {
  for (const reply of [
    { candidates: [], blocked: "numpy cannot be imported by python3", ranProjectCode: false },
    { candidates: [], blocked: "numpy cannot be imported by python3" },
    { candidates: [], blocked: "No module named 'numpy'" },
    { candidates: [], blocked: "No defect-finding is possible: pytest is missing", ranProjectCode: false },
    { candidates: [], blocked: "No Python interpreter is available, so no bugs could be tested" },
    { candidates: [], blocked: "No defect could be found because the module could not be imported" },
    { candidates: [], blocked: "No module named numpy, import fails with a fault" },
    { candidates: [], blocked: "No usable test runner is configured for defects" },
    { candidates: [], blocked: "No network or real dependency, so the faults lens cannot run the project" },
  ]) {
    const { result } = await runLoop(quietRound(reply));
    assert.match(result.haltReason, /^breakers-blocked: /, JSON.stringify(reply));
    assert.equal(result.finished, false);
  }
});

test("one blocked lens among silent ones still blocks, and ranProjectCode true on the others does not hide it", async () => {
  const { result } = await runLoop({
    args: baseArgs({ fixEnabled: false, maxRounds: 3, plateauRounds: 1 }),
    override: (call) => {
      if (!/^break:R\d:/.test(call.label)) return undefined;
      return call.label.endsWith(":boundaries")
        ? { candidates: [], blocked: "cannot import the package", ranProjectCode: false }
        : { candidates: [], ranProjectCode: true };
    },
  });
  assert.match(result.haltReason, /^breakers-blocked: boundaries: cannot import the package/);
});

test("the breaker prompt and schema ask for ranProjectCode and say what blocked is for", async () => {
  const { calls } = await runLoop({ args: baseArgs({ fixEnabled: false, maxRounds: 1 }) });
  const breaker = calls.find((c) => /^break:/.test(c.label));
  assert.match(breaker.prompt, /put the reason in blocked \(one sentence\) and set ranProjectCode to false/);
  assert.match(breaker.prompt, /leave blocked empty and set ranProjectCode to true/);
  assert.match(breaker.prompt, /"no defect found" never belongs in blocked/);
  assert.ok(breaker.opts.schema.properties.ranProjectCode, "the breaker schema declares ranProjectCode");
});

test("ranProjectCode false with an empty or blank blocked is blocked, with a default reason", async () => {
  for (const reply of [
    { candidates: [], ranProjectCode: false },
    { candidates: [], blocked: "   ", ranProjectCode: false },
  ]) {
    const { result } = await runLoop(quietRound(reply));
    assert.match(result.haltReason, /^breakers-blocked: boundaries: did not run the project's code/, JSON.stringify(reply));
    assert.equal(result.finished, false);
  }
});

test("a blocked note that is only whitespace or too short, without the flag, is not blocked", async () => {
  for (const note of ["", "  ", "no"]) {
    const { result } = await runLoop(quietRound({ candidates: [], blocked: note }));
    assert.equal(result.haltReason, "plateau", JSON.stringify(note));
  }
});
