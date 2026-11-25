# Project Status

> Living snapshot. Update this file whenever phase, health, or active work
> changes — do not let it go stale across a phase boundary.

**Last updated:** 2026-11-23

## Overall Status

**Phase:** 2 — Walking Skeleton complete (Phase 7 cross-project reconciliation also done)
**Health:** 🟢 Stable

nh-skills is an independent, standalone GitHub repository (github.com/sairam0424/nh-skills) — a personal,
curated collection of Not-Humans skills for Claude Code (`SKILL.md` files), in the
spirit of `arpitbbhayani/ape-skills`. It is one of three sibling projects
(`daily-dose`, `nh-deck`, `nh-skills`) under the "Not-Humans-Lab" umbrella;
cross-cutting system-level docs for that umbrella live in the separate,
docs-only meta-repo at `../Not-Humans-Lab/` (linked by relative path for rationale/context;
`Branches.md` is copied verbatim into this repo since a relative path alone
would break for a standalone clone). `nh-deck` and `daily-dose` have also
shipped their own Phases 3-6 — see their own repos for their state.

Tech stack is intentionally minimal: pure Markdown + YAML frontmatter for
every skill artifact (zero runtime, per the Agent Skills format), plus
exactly one lint layer — `scripts/validate-skills.mjs` (one devDependency,
`js-yaml`) — run, together with `npm test`, as a GitHub Actions job on every PR
or push to `main` that touches a `SKILL.md`, a `scripts/` or `references/` folder, the tests, the fixtures or the package files. See `docs/adr/0001-adopt-markdown-only-skill-format-with-lint-gate.md`
for the full rationale.

## Active Specs & Plans

| Spec / Plan                                              | Phase | Status      |
| --------------------------------------------------------- | ----- | ----------- |
| Pre-scaffold docs (SECURITY.md, SUPPORT.md, status.md, decisions.md) | 1     | Complete    |
| Walking skeleton: author `nh-commit` through full author→merge loop | 2     | **Complete — merged via PR #1 (skill removed 2026-11-02)** |
| `scripts/validate-skills.mjs` (frontmatter + structural lint)        | 2     | Complete, CI-verified |
| GitHub Actions job: validator and `npm test` on PRs and pushes to `main` touching a `SKILL.md`, scripts, references, tests, fixtures or package files | 2     | Complete, green |
| `nh-chaos-monkey` rename, test harness, fault lens, sandbox probe and gate (PRs #13, #16 to #22) | 2     | Complete, merged |
| SHA-256 integrity manifest scheme (per `SECURITY.md`)                 | 3+    | Deferred; each release publishes an archive SHA-256 instead |

## Recent Progress

- 2026-11-25: v0.2.3 released (PRs #33, #34; tag v0.2.3). v0.2.4 prepared (PR #36 merged): both settings examples deny reads of Claude Code's own settings files, and the SKILL.md line that said not for unattended runs now says a headless run with its contract supplied is supported.
- 2026-11-25: v0.2.3 prepared (PR #33 merged). Fixes from running v0.2.2 on eight real projects: the false breakers-blocked and rejudge halts, fixers use git archive instead of git stash, the judge's environment reaches the breakers, five input validations, the sandbox-allowance table and worked settings file. Evidence in nh-chaos-monkey/learning.md.
- 2026-11-24: v0.2.2 prepared (PRs #29, #30 merged). The Claude Code plugin manifests and the first-user documents (safety, troubleshooting, tester guide, changelog, tester report form); a confirm gate so that a break only counts when its reproducer runs the project's code and the project's own documents do not accept the behaviour; `--repro-runner` for an interpreter outside the worktree; two new halts that are not a plateau; and no stop on the four standard git-lfs lines. 338 tests pass. Released only on the owner's go.
- 2026-11-23: v0.2.0 released (PR #27, tag v0.2.0). v0.2.1 prepared on a branch: probe error classes and 15 credential locations, a wider default protected set, a wider judge screen with a fenced judge command, cleaned output tails with untrustedFields, and a hooks-off worktree command with a config pre-check and a scrubbed npm install, each fixed test-first after eight read-only reproductions and two independent review rounds. The release waits for the owner's go.
- 2026-11-23: release candidate for v0.2.0 prepared. The sandbox probe now runs before the install and the judge (A/B-tested), the probe's name rules and its sandbox-runtime exception were tightened with tests, the community files were added, and live runs on the candidate covered Claude Code's sandbox on macOS, a Python fixture and a real library. See `nh-chaos-monkey/learning.md`.
- 2026-11-21: v0.1.0 released and the repository made public. Release assets are an archive of `nh-chaos-monkey/` and its SHA-256. The install routes in the README were checked from the public URL: a clone pinned to the tag, the release archive's checksum, and the `skills` CLI in a throwaway project. Settings now: squash-only merges, a ruleset on `main` (pull request and `gitleaks` check required, no force-push or deletion), secret scanning with push protection, Dependabot alerts, CodeQL, and private vulnerability reporting. Open items from the pre-release review are tracked in issue #25.
- 2026-11-14: refreshed `Context.md`, this file, `codebase_map.md`, `AGENTS.md`,
  `tech.md` and `architecture.md` to match the work below (they still described
  the validator as the only test surface and CI as running on `SKILL.md`
  changes alone).
- 2026-11-09 to 2026-11-12: PRs #16 to #22 merged. `nh-chaos-monkey` gained a
  deterministic test harness (the real `chaos-loop.js` run against scripted fake
  agents), a fault-injection lens, a sandbox probe and gate, a tested git-state
  snapshot command and a `learning.md` journal (#14 and #15 were closed in
  favour of #16). `npm test` reports 307 passing results across 23 test files on the v0.2.1 branch (2026-11-23)
  and 2 helper files. The live runs of 2026-11-08 are in
  `nh-chaos-monkey/references/loop-design.md`; the later live runs and the
  end-to-end verification are in `nh-chaos-monkey/learning.md`.
- 2026-11-08: renamed the only skill `nh-breaker` to `nh-chaos-monkey`; the entries
  below use the old name.
- 2026-11-02: started the collection fresh. `nh-commit` and `nh-style-markdown`
  were removed and `nh-breaker` (PR #4) is now the only skill; the entries
  below are history.
- Shipped Phase 2's exit criterion for real: `nh-commit` was authored, passed
  the validator locally, opened as PR #1, passed the CI lint gate, and was
  merged — the full author→validate→PR→CI→merge loop is proven, not just
  specified.
- Phase 7 cross-project reconciliation: added `Branches.md` (copied verbatim
  from Not-Humans-Lab), `agent_learning.md`, and `anti-patterns.md` (all
  three were missing from the original scaffold), and refreshed this file
  plus `Context.md`/`codebase_map.md` to stop describing already-shipped
  work as "in progress."
- Earlier: decided and documented the full tech stack (Markdown+YAML only,
  single Node.js validator, `node:test` self-tests, Apache-2.0), and the
  validator's hard-fail vs. soft-warn rule set.

## Upcoming Milestones

1. Add a second skill after `nh-chaos-monkey`, proving the loop is repeatable
   with the fresh start, not a one-time success.
2. Add a top-level `README.md` refresh once a second skill exists, to show
   a real multi-skill table instead of a single-row placeholder.
3. Revisit tooling (manifest, registry, SHA-256 integrity scheme) only at
   the documented ~30-40 skill mark or on outside contribution — not before.

## Risks & Blockers

- **No blockers currently identified.**
- **Risk:** the SHA-256 integrity-manifest scheme in `SECURITY.md` is
  documented as *planned* but has zero implementation yet — if a skill is
  published externally before that scheme exists, there is no cryptographic
  provenance for it beyond git history. Each release now attaches a SHA-256
  of its archive, which covers integrity at download time; the manifest
  scheme itself stays deferred (see `SECURITY.md`).
- **Note:** squash-merge-only was a convention until v0.1.0 (PR #22 landed as a
  merge commit). Since the repository became public, its settings allow only
  squash merges and a ruleset on `main` requires a pull request and the
  `gitleaks` check (see `Context.md`, Open risks).
