# Project Status

> Living snapshot. Update this file whenever phase, health, or active work
> changes — do not let it go stale across a phase boundary.

**Last updated:** 2026-09-02

## Overall Status

**Phase:** 2 — Walking Skeleton (of 7 planned phases)
**Health:** 🟡 Active / Early

nh-skills is an independent, standalone GitHub repository — a personal,
curated collection of Claude Code Agent Skills (`SKILL.md` files), in the
spirit of `arpitbbhayani/ape-skills`. It is one of three sibling projects
(`daily-dose`, `nh-deck`, `nh-skills`) under the "Not-Humans-Lab" umbrella;
cross-cutting system-level docs for that umbrella live in the separate,
docs-only meta-repo at `../Not-Humans-Lab/` (linked by relative path, not
duplicated here). `nh-deck` and `daily-dose` do not exist yet — they are
planned siblings, not built dependencies.

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
| Walking skeleton: author `nh-commit` through full author→merge loop | 2     | In progress |
| `scripts/validate-skills.mjs` (frontmatter + structural lint)        | 2     | In progress |
| GitHub Actions lint job on `**/SKILL.md` PRs                          | 2     | Not started |
| SHA-256 integrity manifest scheme (per `SECURITY.md`)                 | 3+    | Planned, not started |

## Recent Progress

- Decided and documented the full tech stack: Markdown+YAML only for skill
  artifacts, single Node.js validator script, no packaging/manifest
  tooling beyond directory layout, Apache-2.0 license (applied identically
  across all three sibling projects), `node:test` for the validator's own
  fixture-based self-tests.
- Recorded the validator's hard-fail vs. soft-warn rule set (frontmatter
  schema, name/folder-name matching, description constraints, duplicate
  name detection, dead file-reference detection; soft warnings for missing
  "when to use" clause, description length, and body length).
- Wrote Phase 1 pre-scaffold governance docs: `SECURITY.md` (supply-chain
  scheme, prompt-injection flagging, takedown process), `SUPPORT.md`,
  this file, and `decisions.md` + ADR 0001.

## Upcoming Milestones

1. **Walking-skeleton exit criterion**: `nh-commit` authored, passes the
   validator locally, opens a PR, passes the CI lint gate, gets reviewed,
   and merges — proving the full author-to-merge loop end to end.
2. Stand up the GitHub Actions workflow that runs
   `scripts/validate-skills.mjs` on every PR touching `**/SKILL.md`.
3. Write the validator's own `node:test` fixture suite (valid skill, bad
   frontmatter, name/folder mismatch, dead reference, duplicate name).
4. Add a top-level `README.md` once the skeleton is proven (not before —
   avoid documenting a shape that might still change).
5. Begin Phase 3 planning: expand the skill catalog beyond `nh-commit`.

## Risks & Blockers

- **No blockers currently identified.**
- **Risk:** the SHA-256 integrity-manifest scheme in `SECURITY.md` is
  documented as *planned* but has zero implementation yet — if a skill is
  published before that scheme exists, there is no cryptographic
  provenance for it beyond git history. Acceptable for Phase 2 (only one
  skill, `nh-commit`, and it hasn't shipped externally yet), but should be
  revisited before this repo is advertised publicly.
- **Risk:** because `nh-deck` and `daily-dose` don't exist yet, any
  cross-project convention (license, doc structure) is only validated
  against this one repo so far — watch for drift once the siblings are
  scaffolded.
