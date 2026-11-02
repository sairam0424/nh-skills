# AGENTS.md — nh-skills

This file follows the vendor-neutral [AGENTS.md](https://agents.md) open specification. It is the operational instruction manual for this repository — what to run, where things live, and what not to do.

## Overview

nh-skills is a personal, curated collection of [Claude Code Agent Skills](https://docs.claude.com/en/docs/claude-code/skills) — `SKILL.md` files with YAML frontmatter, one directory per skill. It is the author's own version of [arpitbbhayani/ape-skills](https://github.com/arpitbbhayani/ape-skills).

nh-skills is one of three independent sibling projects (daily-dose, nh-deck, nh-skills) under the **Not-Humans-Lab** umbrella. Not-Humans-Lab (`../Not-Humans-Lab/`) is a docs-only meta-repo holding cross-cutting system-level decisions (license, branch strategy, testing skeleton). This repo is its own standalone GitHub repository — not nested inside Not-Humans-Lab — and is the source of truth for everything specific to nh-skills. Cross-cutting conventions are linked by relative path, never duplicated:

- License rationale: `../Not-Humans-Lab/decisions.md`
- Branch/commit/PR template: `Branches.md` (copied verbatim from Not-Humans-Lab; canonical source is `../Not-Humans-Lab/Branches.md`)
- Testing skeleton: `../Not-Humans-Lab/TESTING.md`
- System architecture (C4 Level 1): `../Not-Humans-Lab/architecture.md`

## Skill Format

Zero runtime for the skill artifacts themselves — that is the entire point of the Agent Skills format and the thing worth preserving from the reference project. Every skill is pure Markdown + YAML frontmatter:

```
<skill-name>/
  SKILL.md          (required — frontmatter + body)
  scripts/          (optional)
  references/       (optional)
  assets/           (optional)
```

No manifest file, no package.json per skill, no build step. Third-party installers (`npx skills add`) and manual `cp -r` into `~/.claude/skills/` already work off directory structure alone.

**Where the skill schema lives:** this document (frontmatter field requirements, directory layout) plus `scripts/validate-skills.mjs` (the executable, authoritative encoding of the same rules). If the two ever disagree, the validator is correct until this file is updated to match — do not let them drift silently.

## Setup

```bash
npm install
```

One devDependency: `js-yaml` (frontmatter parsing). No other runtime or build dependency exists in this repo.

## Build / Test / Run Commands

There is no build step (no compilation, no bundling — the skill artifacts ship as-is).

- **Lint/validate all skills**: `npm run validate`
  This is the required command before proposing any skill-related change as done. It runs `scripts/validate-skills.mjs` against every `**/SKILL.md` in the repo.
- **Run the validator's own self-tests**: `npm test`
  Fixture-based tests for the validator script itself, using Node's built-in `node:test` (no Jest/Vitest/pytest — see `../Not-Humans-Lab/TESTING.md` for why this project deviates from the workspace's usual test-framework pattern: the validator script is the entire test surface here).
- **CI**: `validate-skills.yml` runs `npm ci`, `npm audit --audit-level=high`, `npm run validate` and `npm test` on PRs and pushes to `main` that touch skills, the validator, its tests or fixtures, the package files, or the workflow itself. `gitleaks.yml` runs a secret scan on every PR and push to `main`. Dependabot proposes weekly npm and GitHub Actions updates. Every third-party action is pinned to a full commit SHA that was checked against its upstream tag, and workflow token permissions are read-only. CodeQL is deliberately not enabled: this repository is private without code scanning, so it would fail on upload (revisit if the repository becomes public).

## Code Style

- Skill frontmatter and body: plain Markdown + YAML, no templating language, no embedded code fences that aren't genuinely illustrative.
- `scripts/validate-skills.mjs`: plain Node.js (ESM, `.mjs`), no TypeScript, no build step — kept dependency-light on purpose (see `../Not-Humans-Lab/decisions.md` for the "small enough on its own, don't add tooling speculatively" convention this repo follows).
- Follow the global coding-style rules already in force for this workspace (KISS, DRY, YAGNI, immutability, descriptive naming) for any code in `scripts/`.

## Directory Map

```
nh-skills/
  AGENTS.md              — this file
  CLAUDE.md               — Claude Code addendum (imports this file)
  SOUL.md                  — behavioral/identity charter (curatorial restraint)
  Context.md               — living state-of-the-world doc
  package.json              — validate/test scripts + js-yaml devDependency
  scripts/
    validate-skills.mjs      — the linter (frontmatter schema + structural checks)
  fixtures/
    valid-skill/SKILL.md      — validator fixture, must pass with zero hard-fails
    invalid-skill/SKILL.md     — validator fixture, must fail with >=1 hard-fail
  test/
    validate-skills.test.mjs   — fixture-based self-tests (node:test)
  .github/workflows/
    validate-skills.yml       — CI job, triggers on **/SKILL.md changes
  <skill-name>/
    SKILL.md                   — one per skill
    scripts/ references/ assets/ (optional, per skill)
```

## Commit & PR Conventions

Same template as every sibling project in this suite — see this repo's own `Branches.md` (Conventional Commits, trunk-based/GitHub Flow, squash-merge only, PR required even for solo work), copied verbatim from `../Not-Humans-Lab/Branches.md` since each repo is independent and cannot rely on a cross-repo relative path surviving a standalone clone. Summary:

- Branch naming: `type/scope-slug` (e.g. `feat/skills-nh-breaker`, `fix/skills-frontmatter-validation`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org) — required, drives changelog/versioning.
- Every skill addition/edit goes through a PR, even solo. CI (`npm run validate`) must pass before merge.
- Squash-merge only; the squash commit message must itself be a valid Conventional Commit.

## Security Notes

- License: Apache-2.0 (decided once at the Not-Humans-Lab system level, applied identically across daily-dose/nh-deck/nh-skills — see `../Not-Humans-Lab/decisions.md`).
- Never commit secrets, API keys, or credentials — this applies to skill `scripts/` and `references/` content too, not just repo config.
- **Mandatory security-review step**: any skill whose `SKILL.md` body instructs an agent to shell out (invoke `Bash`/subprocess execution) or call the network (fetch a URL, hit an API) MUST get an explicit security review before merging — read `security-reviewer.md` conventions and run a security-scan pass over that skill's instructions specifically. This is not optional and is not satisfied by `npm run validate` alone, since the validator checks structure and schema, not intent or safety of what a skill tells an agent to do. Do not merge such a skill on validator-pass alone.
- The validator's file-reference check (every relative path a `SKILL.md` body references must exist on disk) is a correctness check, not a security boundary — it does not substitute for the security-review step above.

## Known Gotchas

- **Name-to-folder matching is load-bearing.** `npx skills add` and other third-party installers resolve skills by directory name. A skill's frontmatter `name` field must exactly match its containing folder name, or installation will silently break for consumers. The validator hard-fails on this — do not weaken or bypass it.
- **No manifest file, ever, unless a real distribution need forces it.** Adding a manifest "just in case" contradicts the zero-runtime decision behind this project. See `Context.md` roadmap for the actual revisit threshold (~30-40 skills or outside contributors).
- **Duplicate skill names anywhere in the repo are a hard-fail**, not just within a directory — the validator scans the whole repo, since consumers install by name into a flat namespace (`~/.claude/skills/<name>/`).
- **Descriptions over ~900 chars trigger a soft warning**, not a hard-fail, because the real ceiling is 1024 — but writing right up to the ceiling leaves no room for later refinement without a breaking rewrite.
