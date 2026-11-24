import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

// The Claude Code plugin route and the first-user documents. These tests keep the manifests, the version and the
// README install text in step, so a release cannot ship a plugin that installs an old copy or a README that names a
// command that does not exist.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const pkg = json("package.json");
const plugin = json("nh-chaos-monkey/.claude-plugin/plugin.json");
const marketplace = json(".claude-plugin/marketplace.json");

test("plugin.json names the one skill, carries the package version and the repository licence", () => {
  assert.equal(plugin.name, "nh-chaos-monkey");
  assert.equal(plugin.version, pkg.version, "bump plugin.json and package.json together, or users keep the old copy");
  assert.ok(typeof plugin.description === "string" && plugin.description.length >= 20 && plugin.description.length <= 1024);
  assert.ok(plugin.author && typeof plugin.author.name === "string" && plugin.author.name.length > 0);
  assert.equal(plugin.license, pkg.license);
  assert.match(read("LICENSE"), /Apache License/);
});

test("the plugin is the skill folder itself: SKILL.md at its root, a name that equals the folder, no skills key", () => {
  assert.ok(!("skills" in plugin), "a plugin with SKILL.md at its root loads as a single skill and needs no skills key");
  const front = read("nh-chaos-monkey/SKILL.md").match(/^---\n([\s\S]*?)\n---/);
  assert.ok(front, "SKILL.md must start with frontmatter");
  assert.equal(yaml.load(front[1]).name, "nh-chaos-monkey");
  assert.equal(plugin.name, "nh-chaos-monkey");
});

test("marketplace.json offers exactly that plugin from the repository root, with the version set in one place only", () => {
  assert.equal(marketplace.name, "nh-skills");
  assert.ok(marketplace.owner && typeof marketplace.owner.name === "string");
  assert.equal(marketplace.plugins.length, 1);
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, plugin.name);
  assert.equal(entry.source, "./nh-chaos-monkey", "the skill folder is the plugin, so an install copies only what a manual install copies");
  assert.ok(!("version" in entry), "a version in both files makes plugin.json win and validate warn");
  assert.ok(typeof entry.description === "string" && entry.description.length > 0);
});

test("the README tells users the exact plugin commands that these manifests make true", () => {
  const readme = read("README.md");
  assert.ok(readme.includes("/plugin install " + plugin.name + " --marketplace sairam0424/nh-skills"), "the one-step install command");
  assert.ok(readme.includes("/plugin marketplace add sairam0424/nh-skills"), "the marketplace add command");
  assert.ok(readme.includes("/plugin install " + plugin.name + "@" + marketplace.name), "the two-step install command");
  assert.ok(readme.includes("/" + plugin.name + ":" + plugin.name), "plugin skills are namespaced; the README names the real command");
});

test("the README links the first-user documents, and each exists", () => {
  const readme = read("README.md");
  for (const doc of ["docs/safety.md", "docs/troubleshooting.md", "docs/tester-guide.md", "CHANGELOG.md"]) {
    assert.ok(fs.existsSync(path.join(ROOT, doc)), doc + " must exist");
    assert.ok(readme.includes(doc), "the README must link " + doc);
  }
  for (const heading of [/^#{2,3} Update\b/m, /^#{2,3} Uninstall\b/m, /^#{2,3} Verify what you downloaded\b/m, /^#{2,3} Compatibility\b/m])
    assert.match(readme, heading, "README section " + heading);
});

test("the changelog has an entry for the current version and for each earlier release", () => {
  const log = read("CHANGELOG.md");
  for (const version of [pkg.version, "0.2.0", "0.1.0"]) assert.ok(log.includes("## [" + version + "]"), version + " must have an entry");
});

test("the tester report form exists, asks for the facts the safety research asked testers to report, and is a valid issue form", () => {
  const form = yaml.load(read(".github/ISSUE_TEMPLATE/tester_report.yml"));
  assert.ok(form.name && form.description && Array.isArray(form.body) && form.body.length >= 8);
  const text = JSON.stringify(form.body).toLowerCase();
  for (const topic of ["baseline", "halt", "outside", "sandbox", "probe", "version", "cost"])
    assert.ok(text.includes(topic), "the form must ask about " + topic);
  for (const field of form.body.filter((b) => b.type !== "markdown")) assert.ok(field.id && field.attributes && field.attributes.label, "every field has an id and a label");
});

test("the safety page covers the sections the research said a first release needs", () => {
  const safety = read("docs/safety.md");
  for (const section of [/trusted/i, /containment|sandbox/i, /blast radius/i, /rule of two/i, /OWASP/i, /baseline/i, /abort|halt/i, /verdict/i, /not (tested|reported|stop)|limitations/i])
    assert.match(safety, section, "docs/safety.md must cover " + section);
});
