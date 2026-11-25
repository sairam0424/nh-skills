import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SAFETY_RUNNER = readFileSync(new URL("../nh-chaos-monkey/references/safety-runner.md", import.meta.url), "utf8");
const SKILL = readFileSync(new URL("../nh-chaos-monkey/SKILL.md", import.meta.url), "utf8");

// First-user read of v0.2.3 (2026-11-25): the recommended denyRead list omitted Claude Code's own settings files, although
// every tested session denied them and the probe does not check them, so a reader who pasted the example had weaker settings
// than the tested ones.
const settingsBlocks = () =>
  [...SAFETY_RUNNER.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1])).filter((j) => j.sandbox && j.sandbox.filesystem);

test("both settings examples deny reads of Claude Code's own account and settings files", () => {
  const blocks = settingsBlocks();
  assert.equal(blocks.length, 2, "the base example and the worked example");
  for (const block of blocks) {
    const deny = block.sandbox.filesystem.denyRead;
    assert.ok(deny.includes("~/.claude.json"), "denyRead lists ~/.claude.json");
    assert.ok(deny.includes("~/.claude/settings.json"), "denyRead lists ~/.claude/settings.json");
  }
});

test("both examples keep the credential roots, and the worked one keeps the repository .git writable but not its hooks or config", () => {
  const [base, worked] = settingsBlocks();
  for (const block of [base, worked]) for (const root of ["~/.ssh", "~/.aws", "~/.npmrc", "~/.git-credentials"]) assert.ok(block.sandbox.filesystem.denyRead.includes(root), root);
  assert.ok(worked.sandbox.filesystem.allowWrite.some((p) => p.endsWith("/.git")));
  assert.ok(worked.sandbox.filesystem.denyWrite.some((p) => p.endsWith("/.git/hooks")));
  assert.ok(worked.sandbox.filesystem.denyWrite.some((p) => p.endsWith("/.git/config")));
});

// The same read said "not for unattended runs" next to a documented headless route.
test("SKILL.md says a headless run with the contract supplied is supported", () => {
  assert.doesNotMatch(SKILL, /not for unattended runs/);
  assert.match(SKILL, /A headless run with those arguments is supported; a headless run that has to guess them is not\./);
});
