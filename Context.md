# Context.md — nh-skills

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

nh-skills is a personal, curated collection of Claude Code Agent Skills (`SKILL.md` files), the author's own version of [arpitbbhayani/ape-skills](https://github.com/arpitbbhayani/ape-skills). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). nh-skills is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-deck and daily-dose have since also shipped their own Phase 3-6 (both live GitHub repos with green CI) — this file only tracks nh-skills' own state; see each sibling's own `Context.md` for theirs, and `../Not-Humans-Lab/status.md` for the cross-project rollup.

## Current state (as of 2026-09-02)

- **Phase 1 (pre-scaffold docs) and Phase 2 (walking skeleton) complete.** Repo is live at github.com/sairam0424/nh-skills with green CI.
- **Tech stack: decided.** Pure Markdown + YAML frontmatter for skill artifacts — zero runtime. Exactly one lightweight layer on top: `scripts/validate-skills.mjs` (one devDependency, `js-yaml`), run as a single GitHub Actions job on every PR touching `**/SKILL.md`.
- **Walking skeleton proven, and proven repeatable**: `nh-commit` (PR #1) and `nh-style-markdown` (PR #2) have both been authored end-to-end and merged through the full author → lint → CI → merge loop — the loop works a second time, not just once.
- **No packaging/distribution tooling exists or is planned** beyond correct directory layout (`<skill-name>/SKILL.md` plus optional `scripts/`, `references/`, `assets/`). `npx skills add` and manual `cp -r` into `~/.claude/skills/` already work off directory structure alone — no manifest file is needed.
- **No dedicated test framework.** The validator script is the test suite for this repo's own tooling, backed by fixture-based self-tests using Node's built-in `node:test` (no Jest/Vitest/pytest).
- **License: Apache-2.0**, decided once at the Not-Humans-Lab system level and applied identically across all three sibling projects for enterprise-clearable, patent-safe consistency (see `../Not-Humans-Lab/decisions.md`).

## Architecture at a glance

Two layers only:

1. **The skill artifacts** — `<skill-name>/SKILL.md` (+ optional `scripts/`, `references/`, `assets/`), zero runtime, installable by directory structure alone.
2. **The validator** — `scripts/validate-skills.mjs`, a single dependency-light Node script that lints every `SKILL.md`'s frontmatter schema and structural conventions, wired into CI via one GitHub Actions job on PRs touching `**/SKILL.md`.

No manifest, no packaging step, no build. See `AGENTS.md`'s Directory Map for the concrete file layout. See `../Not-Humans-Lab/architecture.md` for how nh-skills fits into the three-project system (C4 Level 1 only — this repo owns its own internals).

## Key decisions & why

- **Zero-runtime skill format, one lint layer, nothing else** — the entire value of the Agent Skills format is that it needs no runtime; adding packaging/build tooling would undermine the thing worth preserving from the reference project (ape-skills). See `SOUL.md` for the curatorial-restraint reasoning behind this.
- **`node:test` instead of a dedicated test framework** — the validator script is small enough that a full framework (Jest/Vitest) would be tooling for tooling's sake; fixture-based `node:test` is sufficient and keeps the devDependency count at one (`js-yaml`).
- **Hard-fail vs. soft-warn split in the validator** — hard-fails are reserved for things that break consumer installation or repo integrity (frontmatter validity, name/folder match, duplicate names, dead file references); soft-warns are quality signals (description "when to use" clause, length ceilings, body length) that don't block CI but surface real signal for the author. See `AGENTS.md` for the full rule list.
- **License = Apache-2.0** — decided once at the umbrella level, not re-decided per project; see `../Not-Humans-Lab/decisions.md` for the patent-grant rationale.

## Roadmap

Grow the skill catalog gradually, one skill at a time, proving the author-to-merge loop each time before adding the next. **Do not overbuild tooling now.** Per the earlier research's own revisit threshold, tooling beyond the current single validator + CI job is only reconsidered once the catalog crosses roughly **30-40 skills**, or once **outside contributors** actually show up (a manifest, a registry, contributor-facing docs, or a packaging step become justifiable at that point — not before). Until then, the plan is:

1. ~~Finish the `nh-commit` walking skeleton (Phase 2) — prove the full loop once.~~ Done (PR #1, merged).
2. ~~Add a second skill, prove the loop is repeatable.~~ Done (`nh-style-markdown`, PR #2, merged).
3. Continue adding skills one at a time, each getting the same validator + CI + (where applicable) security-review treatment.
4. Revisit tooling only at the ~30-40 skill mark or on outside contribution — not on a calendar, not speculatively.

nh-deck and daily-dose have completed their own Phases 3-6 — see their own repos/Context.md files for their state; this repo's roadmap only concerns nh-skills' own next skill additions.

## Open risks

- **Two skills have gone through the loop so far.** The author-to-merge loop is proven repeatable once (2nd skill went as smoothly as the 1st) — the real test now is whether it holds at the 5th and 10th skill too.
- **The validator's hard-fail/soft-warn line has not yet been tested against a real adversarial skill submission** (e.g. a skill deliberately shelling out) — the security-review step in `AGENTS.md` is specified but not yet exercised in practice.
- **No outside contributors exist yet**, so the "revisit at 30-40 skills or outside contributors" threshold is untested — the actual pain points that would justify more tooling are still hypothetical.

---
*Last updated: 2026-09-02. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
