# Context.md — nh-skills

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

nh-skills is a personal, curated collection of Claude Code Agent Skills (`SKILL.md` files), the author's own version of [arpitbbhayani/ape-skills](https://github.com/arpitbbhayani/ape-skills). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). nh-skills is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-deck and daily-dose have since also shipped their own Phase 3-6 (both live GitHub repos with green CI) — this file only tracks nh-skills' own state; see each sibling's own `Context.md` for theirs, and `../Not-Humans-Lab/status.md` for the cross-project rollup.

## Current state (as of 2026-11-14)

- **Phase 1 (pre-scaffold docs) and Phase 2 (walking skeleton) complete.** Repo is live at github.com/sairam0424/nh-skills with green CI.
- **Tech stack: decided.** Pure Markdown + YAML frontmatter for skill artifacts — zero runtime (the exception is the code bundled with `nh-chaos-monkey`: `chaos-loop.js`, a script written to run inside the Claude Code Workflow tool, and `sandbox-probe.mjs`, a plain Node CLI the skill runs as a safety check). Exactly one lightweight layer on top: `scripts/validate-skills.mjs` (one devDependency, `js-yaml`), run in CI by the `validate-skills.yml` job (`AGENTS.md` lists the whole CI set-up).
- **Loop proven twice, then reset on 2026-11-02**: `nh-commit` (PR #1) and `nh-style-markdown` (PR #2) went through the full author → lint → CI → merge loop and were then removed to start fresh. `nh-chaos-monkey` is the only skill now.
- **Only skill: `nh-chaos-monkey`** (merged via PR #4 as `nh-breaker`; renamed on 2026-11-08, so PRs #4 to #12 and the older history use the old name). It is the first skill with a bundled `scripts/` file (a Claude Code Workflow script) and `references/`, and the first to go through the `AGENTS.md` security-review step: an independent read-only reviewer, three rounds, findings fixed before this was proposed. Its design and validation history are in `nh-chaos-monkey/references/loop-design.md`. Since the rename it gained a deterministic test harness, a fifth default lens (faults), a sandbox probe and gate, a tested git-state snapshot command and a `learning.md` journal of A/B and verification runs (PRs #16 to #22; #14 and #15 were closed in favour of #16).
- **No packaging/distribution tooling exists or is planned** beyond correct directory layout (`<skill-name>/SKILL.md` plus optional `scripts/`, `references/`, `assets/`). `npx skills add` and manual `cp -r` into `~/.claude/skills/` already work off directory structure alone — no manifest file is needed.
- **No dedicated test framework.** `npm test` (`node --test`) runs Node's built-in `node:test` over 21 `*.test.mjs` files plus the two helper modules in `test/support/`, which the runner loads too (264 passing results on 2026-11-14, each helper file counting once; no Jest/Vitest/pytest): the validator's fixture-based self-tests and, since PR #16, a deterministic harness that runs the real `chaos-loop.js` against scripted fake agents, plus tests for the sandbox probe and the git-state snapshot command. The tests that need macOS Seatbelt skip themselves on other platforms, so CI on Linux runs the rest.
- **License: Apache-2.0**, decided once at the Not-Humans-Lab system level and applied identically across all three sibling projects for enterprise-clearable, patent-safe consistency (see `../Not-Humans-Lab/decisions.md`).

## Architecture at a glance

Two layers only:

1. **The skill artifacts** — `<skill-name>/SKILL.md` (+ optional `scripts/`, `references/`, `assets/`), no runtime of its own, installable by directory structure alone.
2. **The validator** — `scripts/validate-skills.mjs`, a single dependency-light Node script that lints every `SKILL.md`'s frontmatter schema and structural conventions, wired into CI by the `validate-skills.yml` GitHub Actions job.

No manifest, no packaging step, no build. See `AGENTS.md`'s Directory Map for the concrete file layout. See `../Not-Humans-Lab/architecture.md` for how nh-skills fits into the three-project system (C4 Level 1 only — this repo owns its own internals).

## Key decisions & why

- **Zero-runtime skill format, one lint layer, nothing else** — the entire value of the Agent Skills format is that it needs no runtime; adding packaging/build tooling would undermine the thing worth preserving from the reference project (ape-skills). See `SOUL.md` for the curatorial-restraint reasoning behind this.
- **`node:test` instead of a dedicated test framework** — the validator script is small enough that a full framework (Jest/Vitest) would be tooling for tooling's sake; fixture-based `node:test` is sufficient and keeps the devDependency count at one (`js-yaml`).
- **Hard-fail vs. soft-warn split in the validator** — hard-fails are reserved for things that break consumer installation or repo integrity (frontmatter validity, name/folder match, duplicate names, dead file references); soft-warns are quality signals (description "when to use" clause, length ceilings, body length) that don't block CI but surface real signal for the author. See `AGENTS.md` for the full rule list.
- **License = Apache-2.0** — decided once at the umbrella level, not re-decided per project; see `../Not-Humans-Lab/decisions.md` for the patent-grant rationale.

## Roadmap

Grow the skill catalog gradually, one skill at a time, proving the author-to-merge loop each time before adding the next. **Do not overbuild tooling now.** Per the earlier research's own revisit threshold, tooling beyond the current single validator + CI job is only reconsidered once the catalog crosses roughly **30-40 skills**, or once **outside contributors** actually show up (a manifest, a registry, contributor-facing docs, or a packaging step become justifiable at that point — not before). Until then, the plan is:

1. ~~Prove the author-to-merge loop twice with `nh-commit` and `nh-style-markdown`.~~ Done (PRs #1 and #2); both skills were removed on 2026-11-02 to start fresh.
2. ~~Add `nh-chaos-monkey` as the first skill of the fresh start.~~ Done (PR #4, merged).
3. Continue adding skills one at a time, each getting the same validator + CI + (where applicable) security-review treatment.
4. Revisit tooling only at the ~30-40 skill mark or on outside contribution — not on a calendar, not speculatively.

nh-deck and daily-dose have completed their own Phases 3-6 — see their own repos/Context.md files for their state; this repo's roadmap only concerns nh-skills' own next skill additions.

## Open risks

- **One skill is in the repo.** The loop was proven twice before the reset; with `nh-chaos-monkey` as the only skill, repeatability is untested again until a second skill lands.
- **The security-review step has only been exercised on `nh-chaos-monkey`, and the validator cannot judge intent.** Two reviews are on record: the first one described above, and a five-lens independent review of the harness work (57 agents; 25 medium findings confirmed, clustered in the script and probe, the tests, the docs and the CI path filters, areas `npm run validate` mostly does not check; recorded in `nh-chaos-monkey/references/loop-design.md`). That suggests the step is load-bearing. Both were run by reviewer agents, not a human, so they are lead-generators, not a sign-off.
- **The validator only reads `SKILL.md` files.** The bundled scripts (`nh-chaos-monkey/scripts/chaos-loop.js` and `sandbox-probe.mjs`) are not linted; they are covered by `npm test`, which CI runs when a script, reference, test or fixture changes. A test suite is only as good as its assertions: the same five-lens review found weak or vacuous ones (fixed in that change) and noted that some constants and output schemas are still not pinned by any test. If more skills ship scripts, whether they need a repo-level check is a decision still to make (it is not yet a reason to add tooling).
- **Squash-merge-only is a convention, not a setting.** `AGENTS.md` requires squash merges, but the repository also allows merge commits and rebase merges, and branch protection is not available for this private repository on its current plan (the API answers 403 and asks for GitHub Pro or a public repository). PR #22 landed as a merge commit. Turning off the other two merge types in the repository settings would enforce the rule; that is the owner's call.
- **No outside contributors exist yet**, so the "revisit at 30-40 skills or outside contributors" threshold is untested — the actual pain points that would justify more tooling are still hypothetical.

---
*Last updated: 2026-11-14. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
