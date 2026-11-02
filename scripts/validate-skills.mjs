#!/usr/bin/env node
// Validates every SKILL.md in the repo against the nh-skills frontmatter
// schema and structural conventions. See fixtures/ for minimal examples of
// what passes (valid-skill) and what fails (invalid-skill).
//
// Usage: node scripts/validate-skills.mjs [rootDir]
// Exit code: non-zero if any hard-fail finding exists. Soft warnings never
// affect the exit code.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// "fixtures" is excluded from the repo-wide scan because
// fixtures/invalid-skill/SKILL.md is intentionally malformed test data for
// this validator's own self-tests (see test/validate-skills.test.mjs, which
// points validateRepo() directly at each fixtures/* subdirectory). Without
// this exclusion, `npm run validate` would permanently hard-fail on its own
// test fixture.
const IGNORED_DIRS = new Set(["node_modules", ".git", "fixtures"]);

const NAME_MAX_LENGTH = 64;
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_NAMES = new Set(["claude", "anthropic", "skill", "skills"]);

const DESCRIPTION_MAX_LENGTH = 1024;
const DESCRIPTION_WARN_LENGTH = 900;
// Tag names follow the XML Name production: a letter or "_" first, then
// letters, digits, "_", ":", "." or "-". The optional "/" before ">" covers
// self-closing tags with no space before the slash, e.g. "<br/>".
const XML_TAG_PATTERN = /<\/?[a-zA-Z_][a-zA-Z0-9_:.-]*(\s[^<>]*)?\/?>/;
const WHEN_TO_USE_PATTERN = /\buse\s+(this\s+)?(skill\s+)?when\b|\bwhen\s+to\s+use\b/i;

const BODY_LINE_WARN_THRESHOLD = 500;

// Heuristic: only treat backtick spans that contain a "/" as file-path
// references, so prose like `Node.js` or `SKILL.md` is never mistaken for a
// broken relative link.
const INLINE_CODE_PATH_PATTERN = /`([\w.\-]+(?:\/[\w.\-]+)+\.[A-Za-z0-9]+)`/g;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Classify a directory entry as "directory", "file" or "other". Dirent reports
 * a symlink as none of these, so a symlink is resolved with statSync to the
 * type of its target. A link that cannot be resolved (dangling or looping) is
 * "file" when it is named SKILL.md, so validateSkillFile reports it instead of
 * the scan skipping it, and "other" for any other name.
 */
function classifyEntry(entry, fullPath) {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return "other";
  try {
    const target = statSync(fullPath);
    if (target.isDirectory()) return "directory";
    if (target.isFile()) return "file";
    return "other";
  } catch {
    return entry.name === "SKILL.md" ? "file" : "other";
  }
}

function walkForSkillFiles(dir, ancestorRealPaths) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const kind = classifyEntry(entry, fullPath);
    if (kind === "directory") {
      const realPath = realpathSync(fullPath);
      // A link back to a directory already being scanned would recurse
      // forever; every skill below it is already covered by the outer scan.
      if (ancestorRealPaths.has(realPath)) continue;
      results.push(...walkForSkillFiles(fullPath, new Set([...ancestorRealPaths, realPath])));
    } else if (kind === "file" && entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Recursively find every SKILL.md file under rootDir, excluding
 * node_modules and .git. Symlinked SKILL.md files and symlinked skill
 * directories are followed, so they are validated like any other skill.
 */
export function findSkillFiles(rootDir) {
  return walkForSkillFiles(rootDir, new Set([realpathSync(rootDir)]));
}

/**
 * Split raw SKILL.md content into { frontmatterText, body }. Sets `error`
 * when the "---" delimiters are missing or malformed.
 */
export function splitFrontmatter(content) {
  if (!content.startsWith("---")) {
    return {
      frontmatterText: null,
      body: null,
      error: 'File must start with a "---" frontmatter delimiter',
    };
  }
  // The first "---" line after the opener closes the block. The lazy `??`
  // tries the closer on the very next line first: that line has no newline
  // before it (the opener consumed it), so without this branch an empty block
  // ("---\n---") would never close and the scan would run on to a later "---",
  // leaving a stray "---" as the first line of the captured frontmatter.
  const match = content.match(/^---\r?\n(?:([\s\S]*?)\r?\n)??---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatterText: null,
      body: null,
      error: 'Could not find a closing "---" frontmatter delimiter',
    };
  }
  return { frontmatterText: match[1] ?? "", body: match[2], error: null };
}

/**
 * Parse frontmatter YAML text into an object. Sets `error` on invalid YAML
 * or when the YAML does not resolve to a plain object.
 */
export function parseFrontmatterYaml(frontmatterText) {
  let data;
  try {
    data = yaml.load(frontmatterText);
  } catch (err) {
    return { data: null, error: `Invalid YAML: ${err.message}` };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { data: null, error: "Frontmatter YAML must parse to an object" };
  }
  return { data, error: null };
}

/**
 * Name the YAML type of a parsed frontmatter value for error messages.
 * Never calls toString on the value: a mapping may define its own
 * `toString` key.
 */
function describeYamlType(value) {
  if (Array.isArray(value)) return "list";
  if (value instanceof Date) return "date";
  if (typeof value === "object") return "mapping";
  return typeof value;
}

/**
 * Validate the `name` frontmatter field. Returns an array of hard-fail
 * message strings (empty array means valid).
 *
 * The value must be a real YAML string. Coercing it with String() would
 * turn a mapping into "[object Object]", unwrap a one-element list, or throw
 * on a mapping that defines its own `toString` key.
 */
export function validateName(name, folderName) {
  const errors = [];
  if (name === undefined || name === null || (typeof name === "string" && name.trim() === "")) {
    errors.push('Missing required frontmatter field "name"');
    return errors;
  }
  if (typeof name !== "string") {
    errors.push(`"name" must be a string (got ${describeYamlType(name)})`);
    return errors;
  }
  if (name.length > NAME_MAX_LENGTH) {
    errors.push(`"name" exceeds ${NAME_MAX_LENGTH} characters (got ${name.length})`);
  }
  if (!NAME_PATTERN.test(name)) {
    errors.push(
      '"name" must contain only lowercase letters, digits, and hyphens (no XML/special characters, no leading, trailing, or double hyphens)'
    );
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    errors.push(`"name" must not be a reserved word ("${name}")`);
  }
  if (folderName !== undefined && name !== folderName) {
    errors.push(`"name" ("${name}") must match its containing folder name ("${folderName}")`);
  }
  return errors;
}

/**
 * Validate the `description` frontmatter field. Returns
 * { errors, warnings } arrays of message strings.
 *
 * Like `name`, the value must be a real YAML string; a non-string would
 * otherwise bypass the length and XML-tag checks once coerced.
 */
export function validateDescription(description) {
  const errors = [];
  const warnings = [];
  if (
    description === undefined ||
    description === null ||
    (typeof description === "string" && description.trim() === "")
  ) {
    errors.push('Missing required frontmatter field "description"');
    return { errors, warnings };
  }
  if (typeof description !== "string") {
    errors.push(`"description" must be a string (got ${describeYamlType(description)})`);
    return { errors, warnings };
  }
  const descStr = description;
  if (descStr.length > DESCRIPTION_MAX_LENGTH) {
    errors.push(`"description" exceeds ${DESCRIPTION_MAX_LENGTH} characters (got ${descStr.length})`);
  }
  if (XML_TAG_PATTERN.test(descStr)) {
    errors.push('"description" must not contain XML-like tags');
  }
  if (descStr.length > DESCRIPTION_WARN_LENGTH && descStr.length <= DESCRIPTION_MAX_LENGTH) {
    warnings.push(
      `"description" is approaching the ${DESCRIPTION_MAX_LENGTH}-char ceiling (${descStr.length} chars)`
    );
  }
  if (!WHEN_TO_USE_PATTERN.test(descStr)) {
    warnings.push('"description" is missing an explicit "when to use" clause');
  }
  return { errors, warnings };
}

function isRelativeFileReference(ref) {
  if (!ref) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(ref)) return false; // scheme://...
  if (ref.startsWith("mailto:")) return false;
  if (ref.startsWith("#")) return false;
  if (ref.startsWith("/")) return false; // absolute paths are out of scope
  return true;
}

/**
 * Extract candidate relative file-path references from a SKILL.md body:
 * markdown links `[text](path)` and backtick paths containing a "/".
 */
export function extractRelativeFileReferences(body) {
  const refs = new Set();
  for (const match of body.matchAll(MARKDOWN_LINK_PATTERN)) {
    if (isRelativeFileReference(match[1])) refs.add(match[1]);
  }
  for (const match of body.matchAll(INLINE_CODE_PATH_PATTERN)) {
    if (isRelativeFileReference(match[1])) refs.add(match[1]);
  }
  return [...refs];
}

/**
 * Resolve each candidate reference against skillDir and return the ones
 * that do not exist on disk.
 */
export function findMissingFileReferences(body, skillDir) {
  const missing = [];
  for (const ref of extractRelativeFileReferences(body)) {
    const cleanRef = ref.split("#")[0];
    if (!cleanRef) continue;
    if (!existsSync(path.resolve(skillDir, cleanRef))) {
      missing.push(ref);
    }
  }
  return missing;
}

/**
 * Soft-warn when the SKILL.md body exceeds the progressive-disclosure line
 * budget. Returns a message string, or null when within budget.
 */
export function checkBodyLength(body) {
  const lineCount = body.split("\n").length;
  if (lineCount > BODY_LINE_WARN_THRESHOLD) {
    return `SKILL.md body is ${lineCount} lines (over the ${BODY_LINE_WARN_THRESHOLD}-line soft ceiling) — consider moving detail into a referenced file`;
  }
  return null;
}

/**
 * Run the body-derived checks (file references + body length) that apply
 * regardless of whether the frontmatter YAML itself parsed successfully.
 */
function checkBodyRules(body, skillDir, relPath) {
  const hardFails = [];
  const softWarns = [];
  for (const ref of findMissingFileReferences(body, skillDir)) {
    hardFails.push({
      file: relPath,
      rule: "file-reference",
      message: `Referenced file does not exist on disk: "${ref}"`,
    });
  }
  const bodyWarning = checkBodyLength(body);
  if (bodyWarning) {
    softWarns.push({ file: relPath, rule: "body-length", message: bodyWarning });
  }
  return { hardFails, softWarns };
}

/**
 * Validate a single SKILL.md file. Returns
 * { hardFails, softWarns, name, folderName }.
 */
export function validateSkillFile(filePath, rootDir) {
  const relPath = path.relative(rootDir, filePath);
  const skillDir = path.dirname(filePath);
  const folderName = path.basename(skillDir);
  const hardFails = [];
  const softWarns = [];

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    // E.g. a SKILL.md symlink whose target is missing: report it, don't crash.
    hardFails.push({ file: relPath, rule: "unreadable", message: `Cannot read SKILL.md: ${err.message}` });
    return { hardFails, softWarns, name: null, folderName };
  }
  const { frontmatterText, body, error: delimiterError } = splitFrontmatter(content);
  if (delimiterError) {
    hardFails.push({ file: relPath, rule: "frontmatter-delimiters", message: delimiterError });
    return { hardFails, softWarns, name: null, folderName };
  }

  const { data, error: yamlError } = parseFrontmatterYaml(frontmatterText);
  const bodyResult = checkBodyRules(body, skillDir, relPath);
  hardFails.push(...bodyResult.hardFails);
  softWarns.push(...bodyResult.softWarns);

  if (yamlError) {
    hardFails.push({ file: relPath, rule: "frontmatter-yaml", message: yamlError });
    return { hardFails, softWarns, name: null, folderName };
  }

  for (const message of validateName(data.name, folderName)) {
    hardFails.push({ file: relPath, rule: "name", message });
  }

  const { errors: descErrors, warnings: descWarnings } = validateDescription(data.description);
  for (const message of descErrors) {
    hardFails.push({ file: relPath, rule: "description", message });
  }
  for (const message of descWarnings) {
    softWarns.push({ file: relPath, rule: "description", message });
  }

  // Only a genuine string feeds the repo-wide duplicate-name check; a
  // non-string name was already reported by validateName above.
  const name = typeof data.name === "string" ? data.name : null;
  return { hardFails, softWarns, name, folderName };
}

/**
 * Validate every SKILL.md under rootDir, including the repo-wide
 * duplicate-name check. Returns { hardFails, softWarns, filesChecked }.
 */
export function validateRepo(rootDir) {
  const files = findSkillFiles(rootDir);
  const hardFails = [];
  const softWarns = [];
  const filesByName = new Map();

  for (const filePath of files) {
    const result = validateSkillFile(filePath, rootDir);
    hardFails.push(...result.hardFails);
    softWarns.push(...result.softWarns);
    if (result.name) {
      const relPath = path.relative(rootDir, filePath);
      if (!filesByName.has(result.name)) filesByName.set(result.name, []);
      filesByName.get(result.name).push(relPath);
    }
  }

  for (const [name, filesWithName] of filesByName) {
    if (filesWithName.length <= 1) continue;
    for (const file of filesWithName) {
      const others = filesWithName.filter((f) => f !== file).join(", ");
      hardFails.push({
        file,
        rule: "duplicate-name",
        message: `Duplicate skill name "${name}" also used by: ${others}`,
      });
    }
  }

  return { hardFails, softWarns, filesChecked: files.length };
}

/**
 * Render a human-readable report for a validateRepo() result.
 */
export function formatReport({ hardFails, softWarns, filesChecked }) {
  const lines = [`Checked ${filesChecked} SKILL.md file(s).`, ""];

  if (hardFails.length) {
    lines.push(`HARD FAILS (${hardFails.length}):`);
    for (const f of hardFails) {
      lines.push(`  [FAIL] ${f.file} — (${f.rule}) ${f.message}`);
    }
    lines.push("");
  }

  if (softWarns.length) {
    lines.push(`SOFT WARNINGS (${softWarns.length}):`);
    for (const w of softWarns) {
      lines.push(`  [WARN] ${w.file} — (${w.rule}) ${w.message}`);
    }
    lines.push("");
  }

  if (!hardFails.length && !softWarns.length) {
    lines.push("All SKILL.md files passed validation with no findings.");
  } else if (!hardFails.length) {
    lines.push("No hard failures. Soft warnings above are non-blocking.");
  }

  return lines.join("\n");
}

/**
 * CLI entry point. Returns the process exit code (0 = success).
 */
export function main(rootDir = process.cwd()) {
  const result = validateRepo(rootDir);
  console.log(formatReport(result));
  return result.hardFails.length === 0 ? 0 : 1;
}

/**
 * True when this file is the script node was started with. Node resolves
 * import.meta.url to the real path, so argv[1] must be resolved the same way or
 * a symlinked invocation path would skip main() and exit 0 without a report.
 */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === realpathSync(modulePath);
  } catch {
    // An entry path that cannot be resolved on disk cannot be this file; fall
    // back to the plain path comparison.
    return path.resolve(entry) === modulePath;
  }
}

if (isMainModule()) {
  const rootDirArg = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  process.exit(main(rootDirArg));
}
