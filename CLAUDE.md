@AGENTS.md

## Claude Code

This addendum is Claude-specific behavior only, on top of the shared instructions in `AGENTS.md`. Keep this file under 200 lines — push anything that grows beyond a short addendum into `AGENTS.md` or a referenced doc instead.

### Required path for adding or editing a skill

**Prefer the `skill-creator` and `skill-ab-improver` workflows over freehand file edits.** Do not hand-write or hand-edit a `SKILL.md` directly as the default path:

- **Creating a new skill** — use the `skill-creator` skill. It handles frontmatter scaffolding, name/folder matching, and description-quality conventions that are easy to get wrong by hand.
- **Editing an existing skill, or testing whether a proposed edit actually helps** — use `skill-ab-improver` when the change is a genuine "does this edit improve triggering/output" question, not a trivial typo fix. For small mechanical fixes (a broken relative link, a typo), a direct edit via `Edit`/`Read` is fine — the workflow requirement is about skill *authoring quality*, not about blocking every one-line fix.
- If asked to add or improve a skill and neither workflow is invoked, stop and invoke the appropriate one before writing to `SKILL.md` — this is the required path, not a suggestion to weigh against freehand editing.

### Before proposing any skill-related change as done

Run the validator locally and confirm it passes:

```bash
npm run validate
```

Do not tell the user a skill addition/edit is ready for review, ready to commit, or "done" without having run this command in the current session and seen it pass. A clean-looking `SKILL.md` is not sufficient evidence — the validator checks things (name/folder match, duplicate names across the whole repo, dead relative file references) that are easy to miss by inspection alone.

If the validator reports hard-fails, fix them before proposing the change as complete. If it reports soft-warnings (missing "when to use" clause, description length, body length), surface them to the user rather than silently ignoring them — they are non-blocking for CI but are real signal about skill quality.

### Security-sensitive skills

If a skill's `SKILL.md` body instructs an agent to shell out or call the network, treat this as a **Tier 3 / security-sensitive change** per this workspace's global auto-trigger convention. Do the mandatory security-review step described in `AGENTS.md` before proposing the skill as ready to merge — `npm run validate` passing does not clear this requirement, since the validator does not evaluate intent or safety of what a skill instructs an agent to do.

### Scope discipline

- This repo has no application runtime. Do not scaffold a framework, add a bundler, or introduce a manifest file speculatively — see `Context.md` for the actual revisit threshold before adding tooling.
- Do not create new top-level docs (README variants, extra planning files) unless explicitly asked — this repo already has `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, and `Context.md` as its doc set, plus whatever `../Not-Humans-Lab/` covers by reference.
- When a request is ambiguous between "add this to nh-skills" and "this belongs in Not-Humans-Lab" (cross-project), default to nh-skills unless it demonstrably constrains or cuts across another sibling project — see `../Not-Humans-Lab/SOUL.md`'s decision heuristic (project-level by default, promote to system-level only once it recurs).

### Curatorial bar

Read `SOUL.md` before authoring or approving a new skill. The short version: bias toward rejecting a marginal skill rather than shipping an unsafe or half-finished one. Do not talk yourself into "good enough for now" on a skill's description accuracy or safety review — that judgment call is exactly what `SOUL.md` exists to pre-commit against.
