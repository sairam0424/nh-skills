import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = realpathSync(path.resolve(__dirname, "..", "scripts"));
const validatorPath = path.join(scriptsDir, "validate-skills.mjs");

// The CLI must run main() when it is the entry script, no matter whether the
// path it was started through contains a symlink. A symlinked path used to make
// the entry-point guard compare a non-resolved argv[1] with the resolved
// import.meta.url, so main() was skipped and the gate exited 0 with no output.

function writeSkill(root, folder, frontMatter) {
  const dir = path.join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontMatter}\n---\n\nBody.\n`);
}

// Runs `run(scratch)` inside a fresh temp dir and removes it afterwards.
function withScratchDir(run) {
  const scratch = mkdtempSync(path.join(tmpdir(), "nh-skills-main-guard-"));
  try {
    return run(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function makeBadRoot(scratch) {
  const root = path.join(scratch, "bad-root");
  // Folder name and `name` disagree and there is no description: hard fails.
  writeSkill(root, "bad", "name: wrong");
  return root;
}

function makeGoodRoot(scratch) {
  const root = path.join(scratch, "good-root");
  writeSkill(
    root,
    "good",
    "name: good\ndescription: Use when checking that the CLI still reports a clean tree."
  );
  return root;
}

function runCli(entryPath, args) {
  return spawnSync(process.execPath, [entryPath, ...args], { encoding: "utf8" });
}

test("CLI exits 1 and reports hard fails when started through its real path (control)", () => {
  withScratchDir((scratch) => {
    const result = runCli(validatorPath, [makeBadRoot(scratch)]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /HARD FAILS/);
  });
});

test("CLI exits 1 and reports hard fails when started through a symlinked scripts directory", () => {
  withScratchDir((scratch) => {
    const linkedScripts = path.join(scratch, "linked-scripts");
    symlinkSync(scriptsDir, linkedScripts, "dir");

    const result = runCli(path.join(linkedScripts, "validate-skills.mjs"), [makeBadRoot(scratch)]);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /HARD FAILS/);
    assert.match(result.stdout, /\(name\)/);
  });
});

test("CLI exits 1 and reports hard fails when the entry file itself is a symlink", () => {
  withScratchDir((scratch) => {
    const linkedFile = path.join(scratch, "validate.mjs");
    symlinkSync(validatorPath, linkedFile, "file");

    const result = runCli(linkedFile, [makeBadRoot(scratch)]);

    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /HARD FAILS/);
  });
});

test("CLI still prints its report and exits 0 for a clean tree when started through a symlink", () => {
  withScratchDir((scratch) => {
    const linkedScripts = path.join(scratch, "linked-scripts");
    symlinkSync(scriptsDir, linkedScripts, "dir");

    const result = runCli(path.join(linkedScripts, "validate-skills.mjs"), [makeGoodRoot(scratch)]);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Checked 1 SKILL\.md file\(s\)\./);
    assert.match(result.stdout, /All SKILL\.md files passed validation with no findings\./);
  });
});

test("importing the validator through a symlinked path does not run the CLI", () => {
  withScratchDir((scratch) => {
    const linkedScripts = path.join(scratch, "linked-scripts");
    symlinkSync(scriptsDir, linkedScripts, "dir");

    const importer = path.join(scratch, "importer.mjs");
    const linkedModuleUrl = pathToFileURL(path.join(linkedScripts, "validate-skills.mjs")).href;
    writeFileSync(
      importer,
      `import { validateName } from ${JSON.stringify(linkedModuleUrl)};\n` +
        `console.log(typeof validateName);\n`
    );

    // A bad tree is the cwd, so an unwanted main() run would print a report and exit 1.
    const result = spawnSync(process.execPath, [importer], {
      encoding: "utf8",
      cwd: makeBadRoot(scratch),
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, "function\n");
  });
});
