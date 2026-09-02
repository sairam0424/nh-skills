# Project Status

> Living snapshot. Update this file whenever phase, health, or active work
> changes — do not let it go stale across a phase boundary.

**Last updated:** 2026-09-02

## Overall Status

**Phase:** 2 — Walking Skeleton complete (Phase 7 cross-project reconciliation also done)
**Health:** 🟢 Stable

nh-skills is an independent, standalone GitHub repository (github.com/sairam0424/nh-skills) — a personal,
curated collection of Claude Code Agent Skills (`SKILL.md` files), in the
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
`js-yaml`) — run as a GitHub Actions job on every PR touching
`**/SKILL.md`. See `docs/adr/0001-adopt-markdown-only-skill-format-with-lint-gate.md`
for the full rationale.

## Active Specs & Plans

| Spec / Plan                                              | Phase | Status      |
| --------------------------------------------------------- | ----- | ----------- |
| Pre-scaffold docs (SECURITY.md, SUPPORT.md, status.md, decisions.md) | 1     | Complete    |
| Walking skeleton: author `nh-commit` through full author→merge loop | 2     | **Complete — merged via PR #1** |
| `scripts/validate-skills.mjs` (frontmatter + structural lint)        | 2     | Complete, CI-verified |
| GitHub Actions lint job on `**/SKILL.md` PRs                          | 2     | Complete, green |
| SHA-256 integrity manifest scheme (per `SECURITY.md`)                 | 3+    | Planned, not started |

## Recent Progress

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

1. Add a second skill, proving the loop is repeatable, not a one-time
   success.
2. Add a top-level `README.md` refresh once a second skill exists, to show
   a real multi-skill table instead of a single-row placeholder.
3. Revisit tooling (manifest, registry, SHA-256 integrity scheme) only at
   the documented ~30-40 skill mark or on outside contribution — not before.

## Risks & Blockers

- **No blockers currently identified.**
- **Risk:** the SHA-256 integrity-manifest scheme in `SECURITY.md` is
  documented as *planned* but has zero implementation yet — if a skill is
  published externally before that scheme exists, there is no cryptographic
  provenance for it beyond git history. Acceptable today (one skill, low
  external exposure), but revisit before this repo is advertised publicly.
