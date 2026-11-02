import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRepo } from "../scripts/validate-skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.resolve(__dirname, "..", "scripts", "validate-skills.mjs");

const LONG_TEXT = "x".repeat(3000);
const GOOD_DESCRIPTION = "Use when testing the validator.";

// Frontmatter whose `name` or `description` is not a YAML string. The old code
// coerced these with String(): a mapping became "[object Object]" and skipped
// the 1024-char and XML-tag hard-fails, a one-element list became its element,
// and a mapping with its own `toString` key threw an uncaught TypeError that
// aborted the whole scan. Each one must be a reported "must be a string"
// hard-fail on the offending field instead.
const NON_STRING_CASES = [
  {
    label: "description is a mapping holding 3000+ chars and XML tags",
    folder: "demo-skill",
    rule: "description",
    frontmatter: `name: demo-skill\ndescription:\n  text: ${LONG_TEXT}\n  tag: "<b>bold</b>"\n`,
  },
  {
    label: "description is a mapping with its own toString key",
    folder: "demo-skill",
    rule: "description",
    frontmatter: "name: demo-skill\ndescription:\n  toString: x\n",
  },
  {
    label: "description is a list",
    folder: "demo-skill",
    rule: "description",
    frontmatter: `name: demo-skill\ndescription:\n  - ${GOOD_DESCRIPTION}\n`,
  },
  {
    label: "description is an unquoted number",
    folder: "demo-skill",
    rule: "description",
    frontmatter: "name: demo-skill\ndescription: 12345\n",
  },
  {
    label: "description is an unquoted date",
    folder: "demo-skill",
    rule: "description",
    frontmatter: "name: demo-skill\ndescription: 2024-01-01\n",
  },
  {
    label: "name is a one-element list",
    folder: "demo-skill",
    rule: "name",
    frontmatter: `name: [demo-skill]\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
  {
    label: "name is a mapping with its own toString key",
    folder: "demo-skill",
    rule: "name",
    frontmatter: `name:\n  toString: x\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
  {
    label: "name is an unquoted boolean",
    folder: "true",
    rule: "name",
    frontmatter: `name: true\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
  {
    label: "name is an unquoted number",
    folder: "123",
    rule: "name",
    frontmatter: `name: 123\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
];

// Quoted scalars are real YAML strings and must keep passing, even when they
// look like another type.
const STRING_CASES = [
  {
    label: "name is a quoted numeric string",
    folder: "123",
    frontmatter: `name: "123"\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
  {
    label: "name and description are plain strings",
    folder: "demo-skill",
    frontmatter: `name: demo-skill\ndescription: ${GOOD_DESCRIPTION}\n`,
  },
];

function withSkillRoot({ folder, frontmatter }, run) {
  const root = mkdtempSync(path.join(tmpdir(), "nh-skills-nonstring-"));
  try {
    const dir = path.join(root, folder);
    mkdirSync(dir);
    writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}---\n\nBody.\n`);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const testCase of NON_STRING_CASES) {
  test(`validateRepo hard-fails a non-string field instead of coercing it: ${testCase.label}`, () => {
    const result = withSkillRoot(testCase, (root) => validateRepo(root));
    assert.equal(result.filesChecked, 1);
    const messages = result.hardFails
      .filter((f) => f.rule === testCase.rule)
      .map((f) => f.message);
    assert.ok(
      messages.some((m) => m.includes("must be a string")),
      `expected a "must be a string" ${testCase.rule} hard-fail, got: ${JSON.stringify(result.hardFails)}`
    );
  });

  test(`CLI exits 1 with a reported finding and no crash for a non-string field: ${testCase.label}`, () => {
    const run = withSkillRoot(testCase, (root) =>
      spawnSync(process.execPath, [validatorPath, root], { encoding: "utf8" })
    );
    assert.equal(run.stderr, "", `expected no stderr (crash), got:\n${run.stderr}`);
    assert.equal(run.status, 1, `expected exit 1, got ${run.status}\n${run.stdout}`);
    assert.match(run.stdout, /\[FAIL\].*must be a string/);
  });
}

for (const testCase of STRING_CASES) {
  test(`validateRepo still accepts genuine YAML strings: ${testCase.label}`, () => {
    const result = withSkillRoot(testCase, (root) => validateRepo(root));
    assert.equal(result.filesChecked, 1);
    assert.deepEqual(result.hardFails, []);
  });
}
