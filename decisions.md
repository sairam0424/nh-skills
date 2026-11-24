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
| 2026-09-02 | Ship nh-skills as an independent, standalone GitHub repo, not nested inside `Not-Humans-Lab`.                  | Matches this workspace's polyrepo convention; `Not-Humans-Lab` is docs-only and cross-cutting, not a code host for its siblings. | @sairam0424 |
| 2026-09-02 | License: Apache-2.0.                                                                                            | Decided once at the system level, applied identically across `daily-dose`, `nh-deck`, and `nh-skills` for enterprise-clearable, patent-safe consistency. | @sairam0424 |
| 2026-09-02 | No dedicated test framework for the validator; use Node's built-in `node:test` with fixture-based self-tests.   | The validator is a single script; `node:test` avoids adding Jest/Vitest/pytest as a dependency for no real benefit (YAGNI).  | @sairam0424 |
| 2026-09-02 | No packaging/distribution tooling beyond correct `<skill-name>/SKILL.md` directory layout — no manifest file.  | Both `npx skills add` and manual `cp -r` already resolve off directory structure alone; a manifest would be a redundant second source of truth. | @sairam0424 |
| 2026-09-02 | Validator hard-fails on structural/schema violations; soft-warns on style issues (missing "when to use", length ceilings). | Separates "this will break installation or is objectively invalid" from "this could be tightened" so CI blocks only on real breakage. | @sairam0424 |
| 2026-09-02 | Walking-skeleton exit criterion is authoring one real skill, `nh-commit`, through the full author→PR→CI→review→merge loop. | Proves the Phase 2 toolchain end to end before investing in more skills or Phase 3 scope. | @sairam0424 |
| 2026-11-02 | Start the collection fresh: remove the `nh-commit` and `nh-style-markdown` skills; `nh-breaker` is the only skill. | Owner decision. The walking-skeleton row above stays as history. Installing the removed skills from `main` with `npx skills add` no longer works. | @sairam0424 |
| 2026-11-02 | Harden CI: pin every action to a verified commit SHA, read-only token permissions, add a gitleaks secret scan and Dependabot; do not enable CodeQL. | Pins were checked against upstream tags. This repository is private without code scanning (and branch protection was unavailable while it was private), so CodeQL would fail on upload; revisit if it becomes public. | @sairam0424 |
| 2026-11-08 | Rename the `nh-breaker` skill to `nh-chaos-monkey`: folder, slash command, workflow script (`chaos-loop.js`), branch prefix `chaos/` and rejected-attempt refs `refs/chaos/rejected`. | Owner decision. The roles keep their names (breaker, confirmer, fixer, verifier). `/nh-breaker` stops working and an installed copy must be re-exported under the new name. | @sairam0424 |
| 2026-11-21 | Make the repository public and release v0.1.0 with its full history; squash-only merges and a ruleset on `main` from then on. | Owner decision. A first user release needs a public repository so the install routes work. The history is kept as it is. `SKILL.md` and the scripts stay unchanged for the release: skill-level hardening goes through the A/B process and is tracked in issue #25. | @sairam0424 |
| 2026-11-23 | Release v0.2.0: the nh-chaos-monkey sandbox probe runs before any project code (wording A/B-tested twice), the probe's environment-name rules and its Claude Code sandbox exception are tightened test-first, and the community files are added. | Owner approved the plan on 2026-11-23 ("go ahead with ideal steps with full power"). Evidence is in nh-chaos-monkey/learning.md: two wording comparisons, live runs inside Claude Code's sandbox, on Python and on a real library, and an independent review of the candidate. The bar for calling the skill stable is recorded in Context.md as a proposal. | @sairam0424 |
| 2026-11-23 | Prepare v0.2.1: harden nh-chaos-monkey against the open items of issue #25 that reproduced (probe error classification and 15 credential locations, wider default protected set, wider judge screen with a fenced judge command, cleaned output tails with `untrustedFields`, a hand-edit rule for `.git`, a hooks-off worktree command with a slug rule and config pre-check, accurate install wording). | Owner asked for the next ideal steps. Every item was reproduced by a read-only investigator and a second verifier before any edit (the --add-dir one only partly), fixed test-first without changing an existing test, and the SKILL.md wording went through a 14-agent A/B (22 of 22 checks against 12 of 22 over five scenarios; on the two that differed, 16 of 16 against 6 of 16). An independent four-reviewer pass then found a verified credential-leak path through an .npmrc expansion in the install wording, among 42 findings; the fixes tied in a second 10-agent comparison (13 of 13 against 13 of 13) and the owner chose to ship the stricter wording anyway (any listed git config line, including git-lfs lines, stops a non-interactive run). Protected-set additions leave out setup.py, .env and spec directories on purpose (false positives). The release itself waits for the owner's go. | @sairam0424 |
| 2026-11-24 | Add the two Claude Code plugin manifests (`.claude-plugin/marketplace.json` at the root and `nh-chaos-monkey/.claude-plugin/plugin.json`) as the one exception to the 2026-09-02 no-manifest decision. The plugin is the skill folder itself, the version is set in `plugin.json` only and a test keeps it equal to `package.json`. | A first user needs an install, update and uninstall route that Claude Code supports itself; the owner chose it on 2026-11-24. The cost is a second source of truth for name, description and version, which `test/plugin-manifests.test.mjs` keeps in step. A new copy reaches plugin users only when a release bumps the version. | @sairam0424 |
| 2026-11-24 | Prepare v0.2.2 around a confirm gate for nh-chaos-monkey: a break only counts when the confirmer has read the reproducer and quoted the line that runs the project's code, and a behaviour the project's own documents accept is invalid; a reproducer runner may be an absolute interpreter path (`--repro-runner`); two new halts (`breakers-blocked`, `reproducers-do-not-run-the-project`) replace a silent plateau; the verifier reports `changesDocumentedBehaviour`. | A run on a mature real project (2026-11-24) found that five of six "confirmed" breaks had reproducers that tested a copy of the code, and one fix changed a case the project's decision log already accepted. The gate rests on an agent's reading of the file, so Step 4 has the main session read the reproducers too. Behaviour change for the result's `class` fields; evidence in `nh-chaos-monkey/learning.md`. Not released: a release needs the owner's yes. | @sairam0424 |
| 2026-11-24 | Loosen one stop in nh-chaos-monkey: the four standard git-lfs filter lines (exact values, scope global or system) no longer stop a run, interactive or not; every other config line that can run code, and the same lines in the repository's own config, still stops it. | A first headless run on a machine with git-lfs stopped after 18 seconds, and git-lfs is on most developer machines. The lines only matter when the repository's attributes select the filter, and then they run the standard tool. Trialled with 24 agents (six scenarios, old and new wording, two trials each): the new wording proceeded only on the two standard cases and never on a changed value, an extra hooks path or the repository's own config. This is a separate commit so it can be dropped. | @sairam0424 |
