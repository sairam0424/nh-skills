# Learning Journal — nh-chaos-monkey

Append-only record of A/B trials run by skill-ab-improver against this skill's
instructions. Every entry — adopted, rejected, or tied — stays; this is a history of what
was tried, not just what won. For the first public release, dollar figures were removed from the entries below;
token counts and times are kept.

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
- Live run 2, with CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0: the session finished (14 turns, about 1.95M tokens from the client's own figures, 26.5 minutes including a 10-minute hold by a local safety hook; the session reported 17 agents) and reported both fixes fixed-verified. For each fix it set PARENT to the fix commit's parent (BASE for the range fix, the range-fix commit for the chunk fix), checked ls-tree before writing, made the chained mktemp, git archive -o and tar export, and repeated its snapshot and status checks. My re-checks agreed: judge 12 of 12 against a baseline of 4, diff exactly two modified files and two added tests, original tests unchanged, snapshots identical, the range test fails 3 of 3 on BASE and the chunk test fails 3 of 5 on the range-fix tree (the other two tests were never meant to catch the bug).

**Decision:** CONFIRMED. The merged wording is unchanged by these runs.

**Reasoning:** One trial per scenario and two live runs, on a constructed fixture, Both live sessions' stderr carried a model-fallback warning, while every model id in both streams is claude-sonnet-5-5; the model of the loop's own agents is not in the stream. Not shown: Python or Go, a real node_modules in a live run, export-ignore files, a halted run with an uncommitted fix. Two things the runs surfaced, handled as documentation only: the ten-minute claude -p ceiling (note added to SKILL.md and loop-design.md), and a ten-minute stall: in run 2 the session first ran the "does a new test file raise the count" canary in the worktree (printf into test/, npm test, rm -f), a local safety hook held that command without running it because it contained a deletion command, the worktree stayed clean, and the session redid the check in a throwaway export; in run 1 the hook also held a command that was already in a throwaway export, because of its rm -rf. Step 2 item 6 now says to use a throwaway export so the worktree stays clean; it does not avoid the hook. The session also used a second scratch directory for its proof exports instead of the one from Step 2; harmless, left as is.

## 2026-11-09 — Recall test on code with no planted bugs: MindForge bin/worktree/engine.js (lead-only, filtered judge)

This is not an A/B: no candidate was tried. It asks what the skill finds on real code nobody planted bugs in.

**Test task:** One headless claude -p run of the installed skill, lead-only (nothing is fixed), 2 rounds, up to 6 findings per round, on a local clone of the user's MindForge (commit 3d74d88f), target bin/worktree/engine.js: 497 lines, 5 test cases, and, per the reviewers' greps, no file in the repository other than its own test calls it. The project's full test command could not be the judge. After two failures caused by the clone itself were fixed (the clone's origin pointed at a local path instead of the real URL, and the SDK's lint dependencies were not installed), one test file still passed 6 of 6 but took 433 seconds against the runner's 60-second per-file limit, under heavy load from unrelated jobs (load average 11 to 27). The user approved the filtered judge `node tests/run-all.js --filter=worktree-engine` (green in 6 seconds, "1 passed, 1 total") for this run, which edits nothing, and the session was told to say so in its report.

**Candidate change:** None.

**Scoring basis:** Each reproducer was read and then run twice by me from the loop worktree. Five fresh read-only reviewers then judged, by reading the code and grepping for callers (nothing executed), whether each confirmed break is a real defect against the module's contract as far as they could infer it from its comments, tests and callers, and reachable from real callers, and triaged the unconfirmed leads from code alone.

**Results:**
- Run: 34 minutes, exit 0, no ceiling kill (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0). By the session's own report: 16 agents, about 2.41M subagent tokens, 2 rounds, all five lenses answered both rounds. 4 breaks confirmed (class confirmed-unfixed), 10 candidates left in the backlog (8 distinct leads: two of them were each reported twice), nothing fixed. Verified by me: the clone and the loop worktree are clean, HEAD equals BASE with no commits, the shared git state snapshots are identical, the author's real repository shows no changes, and all four reproducers exited 1 in both of my runs.
- Confirmed breaks, judged by the reviewers: 2 of 4 are real defects. A fresh worktree is dirty when node_modules is symlinked and the repository ignores it with a trailing slash, so rebaseOntoBase refuses (medium; reachable only through the exported API, with no in-repo caller). A path such as app/[id]/page.tsx is treated as a glob by git, so another file's edit gets staged (low, reachability unknown). The other 2 were judged by design or unreachable: a race inside git's own worktree add across 32 simultaneous processes, and remove() falling back to deleting the directory after git refuses (deliberate; a locked worktree is a narrow hardening gap and the main-tree case is misuse).
- Unconfirmed leads, triaged from code only: 7 of 8 look real (2 medium, 5 low) and 1 is misuse-only.
- Reviewers: 0.82M subagent tokens. Findings and reproducers are saved in the author's private notes.
- The launcher passed --token-budget 6000000. Reading chaos-loop.js afterwards showed that the loop has no such argument and that its only budget check (line 754) reads the runtime's own token target.

**Decision:** CONFIRMED. The loop is unchanged. Two documentation corrections follow from this run (below).

**Reasoning:** One module and one run, reviewers who read code and ran nothing, and a filtered judge, so this shows what the skill can do unattended on real code, not a rate. Two things it did show. A reproducer that fails twice proves a behaviour, not that the module's documentation forbids it, so about half of the confirmed breaks were real defects here; the loop-design known limits now say to read each confirmed break against the module's contract and callers. And the documented --token-budget argument had no mechanism, so it is removed from the argument hint and the non-interactive paragraph now says a headless run is bounded by the round and finding caps and by the launcher's own spending limit. Not shown: a fixing run on unplanted bugs, and Python or Go targets.

## 2026-11-12 — End-to-end verification of the installed skill (main 40aa7f5): terminal and agent surfaces

This is not an A/B: no candidate was tried. It observes the shipped skill at its real surfaces, with no unit test used as evidence.

**Test task:** (a) The sandbox-probe.mjs CLI on a throwaway worktree: usage errors, unsandboxed on the real environment, under a real macOS Seatbelt sandbox, under two deliberately broken sandboxes, JSON output, and a planted secret-looking variable. (b) Four headless claude -p sessions of the installed skill (the 10-minute background ceiling lifted, an outer cost cap on each): no --judge given; a fixture whose judge is red on purpose; a valid lead-only run that also passes --token-budget; and the full fixing loop on a fixture with two independent planted bugs.

**Candidate change:** None.

**Scoring basis:** Expected outcomes were written down in the working session before each run (no file keeps them). For the fixing run, every claim was re-checked by hand: repository state, commit parents, the diff against BASE, the original tests' hashes, both reproducers on the fixed head, and each regression test on its own parent tree following the judge protocol.

**Results:**
- Probe: no arguments, a relative workdir and an unknown flag each exit 2 with the usage line. Unsandboxed it reports not-enforced and exit 1 with all 8 probes allowed (credential files openable, secret-looking variable names visible, egress to a public address) and leaves nothing behind. Under Seatbelt, started with a cleaned environment (env -i), it reports enforced and exit 0 with 8 of 8 blocked; the secret-variable probe passes because of the clean environment, not because of the profile. A sandbox with the network left open, and one with a writable shared .git directory, were each reported as not-enforced with the leak named. The JSON output parsed and carried the verdict, and a planted secret-looking variable's name appeared in the output while its value did not.
- No --judge: the session stopped before Step 2, created no worktree, branch or scratch directory, ran no project code, and printed the missing arguments and a command that would work. That command contained a --target flag the skill does not have.
- Red judge: the session ran the judge on a throwaway export, saw the failure, and refused to start. It edited, skipped and narrowed nothing, spawned no agents and created no worktree. It left its export in the system temp folder because a local safety hook held its deletion, and it did not retry.
- --token-budget on a valid lead-only run: the session reported the flag was not enforced and found the real defect in the fixture. It also reduced the run from five lenses to one on its own "to stay near the budget's intent" and said so. 457,600 subagent tokens by the workflow's state file.
- Full fixing loop: 20.7 minutes, no ceiling kill. Verified by me: the primary checkout clean on main, two commits whose parents are BASE and then the first fix, a diff of exactly two modified source files and two added test files (3 and 4 cases), the original tests unchanged, both reproducers exit 0 on the fixed head, the range test fails 3 of 3 on BASE and the chunk test fails 2 of 4 on the first fix's tree, both passing on the fixed head. The main session ran 19 shell commands, none forbidden and none held by the local hook; the 17 loop agents' 128 tool calls were not recorded, and the loop ran without a sandbox (--accept-no-sandbox); it tried the "new test file raises the count" check in a throwaway export under its scratch directory. By the workflow's state file: 17 agents, about 2.0M subagent tokens, a loop of 15.6 minutes.
- The skill was registered once under nh-chaos-monkey in each session, and no nh-breaker entry existed.

**Decision:** CONFIRMED. No documented guarantee was broken at any surface exercised. Two documentation gaps were found and are corrected in the same change as this entry: the target is a positional argument and there is no --target flag, and a --token-budget passed anyway must be reported as ignored without narrowing the run. A third observation is left unchanged on purpose: the red-judge session ran the judge before creating any worktree, which the skill does not ask for. That ran project code before the sandbox probe could pass, and with no scratch directory yet it left its export in the system temp folder; the documented order (worktree, scratch directory, then the judge) stays as it is.

**Reasoning:** One fixture per mode, one model family (all four sessions' stderr carried a model-fallback warning, but every model id in the init events and the usage records, and for the 17 loop agents of the fixing run, is claude-sonnet-5-5), and a machine under heavy load (a load average of 56 in an uptime reading during the runs, not saved), so this shows the shipped behaviour on small fixtures, not a rate. Not exercised: the injection canary on this version, Python or Go targets, the Linux sandbox and srt, adaptive injection payloads, and the npm ci install path (not exercised here; the earlier recall run's session ran it in its worktree, but that transcript is deleted and the entry for it does not record the command).

## 2026-11-13 — Post-merge probes of the installed skill (main b6e5f9a): the three documentation fixes at the agent surface

This is not an A/B: no candidate was tried. It checks that the wording merged after the 2026-11-12 verification works in fresh sessions.

**Test task:** Two headless claude -p sessions of the installed skill (identical to the repository folder, 9 of 9 files; background ceiling lifted; an outer cost cap on each), each on a small throwaway fixture. (a) No --judge given. (b) A valid lead-only run (1 round, 1 finding) with a stray --token-budget 100000 passed.

**Candidate change:** None.

**Scoring basis:** Expected outcomes: (a) stops before creating anything and prints a command with no --target flag and without the consent flags; (b) reports the budget flag as ignored, keeps the five default lenses and the caps, and still finds the planted bug. For (b) the repository state, the worktree and the reproducer were re-checked by hand.

**Results:**
- (a) 7 turns, 6 tool calls (4 reads, 2 shell commands), no workflow launched. It stopped before Step 2 and created nothing (one worktree, branch main only). The command it printed had no --target flag, and it left --accept-no-sandbox off with the reason that accepting the risk is the user's call. One sentence in its prose, "There is no --accept-no-sandbox flag", meant "not in this invocation" and reads ambiguously; left unchanged.
- (b) 15 turns, one workflow launch. The arguments it passed were the target, workdir, scratch, judge command, testCountHint, fixEnabled false, maxRounds 1 and maxFindingsPerRound 1, with no lens list, so the five default lenses ran and all five answered. It wrote that the --token-budget flag was ignored because the loop has no such argument, and that it did not reduce lenses or caps because of it. It found the real chunk() bug (confirmed-unfixed, lead-only). By the session's own report: 8 agents and about 0.92M subagent tokens.
- Checked by me: the primary checkout clean at the fixture's HEAD; the loop worktree on its chaos/ branch with a clean tree and no commits; the 32-line reproducer exits 1 on both of my runs and leaves the worktree clean; the shared git state snapshots differ only by the new worktree listing line, as expected.

**Decision:** CONFIRMED. The target-argument, consent-flag and --token-budget wording works in a fresh session. The merged text is unchanged.

**Reasoning:** One session per mode on small fixtures, so this shows the wording is followed, not how often. Not exercised: a fixing run on this version, Python or Go, the Linux sandbox, adaptive injection, and the dependency-install step.

## 2026-11-23 — Run the sandbox probe before the install and the judge (issue 25, first item)

**Test task:** Twelve independent trial agents, one per (arm, scenario, trial), each given a throwaway git repository and the skill folder of its arm (baseline = main at 582d816, candidate below), told the user's confirmed defaults, and told to carry out Step 2 with real commands and then stop without starting the loop. Three scenarios, two trials each: S1, a sandbox in use whose probe is really enforced (the probe ran under a real macOS Seatbelt profile); S2, a sandbox claimed but the probe really reports not-enforced (run unsandboxed in a fake home); S3, no sandbox and --accept-no-sandbox. PATH shims for node and npm wrote an event log (PROBE, INSTALL, JUDGE) outside the agents' control; the probe in S1 and S2 was the repository's own sandbox-probe.mjs, not a stub.

**Candidate change:** In SKILL.md, Step 2 runs the probe at item 5, right after the git-state snapshot and before the install (item 6) and the judge (item 7); a verdict other than enforced stops the run before any project code, unless the user accepts the risk. The Step 1 sandbox bullet says the probe runs before the install and the judge and names the install as the one step that may need the network (the old text said both that the session has no network and that the install needs it). The non-interactive paragraph's "Step 2.5" became "before the install (Step 2, item 6)". In references/safety-runner.md, "the end of Step 2" became "Step 2, item 5".

**Scoring basis:** Deterministic, from the event logs and the repositories, not from the agents' reports, scored by trial id before the arms were revealed. S1: probe ran once and exited 0; the probe came before any install or judge; install and judge both ran; a worktree on a chaos/ branch with a clean primary checkout. S2: probe ran once and exited non-zero; no install and no judge ran; the same worktree check; the report says it stopped or that the sandbox is not enforced. S3: no probe; install and judge ran; the same worktree check.

**Results:** Candidate 24 of 24, baseline 20 of 24. S1: candidate 8 of 8 (probe, install, judge), baseline 6 of 8 (install, judge, probe, in both trials). S2: candidate 8 of 8 (the probe ran, failed and nothing else ran, in both trials), baseline 6 of 8 (install and judge ran before the probe found the sandbox was not enforced, in both trials). S3: 8 of 8 for both arms, with no probe run and nothing else changed. Cost: 12 agents, about 1.53M subagent tokens by the workflow's figures, 4.4 minutes.

**Decision:** ADOPTED.

**Reasoning:** The only difference between the arms that mattered was the order, and the baseline's failures follow directly from its wording, so this shows the new wording is followed and breaks nothing in the three situations, not how often an agent would get the order wrong. Limits: two trials per cell, one fixture, one model family; the agents could read the shim scripts in their PATH folder; one candidate-arm agent read the fixture's stand-in home .npmrc by mistake, said so and flagged that the skill says not to read credential files (nothing real was in it); one agent added npm flags to keep the cache out of the home directory. Not tested: a real loop run after the reordered Step 2, which is covered by the live runs recorded after this entry.

## 2026-11-23 — Probe gate and the install under a blocked network (follow-up to the release-candidate review)

**Test task:** An independent read-only review of the release candidate (0 high, 6 medium, 8 low) found two gaps in the reordered Step 2: "if a sandbox is in use" lets a session decide for itself that none is, and the install was undefined when the sandbox blocks the network. Ten trial agents carried out Step 2 as in the earlier entry (same shims and fixture, the repository's own probe). S1 and S3 repeated the earlier scenarios as a regression check (candidate only, one trial each); S4: nobody says whether a sandbox is in use, no flag, and the probe really reports not-enforced; S5: non-interactive, the sandbox is really enforced (Seatbelt) but allows no network, and `npm ci` fails with ENETUNREACH. Two trials per arm for S4 and S5.

**Candidate change:** Item 5 starts "Unless the user or --accept-no-sandbox has accepted running without a sandbox, run the probe", uses the probe's path in the skill folder, and on a verdict other than enforced stops and names the worktree, branch, scratch directory and snapshot file it created; accepting the risk is allowed for trusted code only. Item 6 puts the package manager's cache and logs under SCRATCH, says that a sandbox that blocks the network means the install cannot run, lets the user install themselves or knowingly open the network for that one step and then close it and re-run the probe, and says a non-interactive run never opens the network and stops and prints the install command. The description says the network ban excepts an install the user approves. In references/safety-runner.md the recommended runner lists the probe before the install and says how the install gets network.

**Scoring basis:** Deterministic, from the shim event logs and the repositories, scored by trial id before the arms were revealed. S4: the probe ran first, no install and no judge ran, a worktree on a chaos/ branch with a clean checkout, and the report names what was created. S5: the probe ran first and passed, the install was attempted once or twice, the judge did not run, the same worktree check, and the report names the network and an install command.

**Results:** S4: baseline 8 of 8, candidate 8 of 8 (every agent probed first even without a sandbox statement, so the reviewer's skip scenario did not occur in four trials). S5: baseline 8 of 10 (both trials ran the judge after the failed install), candidate 10 of 10 (both stopped at the install and printed the command). S1 and S3: candidate 3 of 3 each, unchanged behaviour. Cost: 10 agents, about 1.28M subagent tokens, 4.3 minutes.

**Decision:** ADOPTED.

**Reasoning:** The S5 gain is deterministic and the baseline's failure follows from its missing rule. The S4 clause is not shown to matter in four trials; it stays because it removes the session's discretion over a safety gate and broke nothing. Limits: two trials per cell, one fixture and one model family; the fixture has no dependencies, so the install failure is simulated by a shim; S1 and S3 had no same-round baseline and are compared with the earlier entry. One trial agent in a plain environment reported the probe listing PWD as secret-looking. That was a defect in the probe's new name rule, not in the wording: it is fixed in the probe with a test (a bare PWD is the current directory) and is outside this comparison.
