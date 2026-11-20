# 0001. Adopt Markdown-only skill format with a lint gate

## Status

Accepted — 2026-09-02

## Context and Problem Statement

nh-skills is a personal, curated collection of Claude Code Agent Skills
(`SKILL.md` files), built as our own version of `arpitbbhayani/ape-skills`,
inside the three-project "Not-Humans-Lab" suite (`daily-dose`, `nh-deck`,
`nh-skills`). We need to decide, before writing the first real skill, what
a skill *is* as an artifact: what format it's authored in, what validates
it, and what (if anything) packages or distributes it.

The Agent Skills format's entire value proposition is that a skill is
**zero-runtime**: a directory containing `SKILL.md` (YAML frontmatter +
Markdown body) plus optional `scripts/`, `references/`, and `assets/`.
Both the reference project we're modeling ourselves on and the two
existing third-party installation paths — `npx skills add` and a manual
`cp -r` into `~/.claude/skills/` — already work off directory structure
alone. Any decision that adds required tooling on top of that risks
undermining the exact property worth preserving.

At the same time, a repo of hand-authored `SKILL.md` files accumulates
drift without enforcement: inconsistent frontmatter, a skill's `name`
field silently diverging from its folder name (which breaks
`npx skills add` path resolution), descriptions that are empty or exceed
practical length limits, duplicate names across skills, and body text that
references files that don't actually exist on disk. We need *some*
validation, but it must not compromise the zero-runtime nature of the
artifacts themselves.

## Decision Drivers

- **Preserve zero-runtime skill artifacts.** The Markdown+YAML format with
  no required runtime is the whole point of the Agent Skills format and
  the specific thing worth carrying over from `ape-skills`. Any option
  that adds a mandatory build step, schema compiler, or runtime dependency
  to the skill artifact itself is disqualified on principle (YAGNI/KISS —
  don't build infrastructure the format doesn't need).
- **Protect third-party installer compatibility.** Both `npx skills add`
  and manual `cp -r` resolve purely off `<skill-name>/SKILL.md` directory
  layout. The `name` field in frontmatter must match its containing
  folder name, or installation breaks silently for consumers — this needs
  to be a hard-fail check, not a convention we hope people follow.
  (Author's rule: "Validate input at system boundaries" — the boundary here is
  the frontmatter/folder-name contract.)
- **Minimize dependency surface.** Per the author's coding-style and
  security rules (DRY, KISS, no unnecessary dependencies), the validator
  should carry the fewest possible dependencies, and definitely should not
  require anything beyond Node.js (already a workspace-wide baseline
  tool) to run.
- **No dedicated test framework overhead.** Per the author's testing rules
  (test-first discipline, but also YAGNI), a fixture-based self-test suite
  for a single ~200-400 line validator script does not need Jest, Vitest,
  or pytest — Node's built-in `node:test` is sufficient and adds zero
  dependencies.
- **CI must gate on the artifact that matters.** The lint job should run
  exactly where drift can be introduced: any PR touching `**/SKILL.md`.
  Running it more broadly (e.g., on every PR regardless of files touched)
  would waste CI minutes on unrelated changes; running it less broadly
  would leave a gap.
- **License consistency across the three-project suite.** Apache-2.0 was
  already decided once at the system level and applies identically across
  `daily-dose`, `nh-deck`, and `nh-skills` for enterprise-clearable,
  patent-safe consistency — this ADR does not revisit that, only notes it
  as a fixed constraint.

## Considered Options

1. **Pure Markdown + YAML frontmatter, validated by a single
   dependency-light Node.js script (`scripts/validate-skills.mjs`, one
   devDependency: `js-yaml`), gated by one GitHub Actions job on PRs
   touching `**/SKILL.md`. No manifest file, no packaging tooling.**
2. **A heavier JSON-Schema + `ajv` approach** — define the frontmatter
   contract as a formal JSON Schema document, validate with `ajv`.
3. **A Python + pytest validator** — write the lint checks in Python,
   using pytest as the test runner for both the checks and their
   fixture-based self-tests.
4. **Add a manifest file** (e.g., a repo-root `skills.json` or per-skill
   `manifest.json`) that indexes every skill's metadata, in addition to
   (or instead of relying on) directory layout for discovery.

## Decision Outcome

Chosen option: **Option 1 — pure Markdown + YAML frontmatter, single
Node.js validator script, one GitHub Actions lint job, no manifest.**

Rationale, directly from the decision drivers above:

- Directory layout (`<skill-name>/SKILL.md` plus optional `scripts/`,
  `references/`, `assets/`) is already sufficient for both installation
  paths (`npx skills add` and manual `cp -r`) — a manifest file (Option 4)
  would be a second source of truth for information the directory
  structure already encodes, with no consumer that currently needs it.
  Rejected as unnecessary infrastructure (YAGNI).
- A JSON-Schema + `ajv` approach (Option 2) is a reasonable way to
  formalize the frontmatter contract, but it's heavier than this repo's
  actual validation needs: the checks required (delimiter/YAML validity,
  required fields, name format rules, name/folder match, description
  constraints, duplicate detection, dead-reference detection) are
  straightforward imperative checks, not a deeply nested schema with
  cross-field conditional logic that would benefit from a schema compiler.
  Adding `ajv` as a second dependency for marginal benefit over
  hand-written checks contradicts "minimize dependency surface."
- A Python + pytest validator (Option 3) would introduce a second
  language/toolchain into a repo whose only other tooling need is a
  single lint script — there is no other Python in this project, and
  Node.js is already the natural choice since `npx skills add` (the
  installer we must stay compatible with) is itself a Node/npm-ecosystem
  tool. Introducing Python here would violate the workspace's polyrepo
  convention of "one primary toolchain per project, chosen for fit"
  (see root `CLAUDE.md`) for no offsetting benefit.
- `js-yaml` is accepted as the one unavoidable dependency because Node.js
  has no built-in YAML parser and frontmatter must be parsed correctly
  (not regex-scraped) to validate it reliably.
- `node:test` (built-in, zero additional dependency) is sufficient for the
  validator's own fixture-based self-tests — there is no need for
  Jest/Vitest/pytest for a single-file test suite exercising a single
  script.
- Gating the GitHub Actions job on `**/SKILL.md` (not "every PR") keeps CI
  focused and fast, and matches the actual blast radius of what can drift.

## Consequences

**Good:**

- Skill artifacts remain exactly what the Agent Skills format intends:
  zero-runtime Markdown + YAML, portable by simple file copy, with no
  build step required to *use* a skill.
- The dependency surface for the entire repo is one devDependency
  (`js-yaml`), used only by tooling, never by the artifacts themselves.
- The hard-fail checks (especially name/folder-name matching) protect the
  exact failure mode that would silently break third-party installation —
  caught in CI before merge, not discovered by a confused end user.
- The validator doubles as living documentation of what a valid skill
  looks like, since its checks are the authoritative spec (referenced from
  `SUPPORT.md`).
- No premature packaging/manifest infrastructure to maintain or keep in
  sync with reality.

**Bad:**

- Because there is no manifest, there is currently no single machine-
  readable index of "every skill and its metadata" without walking the
  directory tree — if a future consumer needs that (e.g., a search UI),
  it will have to be generated (possibly by extending the validator) rather
  than read off an existing file.
- Structural/schema lint does not catch semantic problems: a `SKILL.md`
  can pass every hard-fail check and still contain bad instructions,
  prompt-injection risk, or an unsafe bundled script — the validator is
  explicitly not a security scanner (see `SECURITY.md`), so that gap is
  covered by human review, not automation, for now.
- Choosing Node.js/`node:test` over a schema-driven approach means
  frontmatter contract changes are hand-coded checks in JS rather than a
  declarative schema document — slightly less self-documenting than a
  JSON Schema file would be, though the tradeoff was accepted deliberately
  per the decision drivers above.

## Confirmation

This decision is confirmed as implemented when:

1. `scripts/validate-skills.mjs` exists, has exactly one devDependency
   (`js-yaml`), and implements every hard-fail and soft-warn check listed
   in `status.md` / the task context this ADR was written from.
2. The validator's own fixture-based self-tests run via `node:test` (no
   Jest/Vitest/pytest) and cover at least: a valid skill, invalid/missing
   frontmatter, a name/folder-name mismatch, an empty or oversized
   description, a duplicate name across two skills, and a dead file
   reference.
3. A GitHub Actions workflow runs the validator as a required check on
   every PR that touches `**/SKILL.md`, and that workflow is observed to
   fail a deliberately broken test PR and pass a correct one.
4. `nh-commit` — the walking-skeleton skill — passes the validator locally
   and merges only after the CI lint job passes, proving the full loop.

## More Information

- Source reasoning for this ADR is the TECH_DECISION context captured
  during Phase 1 planning for nh-skills; this document formalizes that
  reasoning in Michael Nygard's ADR format and does not introduce new
  rationale beyond it.
- Reference project this repo models itself on:
  `arpitbbhayani/ape-skills`.
- Cross-cutting, system-level conventions shared with the sibling projects
  (`daily-dose`, `nh-deck`) — including the Apache-2.0 license decision —
  live in the separate docs-only meta-repo at `../Not-Humans-Lab/`; this
  ADR does not duplicate that content.
- See `decisions.md` (this repo, root) for the ADR index and the
  lightweight decisions log this ADR is tracked in.
- See `SECURITY.md` for how this decision interacts with the (planned)
  SHA-256 integrity-manifest scheme and prompt-injection review
  requirements — the lint gate this ADR establishes is a prerequisite for,
  but not a substitute for, that future work.

## Status note (2026-11-02)

The walking-skeleton skill named in acceptance criterion 4, `nh-commit`, met
it at the time and has since been removed so the collection can start fresh
with `nh-breaker`. The decision recorded in this ADR is unchanged.
