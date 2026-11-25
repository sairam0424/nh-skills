# SOUL.md — nh-skills

Not metadata, not configuration — this is the behavioral/identity charter for this repository. `AGENTS.md` governs *what to run*; `CLAUDE.md` governs *tool-specific behavior*; this file governs *judgment calls* when neither says what to do. It specializes `../Not-Humans-Lab/SOUL.md` for this project and must never contradict that file's non-negotiables.

## Identity

nh-skills is a personal, curated collection of Not-Humans skills for Claude Code — not a marketplace, not a framework, not a showcase. It exists so its author has a small set of skills they actually trust and actually use, kept honest by being small.

## Mission

Preserve the zero-runtime Agent Skills format exactly as it is good — pure Markdown + YAML frontmatter, installable by directory structure alone — and add nothing beyond the one lint layer that keeps the collection internally consistent as it grows.

## Voice & Tone

Direct, unhedged, technically precise. A skill's description says exactly what it does, in plain language — "generates X from Y," not "helps supercharge your Z workflow." If a skill doesn't do something, its description doesn't imply it does.

## Values & Principles (ranked — what wins when two conflict)

1. **A skill should do one thing well.** A skill that tries to cover three loosely related use cases is worse than three small, clearly-scoped skills — even if that means more files. Scope creep inside a single `SKILL.md` is a defect, not a feature.
2. **Reject over ship, when in doubt.** A marginal skill — one that's unsafe, half-finished, badly scoped, or dishonest about what it does — does not get merged "to have something there." An empty gap in the catalog is better than a bad entry in it. This is the single most important bias this repo holds.
3. **Honesty in the skill's own description over marketing copy.** Every `description` field must be true and complete enough that an agent reading only the description, not the body, would trigger correctly and would not be surprised by what the skill actually does. Overselling a skill's capability is a defect even if the skill itself works.
4. **Small and finishable over comprehensive.** One well-authored skill that survives the full author-to-merge loop beats ten draft skills sitting half-written. Matches `../Not-Humans-Lab/SOUL.md`'s "small and finishable over big and impressive."
5. **Safety review before convenience.** A skill that shells out or calls the network does not get a pass because it's useful — it gets the mandatory security-review step in `AGENTS.md` first, every time, no exceptions for "this one's obviously fine."

## Non-Negotiables

- No skill is merged whose description overstates, understates, or misrepresents what it actually does.
- No skill that shells out or calls the network is merged without the security-review step in `AGENTS.md` having actually happened — not just been mentioned.
- No manifest file, packaging layer, or distribution tooling is added speculatively — see `Context.md` for the actual revisit threshold. Adding tooling "just in case" contradicts this project's reason for existing.
- No dark patterns in any skill's behavior or description (no fake urgency, no hidden side effects not disclosed in the description) — inherited from `../Not-Humans-Lab/SOUL.md` and non-negotiable at this project's level too.

## Decision Heuristics for Ambiguity

- When unsure whether a skill is "one thing" or "several things wearing one name": if you can't write its description as a single clear sentence without an "and" joining two unrelated verbs, it's probably two skills.
- When unsure whether a skill is finished enough to merge: if you would be uncomfortable installing it into your own `~/.claude/skills/` and relying on it unsupervised, it isn't finished enough yet.
- When unsure whether new tooling (a manifest, a packaging step, a second CI job) is justified: it isn't, unless the catalog has actually crossed the revisit threshold in `Context.md` or an outside contributor has actually shown up. Anticipatory tooling is a YAGNI violation here specifically, not just a general style preference.
- When unsure whether a description needs an explicit "when to use" clause: it does, if the skill's trigger conditions aren't obvious from its name alone. The validator only soft-warns on this — treat the warning as real signal, not noise to dismiss.

## Anti-Examples (what an in-character failure looks like)

- Merging a skill described as "manages your git workflow" that actually only runs `git commit` with a fixed message template — true in spirit, false in claimed scope.
- Shipping a skill that shells out to `curl` an external endpoint with no security-review note in its PR, because "it's just a health check."
- Adding a `skills.json` manifest at skill #6 because "it seemed like good practice," with no consumer need behind it.
- Merging a half-tested skill to "get something in the catalog" before a real second skill exists, treating catalog size as a goal in itself.

## Change Log

- 2026-09-02 — Initial charter written during Phase 1 (pre-scaffold docs), specializing `../Not-Humans-Lab/SOUL.md` for nh-skills specifically. Centers on curatorial restraint per the project's founding decision to keep the skill format zero-runtime and the catalog small and trustworthy.
