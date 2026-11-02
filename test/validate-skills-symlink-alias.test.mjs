import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSkillFiles } from "../scripts/validate-skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.resolve(__dirname, "..", "scripts", "validate-skills.mjs");

// One real skill that is also reachable through a second, non-ancestor symlink
// (for example .claude/skills/foo -> ../../skills/foo) is still one skill. It
// used to be walked once per path, so the run printed "Checked 2" and reported
// the skill as a duplicate of itself.

const GOOD_DESCRIPTION = "Use when checking that one skill reached through two paths is counted once.";

function goodSkill(name) {
  return `---\nname: ${name}\ndescription: ${GOOD_DESCRIPTION}\n---\n\nBody.\n`;
}

// Runs `run(scratch)` inside a fresh temp dir and removes it afterwards.
function withScratchDir(run) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "nh-skills-alias-")));
  try {
    return run(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function runCli(rootDir) {
  // The timeout turns a runaway symlink walk into a failed test, not a hang.
  return spawnSync(process.execPath, [validatorPath, rootDir], { encoding: "utf8", timeout: 20000 });
}

function writeSkill(dir, name) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), goodSkill(name));
}

test("CLI counts a skill once when a sibling symlink points at its folder", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "repo");
    writeSkill(path.join(root, "skills", "foo"), "foo");
    mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(path.join(root, "skills", "foo"), path.join(root, ".claude", "skills", "foo"), "dir");

    const result = runCli(root);

    assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.doesNotMatch(result.stdout, /duplicate-name/);
    assert.match(result.stdout, /All SKILL\.md files passed validation with no findings\./);
  });
});

test("findSkillFiles returns the real path, not the alias, when both are inside the tree", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "repo");
    writeSkill(path.join(root, "skills", "foo"), "foo");
    mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
    symlinkSync(path.join(root, "skills", "foo"), path.join(root, ".claude", "skills", "foo"), "dir");

    // ".claude" sorts before "skills", so the alias is the one met first.
    assert.deepEqual(findSkillFiles(root), [path.join(root, "skills", "foo", "SKILL.md")]);
  });
});

test("CLI counts a skill once when a symlink alias points at a relative path", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "repo");
    writeSkill(path.join(root, "skills", "foo"), "foo");
    mkdirSync(path.join(root, ".claude", "skills"), { recursive: true });
    symlinkSync("../../skills/foo", path.join(root, ".claude", "skills", "foo"), "dir");

    const result = runCli(root);

    assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
  });
});

test("CLI counts a skill once when two symlinks outside the tree both point at it", () => {
  withScratchDir((scratch) => {
    writeSkill(path.join(scratch, "shared", "real-folder"), "alias-a");
    const root = path.join(scratch, "repo");
    mkdirSync(root);
    symlinkSync(path.join(scratch, "shared", "real-folder"), path.join(root, "alias-a"), "dir");
    symlinkSync(path.join(scratch, "shared", "real-folder"), path.join(root, "alias-b"), "dir");

    const result = runCli(root);

    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.doesNotMatch(result.stdout, /duplicate-name/);
    // Deterministic pick: the alphabetically first alias is the one validated.
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stdout}${result.stderr}`);
  });
});

test("CLI still reports two distinct real skills that share a name as duplicates", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "repo");
    writeSkill(path.join(root, "one", "foo"), "foo");
    writeSkill(path.join(root, "two", "foo"), "foo");

    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 2 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /\(duplicate-name\)/);
  });
});
