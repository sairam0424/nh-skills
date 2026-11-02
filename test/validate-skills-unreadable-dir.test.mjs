import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSkillFiles, validateRepo } from "../scripts/validate-skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.resolve(__dirname, "..", "scripts", "validate-skills.mjs");

// A directory the scan cannot list (readdir fails with EACCES) used to abort the
// whole run with an uncaught exception: a raw Node stack trace on stderr, no
// report on stdout, and every genuine finding elsewhere in the tree lost. Like an
// unreadable SKILL.md, it must be reported as a hard-fail finding while the rest
// of the tree is still scanned.

// chmod 000 does not block root, and has no effect on Windows.
const CANNOT_LOCK_DIRECTORIES =
  process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0);
const lockable = {
  skip: CANNOT_LOCK_DIRECTORIES && "chmod 000 does not make a directory unreadable for root or on Windows",
};

const BROKEN_SKILL = "---\nname: wrong-name\n---\n\nBody.\n";
const GOOD_DESCRIPTION = "Use when checking that an unreadable directory is reported.";

function goodSkill(name) {
  return `---\nname: ${name}\ndescription: ${GOOD_DESCRIPTION}\n---\n\nBody.\n`;
}

function writeFile(dir, name, content) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), content);
}

// Builds a tree with `build(scratch)`, which returns { root, locked }, makes
// `locked` unreadable, runs `run(root)`, then restores the permissions before
// deleting the scratch dir (rmSync cannot descend into a directory with mode 000).
function withLockedDir(build, run) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "nh-skills-unreadable-")));
  try {
    const { root, locked } = build(scratch);
    try {
      chmodSync(locked, 0o000);
      return run(root);
    } finally {
      chmodSync(locked, 0o755);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function runCli(rootDir) {
  // The timeout turns a runaway scan into a failed test, not a hang.
  return spawnSync(process.execPath, [validatorPath, rootDir], { encoding: "utf8", timeout: 20000 });
}

// root/bad                       a genuinely broken skill
// root/group/locked/inner        a valid skill hidden inside the unreadable dir
// root/group/sibling-after       a valid skill next to the unreadable dir
function buildTreeWithNestedLockedDir(scratch) {
  const root = path.join(scratch, "root");
  writeFile(path.join(root, "bad"), "SKILL.md", BROKEN_SKILL);
  writeFile(path.join(root, "group", "locked", "inner"), "SKILL.md", goodSkill("inner"));
  writeFile(path.join(root, "group", "sibling-after"), "SKILL.md", goodSkill("sibling-after"));
  return { root, locked: path.join(root, "group", "locked") };
}

test("CLI reports an unreadable subdirectory as a hard-fail and still prints the other findings", lockable, () => {
  withLockedDir(buildTreeWithNestedLockedDir, (root) => {
    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.equal(result.stderr, "", "an unreadable directory must be reported, not thrown as an uncaught error");
    assert.match(result.stdout, /HARD FAILS/);
    // The unreadable directory is named in a finding of its own.
    assert.match(result.stdout, /\[FAIL\] group\/locked — \(unreadable\) Cannot read directory: /);
    // The genuine finding elsewhere in the tree survives.
    assert.match(result.stdout, /\[FAIL\] bad\/SKILL\.md — \(name\)/);
    // The scan went on past the failure: the sibling skill was found, the skill
    // inside the locked directory could not be.
    assert.match(result.stdout, /Checked 2 SKILL\.md file\(s\)\./);
  });
});

test("CLI does not pass a tree whose only problem is an unreadable directory", lockable, () => {
  const build = (scratch) => {
    const root = path.join(scratch, "root");
    writeFile(path.join(root, "good"), "SKILL.md", goodSkill("good"));
    mkdirSync(path.join(root, "locked"));
    return { root, locked: path.join(root, "locked") };
  };

  withLockedDir(build, (root) => {
    const result = runCli(root);

    // Skills inside the directory were never validated, so a clean exit would be
    // a false pass.
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /\[FAIL\] locked — \(unreadable\) Cannot read directory: /);
  });
});

test("CLI reports an unreadable root directory instead of crashing", lockable, () => {
  const build = (scratch) => {
    const root = path.join(scratch, "root");
    writeFile(path.join(root, "good"), "SKILL.md", goodSkill("good"));
    return { root, locked: root };
  };

  withLockedDir(build, (root) => {
    const result = runCli(root);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Checked 0 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /\[FAIL\] \. — \(unreadable\) Cannot read directory: /);
  });
});

test("validateRepo returns an unreadable finding for the directory instead of throwing", lockable, () => {
  withLockedDir(buildTreeWithNestedLockedDir, (root) => {
    const { hardFails, filesChecked } = validateRepo(root);

    assert.equal(filesChecked, 2);
    const unreadable = hardFails.filter((f) => f.rule === "unreadable");
    assert.equal(unreadable.length, 1);
    assert.equal(unreadable[0].file, path.join("group", "locked"));
    assert.match(unreadable[0].message, /^Cannot read directory: /);
    assert.ok(hardFails.some((f) => f.file === path.join("bad", "SKILL.md") && f.rule === "name"));
  });
});

test("findSkillFiles still returns a plain list of paths when a directory is unreadable", lockable, () => {
  withLockedDir(buildTreeWithNestedLockedDir, (root) => {
    assert.deepEqual(
      [...findSkillFiles(root)].sort(),
      [path.join(root, "bad", "SKILL.md"), path.join(root, "group", "sibling-after", "SKILL.md")]
    );
  });
});
