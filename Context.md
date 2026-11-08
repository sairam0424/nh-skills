# Context.md — nh-skills

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

nh-skills is a personal, curated collection of Claude Code Agent Skills (`SKILL.md` files), the author's own version of [arpitbbhayani/ape-skills](https://github.com/arpitbbhayani/ape-skills). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). nh-skills is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-deck and daily-dose have since also shipped their own Phase 3-6 (both live GitHub repos with green CI) — this file only tracks nh-skills' own state; see each sibling's own `Context.md` for theirs, and `../Not-Humans-Lab/status.md` for the cross-project rollup.

## Current state (as of 2026-11-02)

- **Phase 1 (pre-scaffold docs) and Phase 2 (walking skeleton) complete.** Repo is live at github.com/sairam0424/nh-skills with green CI.
- **Tech stack: decided.** Pure Markdown + YAML frontmatter for skill artifacts — zero runtime (the one exception is the optional Workflow script bundled with `nh-chaos-monkey`, which runs only inside the Claude Code Workflow tool). Exactly one lightweight layer on top: `scripts/validate-skills.mjs` (one devDependency, `js-yaml`), run in CI by the `validate-skills.yml` job (`AGENTS.md` lists the whole CI set-up).
- **Loop proven twice, then reset on 2026-11-02**: `nh-commit` (PR #1) and `nh-style-markdown` (PR #2) went through the full author → lint → CI → merge loop and were then removed to start fresh. `nh-chaos-monkey` is the only skill now.
- **Only skill: `nh-chaos-monkey`** (merged via PR #4 as `nh-breaker`; renamed on 2026-11-08, so PRs #4 to #12 and the older history use the old name). It is the first skill with a bundled `scripts/` file (a Claude Code Workflow script) and `references/`, and the first to go through the `AGENTS.md` security-review step: an independent read-only reviewer, three rounds, findings fixed before this was proposed. Its design and validation history are in `nh-chaos-monkey/references/loop-design.md`.
- **No packaging/distribution tooling exists or is planned** beyond correct directory layout (`<skill-name>/SKILL.md` plus optional `scripts/`, `references/`, `assets/`). `npx skills add` and manual `cp -r` into `~/.claude/skills/` already work off directory structure alone — no manifest file is needed.
- **No dedicated test framework.** The validator script is the test suite for this repo's own tooling, backed by fixture-based self-tests using Node's built-in `node:test` (no Jest/Vitest/pytest).
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
- **The security-review step has been exercised once (on `nh-chaos-monkey`), and the validator cannot judge intent.** The review found real issues that `npm run validate` could not see, which confirms the step is load-bearing. It was run by an independent reviewer agent, not a human, so it is a lead-generator, not a sign-off.
- **The validator only reads `SKILL.md` files.** A bundled script such as `nh-chaos-monkey/scripts/chaos-loop.js` has no repo check; its only guards are a syntax check, a fixture run and the review, all described in the skill's own references. If more skills ship scripts, that gap needs a decision (it is not yet a reason to add tooling).
- **No outside contributors exist yet**, so the "revisit at 30-40 skills or outside contributors" threshold is untested — the actual pain points that would justify more tooling are still hypothetical.

---
*Last updated: 2026-11-02. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
