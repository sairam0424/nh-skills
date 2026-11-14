# Codebase Map — nh-skills

A literal, navigable tour of this repo only. This does not cover nh-deck,
daily-dose, or Not-Humans-Lab — each is its own repo/doc set. Reflects the
shipped Phase 1+2 layout — the walking skeleton is complete and live at
github.com/sairam0424/nh-skills with green CI, not a plan.

## Bird's-eye view

```
nh-skills/
├── memory.md                      agent-writable lessons index
├── tech.md                         tech stack inventory
├── architecture.md                 this project's own architecture doc
├── codebase_map.md                 this file
├── agent_learning.md               corrections register (see also ../Not-Humans-Lab/agent_learning.md)
├── anti-patterns.md                 recurring-bad-pattern catalog (empty so far)
├── Branches.md                      branch/commit/PR strategy, copied verbatim from Not-Humans-Lab
├── package.json                    declares js-yaml devDependency + npm scripts (validate, test)
├── nh-chaos-monkey/                 the one shipped skill (merged via PR #4 as nh-breaker)
│   ├── SKILL.md                    bounded chaos-monkey loop skill (find, fix, re-verify)
│   ├── learning.md                 A/B and verification journal (skill-ab-improver)
│   ├── references/                 five docs: chaos principles, judge protocol, lens catalogue, loop design, safety runner
│   └── scripts/                    chaos-loop.js (a Claude Code Workflow script) and sandbox-probe.mjs (a CLI)
├── scripts/
│   └── validate-skills.mjs         the validator — the repo's one lint layer
├── fixtures/
│   ├── valid-skill/                 known-good SKILL.md sample
│   │   └── SKILL.md
│   └── invalid-skill/               known-bad SKILL.md sample
│       └── SKILL.md
├── test/
│   ├── validate-skills*.test.mjs    node:test self-tests for the validator (9 files)
│   ├── chaos-loop-*.test.mjs        the real chaos-loop.js run against scripted fake agents (10 files)
│   ├── sandbox-probe.test.mjs       the sandbox probe (the Seatbelt cases run on macOS only)
│   ├── snapshot-command.test.mjs    the shared-git-state snapshot command
│   └── support/                     chaos-loop-harness.mjs, git-env.mjs
└── .github/
    ├── dependabot.yml               weekly npm and GitHub Actions updates
    └── workflows/
        ├── validate-skills.yml      CI job: npm ci, audit, validate, npm test on PRs and pushes to main touching a SKILL.md, scripts, references, tests, fixtures or package files (green)
        └── gitleaks.yml             secret scan on every PR and on pushes to main
```

## Directory-by-directory

| Path | What it is | Notes |
|---|---|---|
| `<skill-name>/SKILL.md` | One skill's full content: YAML frontmatter (`name`, `description`, etc.) + Markdown instructions. One directory per skill at repo root. | `name` in frontmatter must exactly match the containing folder name — the validator hard-fails otherwise, and this is what protects `npx skills add` path resolution. |
| `<skill-name>/scripts/`, `references/`, `assets/` | Optional per-skill subdirectories for supporting files a skill's body may reference. | Any relative file reference from a `SKILL.md` body must resolve to a real file here — the validator hard-fails on dangling references. |
| `scripts/validate-skills.mjs` | The validator. A single Node.js script (ESM, `.mjs`) that walks the repo, parses every `SKILL.md`'s frontmatter with `js-yaml`, and applies the hard-fail/soft-warn rule set. | The only repo-level tool outside `test/` (`nh-chaos-monkey` bundles its own scripts). No bundler, no build step — runs directly via `node scripts/validate-skills.mjs`. |
| `fixtures/valid-skill/` | A minimal `SKILL.md` that should pass every validator check. | Used by `test/` to assert the validator does *not* flag it. |
| `fixtures/invalid-skill/` | One or more `SKILL.md` samples, each violating a specific hard-fail or soft-warn rule. | Used by `test/` to assert the validator *does* flag each violation, one rule at a time. |
| `test/` | `node:test` suites: the validator's self-tests (run against `fixtures/`) and the `nh-chaos-monkey` loop harness, sandbox-probe and snapshot-command tests. | This is the project's entire test suite — no Jest/Vitest/pytest. Name pattern: `*.test.mjs`; shared helpers live in `test/support/`. |
| `.github/workflows/validate-skills.yml` | The CI gate. One job that runs `npm ci`, a dependency audit, `npm run validate` and `npm test` on PRs and pushes to `main` touching a `SKILL.md`, scripts, references, tests, fixtures, the package files or the workflow itself. | No CI-only branch of logic — CI and local dev call the identical script. |
| `.github/workflows/gitleaks.yml` | Secret scan (gitleaks) on every PR and push to `main`. | Third-party actions are pinned to commit SHAs; the token is read-only. |
| `.github/dependabot.yml` | Weekly npm and GitHub Actions update PRs. | Keeps the pinned action SHAs from going stale. |
| `package.json` | Declares `js-yaml` as the single devDependency and exposes `npm run validate` and `npm test` (the whole test suite: the validator's self-tests and the `nh-chaos-monkey` suites). | No other dependencies; no bundler config. |
| `memory.md` | Agent-writable accumulated-lessons index. | See its own convention note; near-empty until real history accrues. |
| `tech.md` | Fast-lookup stack inventory for this repo. | — |
| `architecture.md` | This project's own arc42/C4-style architecture doc. | — |

## "Where do I make change X" index

| I want to... | Go to |
|---|---|
| Add a new skill | Create `<skill-name>/SKILL.md` at repo root; folder name must equal frontmatter `name` |
| Add supporting files to a skill | `<skill-name>/scripts/`, `<skill-name>/references/`, or `<skill-name>/assets/` |
| Change what the validator checks (hard-fail or soft-warn rules) | `scripts/validate-skills.mjs` |
| Add/adjust a validator test case | `fixtures/valid-skill/` or `fixtures/invalid-skill/`, plus the matching case in `test/` |
| Change the nh-chaos-monkey loop | `nh-chaos-monkey/scripts/chaos-loop.js` and the matching `test/chaos-loop-*.test.mjs` (change a test first and watch it fail) |
| Change the sandbox probe | `nh-chaos-monkey/scripts/sandbox-probe.mjs` and `test/sandbox-probe.test.mjs` |
| Change when/how CI runs the validator and tests | `.github/workflows/validate-skills.yml` |
| Add or bump a dependency | `package.json` (should stay at exactly one devDependency: `js-yaml`) |
| Record a lesson learned or decision | `memory.md` (add one index line + a new topic file) |
| Update the stack rationale or adoption status | `tech.md` |
| Update the architecture description | `architecture.md` |

## Entry points

- **Local validation**: `npm run validate` → `node scripts/validate-skills.mjs`
  — the single entry point a contributor runs before opening a PR.
- **Tests**: `npm test` → `node --test`, Node's built-in runner, over
  `test/` (the validator's self-tests and the `nh-chaos-monkey` suites; it also
  loads the two helper files in `test/support/`).
- **CI**: `.github/workflows/validate-skills.yml`, triggered on PRs and pushes
  to `main` whose diff touches a `SKILL.md`, scripts, references, tests,
  fixtures, the package files or the workflow itself. Calls the same entry
  points as local dev.
- **Consumers of the skills** (external, not part of this repo's own entry
  points): `npx skills add` or manual `cp -r <skill-name>/
  ~/.claude/skills/` — both driven purely by the `<skill-name>/SKILL.md`
  directory convention, no code in this repo executes for them.

## Cross-module dependency notes

- `scripts/validate-skills.mjs` depends on `js-yaml` (its only external
  dependency) and reads every `<skill-name>/SKILL.md` in the repo plus any
  relative references from their bodies (`scripts/`, `references/`,
  `assets/` under each skill).
- `test/` depends on `scripts/validate-skills.mjs` (the unit under test) and
  `fixtures/valid-skill/` + `fixtures/invalid-skill/` (its inputs); the
  `nh-chaos-monkey` suites depend on `nh-chaos-monkey/scripts/chaos-loop.js`
  and `sandbox-probe.mjs`.
- `.github/workflows/validate-skills.yml` depends on `package.json`'s
  `validate` and `test` scripts (the validate script in turn depends on
  `scripts/validate-skills.mjs`), plus `npm ci` and `npm audit` — no CI-only
  logic.
- The skill content collection (`<skill-name>/SKILL.md`) has no dependency
  on any other part of this repo — it is pure content, deliberately
  decoupled from the validator so a skill remains usable even by a consumer
  who never runs the validator at all.
- Nothing in this repo depends on nh-deck, daily-dose, or Not-Humans-Lab —
  those relationships are thematic/lineage only, documented in
  `architecture.md`'s Context & Scope, not wired as code or build
  dependencies.
