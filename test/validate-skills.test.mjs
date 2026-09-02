import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateName, validateRepo } from "../scripts/validate-skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const validSkillDir = path.join(repoRoot, "fixtures", "valid-skill");
const invalidSkillDir = path.join(repoRoot, "fixtures", "invalid-skill");

test("valid-skill fixture produces zero hard-fail findings", () => {
  const result = validateRepo(validSkillDir);
  assert.equal(result.filesChecked, 1);
  assert.deepEqual(result.hardFails, []);
});

test("invalid-skill fixture produces at least one hard-fail finding", () => {
  const result = validateRepo(invalidSkillDir);
  assert.equal(result.filesChecked, 1);
  assert.ok(
    result.hardFails.length >= 1,
    "expected at least one hard-fail finding for the deliberately broken fixture"
  );
  const rules = result.hardFails.map((f) => f.rule);
  assert.ok(rules.includes("name"), "expected a name/folder-mismatch hard-fail");
  assert.ok(rules.includes("description"), "expected a description-too-long hard-fail");
  assert.ok(rules.includes("file-reference"), "expected a missing-file-reference hard-fail");
});

test("validateName enforces the folder-match and character-set rules directly", () => {
  assert.deepEqual(validateName("good-name", "good-name"), []);
  const errors = validateName("Bad Name!", "good-name");
  assert.ok(errors.length >= 2, "expected both a character-set error and a folder-mismatch error");
});
