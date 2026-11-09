# Learning Journal — nh-chaos-monkey

Append-only record of A/B trials run by skill-ab-improver against this skill's
instructions. Every entry — adopted, rejected, or tied — stays; this is a history of what
was tried, not just what won.

## 2026-11-09 — Step 4: prove each regression test on the tree just before its own fix

**Test task:** One main-session agent per arm carried out the reproducer and regression-test
items of Step 4 on a finished two-fix loop branch in a throwaway repository. Fix F-1 is real
(`add` subtracted instead of adding; its test fails on BASE on the claimed assertion). Fix F-2
("padEnd over-padded") is a refactor only: its test fails on BASE solely because F-1's bug is
still present, and it passes on the tree just before F-2 (the F-1 commit), so it guards
nothing about F-2. Each arm had its own copy of the repository and its own scratch directory,
and was told to touch nothing outside that scratch directory.

**Candidate change:** Step 4 item 6 (re-run reproducers, and test each regression test against
BASE in a temporary export) became two items. Item 6 re-runs the reproducer for each
fixed-agent-verified finding on the fixed head. Item 7 proves each finding's regression test
on the tree just before its fix (the fix commit's parent, BASE only for the first fix),
following a new "Proving a regression test guards its fix" section in
references/judge-protocol.md. That section takes the test from the fix commit, links the
worktree's dependency folders instead of installing, requires a failure on the claimed
assertion, and treats a pass (including one caused by a workspace link or editable install
that loads the fixed code), an import, syntax, collection or setup error, a name only the fix
adds, zero tests, and files lost to export-ignore as unverified. It keeps the export recipe
from PR 18 (template mktemp path inside scratch, never a worktree, checkout or stash) and
adds an absolute archive path whose name is unique per export, one chained command so a
failed archive stops the unpack, and a repeat of the status and snapshot checks afterwards.

**Scoring basis:** Deterministic. Expected verdicts: F-1 verified, F-2 unverified. Side effects
checked afterwards with git status, stash list, worktree list, branch list, HEAD and a search
for files outside scratch.

**Results:**
- Baseline: 1 of 2 findings judged correctly. F-1 verified (correct). F-2 verified (wrong): the
  test fails on BASE, which is all item 6 asks for. The agent noted in its free-text reason that
  F-2 was behaviourally redundant, but the instructions gave it no way to call the finding
  unverified.
- Candidate: 2 of 2 judged correctly. F-1 verified on BASE with the test from the fix commit;
  F-2 unverified because its test passes (exit 0) on the F-1 tree.
- Both arms: repository clean, HEAD unchanged, no stash, one worktree, no file written outside
  scratch.

**Decision:** ADOPTED

**Reasoning:** A deterministic win on the only finding that distinguishes the arms, and no
regression on F-1. Limits that qualify it: one trial per arm; a constructed scenario; the
baseline's verdict follows from its wording, so the result shows the wording matters, not how
often agents err. Only the parent-tree choice and the pass versus assertion-failure
distinction were exercised; every other clause of the new section (dependency links, editable
installs, export-ignore, import errors, the symlink and path checks, the repeat of the status
and snapshot checks) rests on review alone. The shell snippets were also run once, as written,
on the same scenario: the chain stops with exit 128 on a bad ref and unpacks nothing, and
archive names are unique per export. The trial above ran on the wording before three review
rounds changed the recipe (a unique archive name, a chained export command, the path and
symlink checks, the merged dependency-link clause, the repeated status and snapshot checks).
A confirmation trial of the final wording, one agent on a fresh copy of the same scenario,
gave the same verdicts (F-1 verified on BASE, F-2 unverified because its test passes, exit 0,
on the F-1 tree), used the chained export as written, repeated the status and snapshot checks
with identical snapshots, and touched nothing outside its scratch directory. It is one run,
not a second A/B. A last review round then widened the failure criterion from "the assertion
the finding claims" to "the way the finding claims (the wrong value, or the crash or error it
describes)", so crash findings are not marked unverified, and made the symlink check a command
run before the write; neither change was trialled.

**If adopted:** Applied on branch fix/skills-chaos-monkey-step4-prefix-tree (SKILL.md Step 4
items 6 and 7 and the per-finding closing sentence, Step 5 "exports"; references/judge-protocol.md
"Final proof" section and its new subsection; one clause in references/loop-design.md). Reaches
main only through a reviewed pull request.
