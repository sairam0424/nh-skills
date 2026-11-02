import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = realpathSync(path.resolve(__dirname, "..", "scripts"));
const validatorPath = path.join(scriptsDir, "validate-skills.mjs");

const { validateRepo, formatReport } = await import(pathToFileURL(validatorPath).href);

// The CLI used to end with process.exit(main(...)) right after one console.log
// of the whole report. When stdout is a pipe (CI log collector, `| tee`,
// spawnSync) the part of a large report that was still queued was dropped, so
// the findings at the end and the closing summary never arrived. These tests run
// the CLI with piped stdout and a report far larger than one pipe buffer.

// Large enough that the report is several times the 64 KB pipe buffer.
const SKILL_COUNT = 2000;

function writeSkill(root, folder, frontMatter) {
  const dir = path.join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontMatter}\n---\n\nBody.\n`);
}

// Runs `run(scratch)` inside a fresh temp dir and removes it afterwards.
function withScratchDir(run) {
  const scratch = mkdtempSync(path.join(tmpdir(), "nh-skills-piped-stdout-"));
  try {
    return run(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Every skill gets a unique wrong name and no description: two hard fails each.
function makeHardFailRoot(scratch) {
  const root = path.join(scratch, "hard-fail-root");
  for (let i = 0; i < SKILL_COUNT; i += 1) {
    writeSkill(root, `skill-${i}`, `name: wrong-${i}`);
  }
  return root;
}

// Every skill is valid except for a description with no "when to use" clause:
// one soft warning each and no hard fail, so the CLI must exit 0.
function makeSoftWarnRoot(scratch) {
  const root = path.join(scratch, "soft-warn-root");
  for (let i = 0; i < SKILL_COUNT; i += 1) {
    writeSkill(root, `skill-${i}`, `name: skill-${i}\ndescription: Formats widget number ${i}.`);
  }
  return root;
}

// stdout is a pipe here because spawnSync is given no stdio override.
function runPiped(root) {
  return spawnSync(process.execPath, [validatorPath, root], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120000,
  });
}

test("CLI delivers the complete report through a pipe when the report is far larger than a pipe buffer", () => {
  withScratchDir((scratch) => {
    const root = makeHardFailRoot(scratch);
    const expected = `${formatReport(validateRepo(root))}\n`;
    assert.ok(expected.length > 256 * 1024, `fixture report is too small to test a pipe: ${expected.length} bytes`);

    const result = runPiped(root);

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout.length, expected.length, "piped report length differs from the full report");
    assert.equal(result.stdout, expected);
  });
});

test("CLI piped report still lists the last finding and the hard-fail count", () => {
  withScratchDir((scratch) => {
    const root = makeHardFailRoot(scratch);

    const result = runPiped(root);

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, new RegExp(`HARD FAILS \\(${SKILL_COUNT * 2}\\):`));
    assert.equal(result.stdout.split("\n").filter((line) => line.startsWith("  [FAIL] ")).length, SKILL_COUNT * 2);
    assert.ok(result.stdout.includes(`skill-${SKILL_COUNT - 1}`), "findings for the last skills are missing");
  });
});

test("CLI delivers the complete report and exits 0 through a pipe when there are only soft warnings", () => {
  withScratchDir((scratch) => {
    const root = makeSoftWarnRoot(scratch);
    const expected = `${formatReport(validateRepo(root))}\n`;
    assert.ok(expected.length > 128 * 1024, `fixture report is too small to test a pipe: ${expected.length} bytes`);

    const result = runPiped(root);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.length, expected.length, "piped report length differs from the full report");
    assert.equal(result.stdout, expected);
    assert.match(result.stdout, /No hard failures\. Soft warnings above are non-blocking\.\n$/);
  });
});
