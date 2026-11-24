import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

// Dogfood 2026-11-24 (toolwarrant, Go): the judge was GOCACHE=... GOMODCACHE=... GOPROXY=off go test ..., but the
// confirmer ran the breaker's reproducer without those variables, the build failed offline, and a real lead could
// not be confirmed.
const breakerPrompt = (calls) => calls.find((c) => /^break:R1:/.test(c.label)).prompt;

test("environment assignments in front of the judge are handed to the breakers", async () => {
  const judgeCmd = "GOCACHE=/s/gocache GOMODCACHE=/m/gomod GOFLAGS=-mod=readonly GOPROXY=off /usr/bin/go test -count=1 ./...";
  const { calls } = await runLoop({ args: baseArgs({ judgeCmd, maxRounds: 1 }) });
  const prompt = breakerPrompt(calls);
  assert.match(prompt, /--- BEGIN JUDGE-ENVIRONMENT[^\n]*\nGOCACHE=\/s\/gocache GOMODCACHE=\/m\/gomod GOFLAGS=-mod=readonly GOPROXY=off\n--- END JUDGE-ENVIRONMENT ---/);
  assert.match(prompt, /run it without them, so a reproducer that needs the same variables/);
  assert.doesNotMatch(prompt.split("BEGIN JUDGE-ENVIRONMENT")[1], /go test/, "only the assignments are copied, not the command");
});

test("a judge without assignments adds nothing", async () => {
  const { calls } = await runLoop({ args: baseArgs({ judgeCmd: "npm test", maxRounds: 1 }) });
  assert.doesNotMatch(breakerPrompt(calls), /JUDGE-ENVIRONMENT/);
});

test("an assignment that is not at the start of the judge is not mistaken for a prefix", async () => {
  const { calls } = await runLoop({ args: baseArgs({ judgeCmd: "pytest -q -k FOO=bar", maxRounds: 1 }) });
  assert.doesNotMatch(breakerPrompt(calls), /JUDGE-ENVIRONMENT/);
});
