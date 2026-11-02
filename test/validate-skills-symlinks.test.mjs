import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.resolve(__dirname, "..", "scripts", "validate-skills.mjs");

// A skill reached through a symlink (a symlinked SKILL.md or a symlinked skill
// folder) must be validated like any other skill. Dirent.isFile() and
// Dirent.isDirectory() are both false for a symlink, so such skills used to be
// skipped: the run printed "Checked 0 SKILL.md file(s)" and exited 0.

const BROKEN_SKILL = "---\nname: wrong-name\n---\n\nSee [missing](references/nope.md).\n";
const GOOD_DESCRIPTION = "Use when checking that a skill reached through a symlink is accepted.";

function goodSkill(name) {
  return `---\nname: ${name}\ndescription: ${GOOD_DESCRIPTION}\n---\n\nBody.\n`;
}

// Runs `run(scratch)` inside a fresh temp dir and removes it afterwards.
function withScratchDir(run) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "nh-skills-symlinks-")));
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

function writeFile(dir, name, content) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), content);
}

test("CLI exits 1 for a skill folder whose SKILL.md is a symlink to an invalid file", () => {
  withScratchDir((scratch) => {
    writeFile(path.join(scratch, "shared"), "SKILL.md", BROKEN_SKILL);
    const root = path.join(scratch, "root");
    mkdirSync(path.join(root, "linked-file-skill"), { recursive: true });
    symlinkSync(
      path.join(scratch, "shared", "SKILL.md"),
      path.join(root, "linked-file-skill", "SKILL.md"),
      "file"
    );

    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /HARD FAILS/);
    assert.match(result.stdout, /\(name\)/);
    assert.match(result.stdout, /\(file-reference\)/);
  });
});

test("CLI exits 1 for a skill directory that is a symlink to a folder with an invalid SKILL.md", () => {
  withScratchDir((scratch) => {
    writeFile(path.join(scratch, "shared"), "SKILL.md", BROKEN_SKILL);
    const root = path.join(scratch, "root");
    mkdirSync(root);
    symlinkSync(path.join(scratch, "shared"), path.join(root, "linked-dir-skill"), "dir");

    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /HARD FAILS/);
    assert.match(result.stdout, /linked-dir-skill/);
  });
});

test("CLI counts and accepts a valid skill reached through a symlinked directory", () => {
  withScratchDir((scratch) => {
    writeFile(path.join(scratch, "shared", "real-folder"), "SKILL.md", goodSkill("linked-good"));
    const root = path.join(scratch, "root");
    mkdirSync(root);
    symlinkSync(path.join(scratch, "shared", "real-folder"), path.join(root, "linked-good"), "dir");

    const result = runCli(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /All SKILL\.md files passed validation with no findings\./);
  });
});

test("CLI counts and accepts a valid skill whose SKILL.md is a symlink", () => {
  withScratchDir((scratch) => {
    writeFile(path.join(scratch, "shared"), "SKILL.md", goodSkill("linked-good-file"));
    const root = path.join(scratch, "root");
    mkdirSync(path.join(root, "linked-good-file"), { recursive: true });
    symlinkSync(
      path.join(scratch, "shared", "SKILL.md"),
      path.join(root, "linked-good-file", "SKILL.md"),
      "file"
    );

    const result = runCli(root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
  });
});

test("CLI hard-fails a dangling SKILL.md symlink with a report instead of skipping or crashing", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "root");
    mkdirSync(path.join(root, "dangling-skill"), { recursive: true });
    symlinkSync(path.join(scratch, "does-not-exist.md"), path.join(root, "dangling-skill", "SKILL.md"), "file");

    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /HARD FAILS/);
    assert.match(result.stdout, /dangling-skill/);
    assert.equal(result.stderr, "", "a dangling link must be reported, not thrown as an uncaught error");
  });
});

test("CLI terminates on a symlink loop and still validates each skill exactly once", () => {
  withScratchDir((scratch) => {
    const root = path.join(scratch, "root");
    writeFile(path.join(root, "looped"), "SKILL.md", goodSkill("looped"));
    // looped/back -> root, an ancestor of the folder that holds the link.
    symlinkSync(root, path.join(root, "looped", "back"), "dir");

    const result = runCli(root);

    assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
  });
});
