# Architecture — nh-skills

This is nh-skills' **own** architecture document. Per arc42/C4 convention,
nh-skills is "the system" from its own point of view — everything outside
this repo's boundary (including the Not-Humans-Lab umbrella and its other
sibling projects) is an external actor, not an internal component. This
scoping matches where the project actually is: Phase 1 (pre-scaffold docs)
and Phase 2 (walking skeleton) of a 7-phase plan. It describes what exists
or is about to exist in Phase 2, not speculative future phases.

## Context & Scope

nh-skills is a standalone, independent GitHub repository — a personal,
curated collection of Claude Code Agent Skills (`SKILL.md` files), matching
this workspace's polyrepo convention (it is not nested inside
Not-Humans-Lab).

```
                    ┌───────────────────────────────┐
                    │   Not-Humans-Lab (umbrella)    │
                    │  docs-only meta-repo, holds     │
                    │  cross-cutting system docs      │
                    │  (../Not-Humans-Lab/)           │
                    └───────────────┬─────────────────┘
                                    │ (thematic/lineage only —
                                    │  no build/runtime dependency)
                                    ▼
   ┌───────────────┐      ┌─────────────────────┐      ┌───────────────┐
   │  nh-deck       │◄────►│      nh-skills       │◄────►│  daily-dose    │
   │  (planned      │      │  THIS repo:          │      │  (planned      │
   │  sibling,      │      │  curated Claude Code  │      │  sibling,      │
   │  not yet built)│      │  Agent Skills +       │      │  not yet built)│
   └───────────────┘      │  frontmatter validator │      └───────────────┘
                          └──────────┬────────────┘
                                     │
                          ┌──────────▼────────────┐
                          │  External consumers     │
                          │  (npx skills add,       │
                          │   manual cp -r into     │
                          │   ~/.claude/skills/)     │
                          └─────────────────────────┘
```

- **Not-Humans-Lab** (external actor): a docs-only meta-repo holding
  cross-cutting, system-level docs shared by the three sibling projects. It
  is read from (relative links), never duplicated into this repo.
- **nh-deck, daily-dose** (external actors, planned): sibling projects under
  the same umbrella. They do not exist yet at this point in the plan and are
  referenced here only as future peers with no current integration.
- **External consumers** (external actor): anyone running the third-party
  `npx skills add` installer, or doing a manual `cp -r <skill-name>/
  ~/.claude/skills/`. Both resolve purely from this repo's directory layout.
- **In scope for nh-skills itself**: authoring and validating skill content;
  the CI gate that enforces validator rules on every PR.
- **Out of scope for nh-skills itself**: packaging/distribution tooling
  beyond correct directory layout, a manifest file, a dedicated test
  framework, and anything belonging to nh-deck or daily-dose.

## Building Block View

Four building blocks make up the whole system at Phase 2:

```
nh-skills/
├── <skill-name>/SKILL.md      Building block 1: Skill content collection
│   (one directory per skill,      — the actual product. Pure Markdown +
│    e.g. nh-chaos-monkey/)        YAML frontmatter, zero runtime.
│
├── scripts/
│   └── validate-skills.mjs    Building block 2: The validator
│       (one devDependency:        — lints every SKILL.md's frontmatter
│        js-yaml)                  schema + structural conventions.
│
├── fixtures/
│   ├── valid-skill/           Building block 3: Validator fixtures
│   └── invalid-skill/             — known-good and known-bad SKILL.md
│                                   samples the validator's self-tests run
│                                   against (via node:test in test/).
│
└── .github/workflows/
    └── validate-skills.yml    Building block 4: CI gate
                                    — runs the validator as one GitHub
                                      Actions job on every PR touching
                                      **/SKILL.md.
```

Relationships:

- Building block 2 (validator) reads Building block 1 (skill collection) —
  every `SKILL.md` in the repo is its input.
- Building block 2 is verified against Building block 3 (fixtures) via
  `node:test` self-tests, independent of the real skill collection.
- Building block 4 (CI) invokes Building block 2 exactly the same way a
  local `npm run validate` would — no CI-only logic branch.

## Runtime View

The one real flow that matters at this phase — authoring a skill through to
merge:

```
 1. Author writes/edits a SKILL.md
              │
              ▼
 2. Author runs "npm run validate" locally
    (wraps: node scripts/validate-skills.mjs)
              │
              ▼
    Hard-fail checks?  ── yes ──► fix and re-run (loop back to step 1)
              │ no
              ▼
    Soft-warn checks?  ── shown, non-blocking ──►
              │
              ▼
 3. Author opens a PR
              │
              ▼
 4. CI re-runs the validator
    (.github/workflows/validate-skills.yml,
     triggered on PRs touching **/SKILL.md)
              │
        fail ─┼─ pass
        │            │
        ▼            ▼
   PR blocked   5. Human reviews and merges
```

Validator checks exercised in steps 2 and 4 (same logic, both places):

- **Hard-fail** (blocks the PR): missing/invalid frontmatter delimiters or
  YAML; missing `name`/`description`; `name` violating the
  ≤64-char/lowercase-digits-hyphens/no-XML/no-reserved-word rule; `name` not
  matching its containing folder name (protects `npx skills add` path
  resolution); `description` empty, >1024 chars, or containing XML-like
  tags; duplicate `name` anywhere in the repo; any relative file reference
  in a `SKILL.md` body that doesn't exist on disk.
- **Soft-warn** (non-blocking): `description` missing an explicit
  "when to use" clause; `description` over ~900 chars (approaching the
  ceiling); `SKILL.md` body over ~500 lines (push detail into a referenced
  file per the progressive-disclosure pattern instead of inlining it).

## Cross-references

- Umbrella-level, cross-cutting architecture context (if it exists) is owned
  by `../Not-Humans-Lab/` — link there rather than duplicating.
- This repo's literal file/directory tour lives in `codebase_map.md`
  alongside this file.
- The technology choices underlying these building blocks are documented in
  `tech.md`.
