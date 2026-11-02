import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatterYaml, splitFrontmatter, validateRepo } from "../scripts/validate-skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.resolve(__dirname, "..", "scripts", "validate-skills.mjs");

const FIELDS = "name: demo-skill\ndescription: Use when checking a doubled opening delimiter.\n";

// A second "---" on the line right after the opener closes an EMPTY frontmatter
// block, so name and description are body text. The old closing-delimiter
// pattern needed a newline before the closer, never tested that line, and ran
// on to the later "---". js-yaml then took the stray leading "---" as a YAML
// document-start marker, parsed the fields, and the skill passed.
const DOUBLED_OPENER_CASES = [
  { label: "LF line endings", eol: "\n" },
  { label: "CRLF line endings", eol: "\r\n" },
];

function skillText(eol, parts) {
  return parts.join("\n").replaceAll("\n", eol);
}

function doubledOpenerSkill(eol) {
  return skillText(eol, ["---", "---", FIELDS + "---", "", "Body.", ""]);
}

function withSkillRoot(content, run) {
  const root = mkdtempSync(path.join(tmpdir(), "nh-skills-doubled-delim-"));
  try {
    const dir = path.join(root, "demo-skill");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "SKILL.md"), content);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const { label, eol } of DOUBLED_OPENER_CASES) {
  test(`splitFrontmatter closes at the second delimiter, leaving the block empty: ${label}`, () => {
    const split = splitFrontmatter(doubledOpenerSkill(eol));
    assert.equal(split.error, null);
    assert.equal(split.frontmatterText, "");
    assert.ok(
      split.body.startsWith("name: demo-skill"),
      `expected the fields to be body text, got: ${JSON.stringify(split.body)}`
    );
    assert.equal(parseFrontmatterYaml(split.frontmatterText).data, null);
  });

  test(`validateRepo hard-fails a doubled opening delimiter instead of reading fields from the body: ${label}`, () => {
    const result = withSkillRoot(doubledOpenerSkill(eol), (root) => validateRepo(root));
    assert.equal(result.filesChecked, 1);
    assert.ok(result.hardFails.length >= 1, "expected a hard-fail, got none");
    assert.ok(
      result.hardFails.every((f) => f.rule.startsWith("frontmatter-")),
      `expected only frontmatter findings, got: ${JSON.stringify(result.hardFails)}`
    );
  });

  test(`CLI exits 1 and reports a frontmatter hard-fail for a doubled opening delimiter: ${label}`, () => {
    const run = withSkillRoot(doubledOpenerSkill(eol), (root) =>
      spawnSync(process.execPath, [validatorPath, root], { encoding: "utf8" })
    );
    assert.equal(run.status, 1, `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /HARD FAILS/);
    assert.match(run.stdout, /\(frontmatter-/);
  });
}

test("CLI exits 1 for a doubled opening delimiter followed by nothing else", () => {
  const run = withSkillRoot("---\n---", (root) =>
    spawnSync(process.execPath, [validatorPath, root], { encoding: "utf8" })
  );
  assert.equal(run.status, 1, `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`);
});

test("CLI exits 1 for a tripled opening delimiter", () => {
  const run = withSkillRoot(`---\n---\n---\n${FIELDS}---\n\nBody.\n`, (root) =>
    spawnSync(process.execPath, [validatorPath, root], { encoding: "utf8" })
  );
  assert.equal(run.status, 1, `expected exit 1, got ${run.status}\n${run.stdout}${run.stderr}`);
});

// Well-formed shapes the closing-delimiter change must keep splitting exactly
// as before.
test("splitFrontmatter still returns the fields between the delimiters", () => {
  const split = splitFrontmatter(`---\n${FIELDS}---\n\nBody.\n`);
  assert.equal(split.error, null);
  assert.equal(split.frontmatterText, FIELDS.slice(0, -1));
  assert.equal(split.body, "\nBody.\n");
});

test("splitFrontmatter still returns the fields for CRLF files", () => {
  const split = splitFrontmatter(skillText("\r\n", ["---", FIELDS + "---", "", "Body.", ""]));
  assert.equal(split.error, null);
  assert.equal(split.frontmatterText, FIELDS.slice(0, -1).replaceAll("\n", "\r\n"));
  assert.equal(split.body, "\r\nBody.\r\n");
});

test("splitFrontmatter still reports a missing closing delimiter", () => {
  const split = splitFrontmatter(`---\n${FIELDS}\nBody without a closer.\n`);
  assert.match(split.error, /closing "---"/);
});

test("validateRepo still accepts a skill whose body contains a horizontal rule", () => {
  const content = `---\n${FIELDS}---\n\nIntro.\n\n---\n\nAfter the rule.\n`;
  const result = withSkillRoot(content, (root) => validateRepo(root));
  assert.equal(result.filesChecked, 1);
  assert.deepEqual(result.hardFails, []);
});
