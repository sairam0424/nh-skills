# Decisions

This file is the index over this project's Architecture Decision Records
(ADRs, in `docs/adr/`) plus a lightweight running log for decisions that
don't rise to ADR weight. Together they are the decision history for
nh-skills; do not duplicate cross-cutting decisions that belong in the
docs-only meta-repo at `../Not-Humans-Lab/` (link there by relative path
instead).

## What Counts as "Architecturally Significant" Here

A decision gets a full ADR (in `docs/adr/`) when it meets at least one of
these bars for nh-skills specifically:

- It fixes the **format or validation contract of the skill artifact
  itself** (e.g., what `SKILL.md` is authored in, what a valid frontmatter
  looks like, what gets hard-failed vs. soft-warned).
- It changes **how skills are distributed or discovered** (directory
  layout, manifest files or their absence, installer compatibility).
- It is **expensive or awkward to reverse** once other skills, tooling, or
  external consumers (e.g., `npx skills add` users) depend on it.
- It trades off between two or more of the decision drivers this project
  cares about (zero-runtime artifacts, minimal dependency surface, CI gate
  scope, cross-suite consistency with `daily-dose` / `nh-deck`) rather than
  being an obvious, uncontested choice.

Everything else — naming a specific skill, tweaking a soft-warn threshold,
picking a commit message convention — goes in the Lightweight Decisions
Log below instead of getting its own ADR file.

## ADR Index

| ID   | Title                                                      | Status   | Date       | Supersedes |
| ---- | ------------------------------------------------------------ | -------- | ---------- | ---------- |
| 0001 | [Adopt Markdown-only skill format with a lint gate](docs/adr/0001-adopt-markdown-only-skill-format-with-lint-gate.md) | Accepted | 2026-09-02 | —          |

## Lightweight Decisions Log

| Date       | Decision                                                                                                    | Rationale                                                                                                                 | Owner |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- |
| 2026-09-02 | Ship nh-skills as an independent, standalone GitHub repo, not nested inside `Not-Humans-Lab`.                  | Matches this workspace's polyrepo convention; `Not-Humans-Lab` is docs-only and cross-cutting, not a code host for its siblings. | @sairamugge |
| 2026-09-02 | License: Apache-2.0.                                                                                            | Decided once at the system level, applied identically across `daily-dose`, `nh-deck`, and `nh-skills` for enterprise-clearable, patent-safe consistency. | @sairamugge |
| 2026-09-02 | No dedicated test framework for the validator; use Node's built-in `node:test` with fixture-based self-tests.   | The validator is a single script; `node:test` avoids adding Jest/Vitest/pytest as a dependency for no real benefit (YAGNI).  | @sairamugge |
| 2026-09-02 | No packaging/distribution tooling beyond correct `<skill-name>/SKILL.md` directory layout — no manifest file.  | Both `npx skills add` and manual `cp -r` already resolve off directory structure alone; a manifest would be a redundant second source of truth. | @sairamugge |
| 2026-09-02 | Validator hard-fails on structural/schema violations; soft-warns on style issues (missing "when to use", length ceilings). | Separates "this will break installation or is objectively invalid" from "this could be tightened" so CI blocks only on real breakage. | @sairamugge |
| 2026-09-02 | Walking-skeleton exit criterion is authoring one real skill, `nh-commit`, through the full author→PR→CI→review→merge loop. | Proves the Phase 2 toolchain end to end before investing in more skills or Phase 3 scope. | @sairamugge |
