# agent_learning.md — nh-skills

Append-only, dated register of corrections applied to AI agents working in this repo — companion to `AGENTS.md`/`CLAUDE.md` (which hold current-state static instructions), not a replacement. This file holds the *history of why* those instructions exist.

**Scope:** learnings specific to this project's own code/domain. A learning that recurs in two or more sibling projects' own `agent_learning.md` files gets copied up to `../Not-Humans-Lab/agent_learning.md`, with a one-line pointer left here.

## Entries

### 2026-09-02 — Promoted to system level

The "parallel docs-writing agents describe aspirational structure that drifts from real code" learning recurred here too (this repo's own `AGENTS.md` pointed at `scripts/validate-skills.test.mjs` for its test file when the real path was `test/validate-skills.test.mjs`) as well as in nh-deck and daily-dose. Full entry, root cause, and the standing rule now in force: see `../Not-Humans-Lab/agent_learning.md`.

## Entry format

- **Date**
- **Trigger** — what prompted the entry
- **Observation** — what the agent did or assumed, verbatim where useful
- **Root cause** — why the agent got it wrong
- **Correction / Rule** — the concrete, checkable rule now in force
- **Scope** — this-project-only vs. system-wide (system-wide entries get promoted, see above)
- **Status** — active | superseded | promoted-to-AGENTS.md (with a link to where it landed)
