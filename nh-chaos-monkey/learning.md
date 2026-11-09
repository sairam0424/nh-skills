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

## 2026-11-09 — Confirmation of the merged Step 4 wording (PR 19, 301f652): clause trials and two live two-fix runs

This is not an A/B: no candidate was tried, and the merged wording was run as it stands.

**Test task:** (a) Four isolated scenarios, one fresh agent each, with known correct verdicts: S1 a crash finding (the test fails by a TypeError thrown in the code under test); S2 a workspace link (the worktree's linked node_modules resolves to the fixed code); S3 an import error (the fix adds the module the test imports); S4 a symlink planted in the parent tree above the test path, pointing outside the export. (b) Two live claude -p sessions of the installed skill on a fixture with two independent planted bugs (chunk drops its last partial slice, range leaves out its end), 1 round, 2 findings, no sandbox.

**Scoring basis:** Deterministic. Expected: S1 verified; S2 never a false verified; S3 unverified; S4 fix 1 verified, fix 2 unverified with nothing written outside the export. For the live runs, every claim in the session's report re-checked by hand: bare judge count, name-status diff against BASE, original test hashes, shared-git-state snapshots, leftovers in the system temp folder, and each regression test run by me on its own parent tree following the judge protocol.

**Results:**
- S1 verified, failing by the claimed TypeError. S2 unverified: the agent showed with realpath that the linked node_modules loaded the fixed code (a link made inside the export gives the real failure). S3 unverified (ERR_MODULE_NOT_FOUND, no assertion ran). S4: fix 1 verified; fix 2 unverified with the test not run because a symlink sat above its path; the outside directory stayed empty and no repository was touched.
- Live run 1: the session exited with status 0 and a "waiting for the completion notification" message because claude -p stops background work still running ten minutes after the session's last turn (stderr said so). The loop had already committed both fixes, but Step 4 never ran in the session. I then ran the recipe myself on those real commits: the range test fails 3 of 3 on BASE, the chunk test fails 2 of 4 on the range-fix tree, both pass on the fixed head. This run does not show the session following items 6 and 7.
- Live run 2, with CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0: the session finished (14 turns, about 1.95M tokens and $7.84 client-side from the client's own figures, 26.5 minutes including a 10-minute guard hold; the session reported 17 agents) and reported both fixes fixed-verified. For each fix it set PARENT to the fix commit's parent (BASE for the range fix, the range-fix commit for the chunk fix), checked ls-tree before writing, made the chained mktemp, git archive -o and tar export, and repeated its snapshot and status checks. My re-checks agreed: judge 12 of 12 against a baseline of 4, diff exactly two modified files and two added tests, original tests unchanged, snapshots identical, the range test fails 3 of 3 on BASE and the chunk test fails 3 of 5 on the range-fix tree (the other two tests were never meant to catch the bug).

**Decision:** CONFIRMED. The merged wording is unchanged by these runs.

**Reasoning:** One trial per scenario and two live runs, on a constructed fixture, Both live sessions' stderr warns that Opus 5.5 is unavailable and Sonnet 4.5 would be used, while every model id in both streams is claude-sonnet-5-5; the model of the loop's own agents is not in the stream. Not shown: Python or Go, a real node_modules in a live run, export-ignore files, a halted run with an uncommitted fix. Two things the runs surfaced, handled as documentation only: the ten-minute claude -p ceiling (note added to SKILL.md and loop-design.md), and a ten-minute stall: in run 2 the session first ran the "does a new test file raise the count" canary in the worktree (printf into test/, npm test, rm -f), a local guard held that command without running it because it contained an rm, the worktree stayed clean, and the session redid the check in a throwaway export; in run 1 the guard also held a command that was already in a throwaway export, because of its rm -rf. Step 2 item 6 now says to use a throwaway export so the worktree stays clean; it does not avoid the guard. The session also used a second scratch directory for its proof exports instead of the one from Step 2; harmless, left as is.

## 2026-11-09 — Recall test on code with no planted bugs: MindForge bin/worktree/engine.js (lead-only, filtered judge)

This is not an A/B: no candidate was tried. It asks what the skill finds on real code nobody planted bugs in.

**Test task:** One headless claude -p run of the installed skill, lead-only (nothing is fixed), 2 rounds, up to 6 findings per round, on a local clone of the user's MindForge (commit 3d74d88f), target bin/worktree/engine.js: 497 lines, 5 test cases, and, per the reviewers' greps, no file in the repository other than its own test calls it. The project's full test command could not be the judge. After two failures caused by the clone itself were fixed (the clone's origin pointed at a local path instead of the real URL, and the SDK's lint dependencies were not installed), one test file still passed 6 of 6 but took 433 seconds against the runner's 60-second per-file limit, under heavy load from unrelated jobs (load average 11 to 27). The user approved the filtered judge `node tests/run-all.js --filter=worktree-engine` (green in 6 seconds, "1 passed, 1 total") for this run, which edits nothing, and the session was told to say so in its report.

**Candidate change:** None.

**Scoring basis:** Each reproducer was read and then run twice by me from the loop worktree. Five fresh read-only reviewers then judged, by reading the code and grepping for callers (nothing executed), whether each confirmed break is a real defect against the module's contract as far as they could infer it from its comments, tests and callers, and reachable from real callers, and triaged the unconfirmed leads from code alone.

**Results:**
- Run: 34 minutes, exit 0, no ceiling kill (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0), $14.61 client-side. By the session's own report: 16 agents, about 2.41M subagent tokens, 2 rounds, all five lenses answered both rounds. 4 breaks confirmed (class confirmed-unfixed), 10 candidates left in the backlog (8 distinct leads: two of them were each reported twice), nothing fixed. Verified by me: the clone and the loop worktree are clean, HEAD equals BASE with no commits, the shared git state snapshots are identical, the user's real repository shows no changes, and all four reproducers exited 1 in both of my runs.
- Confirmed breaks, judged by the reviewers: 2 of 4 are real defects. A fresh worktree is dirty when node_modules is symlinked and the repository ignores it with a trailing slash, so rebaseOntoBase refuses (medium; reachable only through the exported API, with no in-repo caller). A path such as app/[id]/page.tsx is treated as a glob by git, so another file's edit gets staged (low, reachability unknown). The other 2 were judged by design or unreachable: a race inside git's own worktree add across 32 simultaneous processes, and remove() falling back to deleting the directory after git refuses (deliberate; a locked worktree is a narrow hardening gap and the main-tree case is misuse).
- Unconfirmed leads, triaged from code only: 7 of 8 look real (2 medium, 5 low) and 1 is misuse-only.
- Reviewers: 0.82M subagent tokens. Findings and reproducers are saved in the user's private research folder.
- The launcher passed --token-budget 6000000. Reading chaos-loop.js afterwards showed that the loop has no such argument and that its only budget check (line 754) reads the runtime's own token target.

**Decision:** CONFIRMED. The loop is unchanged. Two documentation corrections follow from this run (below).

**Reasoning:** One module and one run, reviewers who read code and ran nothing, and a filtered judge, so this shows what the skill can do unattended on real code, not a rate. Two things it did show. A reproducer that fails twice proves a behaviour, not that the module's documentation forbids it, so about half of the confirmed breaks were real defects here; the loop-design known limits now say to read each confirmed break against the module's contract and callers. And the documented --token-budget argument had no mechanism, so it is removed from the argument hint and the non-interactive paragraph now says a headless run is bounded by the round and finding caps and by the launcher's own spending limit. Not shown: a fixing run on unplanted bugs, and Python or Go targets.
