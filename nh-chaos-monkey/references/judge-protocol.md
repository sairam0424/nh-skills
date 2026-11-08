# Judge protocol

The judge is the one thing in a breaker loop that must not be an opinion. Everything else (breakers, fixers, verifiers) is a language model reasoning; the judge is a command whose exit status and output a human can reproduce. Read this before confirming the contract with the user, and again if the judge looks weak.

## What counts as a judge

A command that the project already documents and that:

- exits non-zero when anything fails and zero only when everything passes,
- runs a countable number of tests (the loop requires a count of at least 1, so "zero tests ran, exit 0" can never pass),
- is deterministic enough to run several times in a row with the same result,
- runs without network access or credentials.

Use the project's own command exactly as documented (for example the test script in its manifest). Do not invent a narrower one. Do not pipe it into another program, add flags that narrow it, or add "always succeed" suffixes: the tool's own exit status is the evidence. The script screens for the obvious violations (pipes, semicolons, a background ampersand, tee, and flags such as bail or ignore) as a best effort only; the user's confirmation of the exact command in Step 1 is the real control.

Check that the command can see new tests. Some test scripts name specific files, for example a script that passes one test file to the runner. A regression test the fixer adds in another file is then never run, the test count never rises, and every fix is rejected. In that case use the runner's own discovery form of the same command, which runs the same tests plus new ones, confirm that its baseline count equals the documented command's, and tell the user in the contract. A real run found this only after the contract was confirmed, so read the test script before launching.

If the project has no such command, run in lead-only mode (set fixEnabled to false): breakers and confirmers still run, so you get proven breaks, but nothing is fixed and nothing is claimed as fixed.

## The protected set

Anything that defines "correct" or "green" must be outside the fixer's write scope, because a fixer under pressure to turn a red judge green will otherwise weaken the judge. Protect, at minimum:

- existing tests, fixtures, snapshots, golden files,
- lint, type-check, coverage and test-runner configuration,
- CI workflow files,
- dependency manifests and lockfiles.

The loop hashes every tracked file in these paths into a manifest before anything is attacked, and after every fixer attempt and every rejudge it checks the manifest with the standard checksum tool and also asks git for any protected file modified or deleted since the base commit. The second check does not depend on the manifest, which the fixer could in principle rewrite. A modified or deleted protected file fails the check. Files that git ignores (dependency folders, build output) are not covered by either check, and neither is a change to the ignore rules themselves, which is why the ignore file is on the default protected list. New test files are allowed and expected: that is how a regression test gets in. The defaults also cover co-located tests and common runner, type and lint configuration through glob pathspecs, but a project with an unusual layout still needs its own list.

If the default protected paths do not match the project's layout, pass protectedPaths explicitly. The loop refuses to start when the manifest lists no files, because an empty protected set protects nothing.

## What counts as a confirmed break

A break is confirmed only when all of these hold:

1. A reproducer exits non-zero on the current tree, in two separate runs (a flaky reproducer is a lead, not a break).
2. The failure output shows the claimed defect, not an unrelated crash of the reproducer itself.
3. A real caller could reach the behavior through a public entry point or documented contract (the legitimacy gate; it filters misuse and poking at private internals).

Anything else is a lead (plausible, not proven) or invalid. Leads are reported, never fixed.

## What counts as a verified fix

All of these, each from command output, none from the fixer's say-so:

1. The protected checks pass: the manifest check exits 0, git reports no protected file modified, deleted, renamed or type-changed since the base commit, and no file was added under the protected paths other than the regression tests the loop has declared (a new CI workflow, git hook or tool config is an added file too).
2. The reproducer now exits 0.
3. The judge exits 0 and its test count is higher than before the fix.
4. The regression test fails when copied onto the pre-fix commit (so it really guards the fix).
5. The diff touches no protected file, skips or loosens no test, hardcodes no expected value, and fixes the cause rather than the symptom.
6. The reproducer file still has the hash recorded when the break was confirmed, so the evidence was not edited.

After each round that committed fixes, a separate agent re-runs the judge and the manifest check and must agree with the verifier on the test count and the head commit. Disagreement halts the loop.

## Outcome classes

| Class | Meaning |
| --- | --- |
| fixed-agent-verified | Confirmed break, fix passed every check above according to the loop's agents, committed on the loop's own branch. It becomes fixed-verified only after the main session's own final checks pass |
| confirmed-unfixed | Confirmed break, fix attempts exhausted or fixing disabled; the work of rejected attempts is kept under refs/chaos/rejected and in the git stash, which is shared with the primary checkout |
| superseded | A break whose reproducer passed again after an earlier fix, found by a one-run recheck in the same round or by a carried-over backlog candidate that passed twice after commits; it was not fixed separately |
| lead | Not confirmed: flaky, reachable but the failure does not match the claim, or its confirmer never answered |
| invalid | The confirmer judged it not reachable through a public entry point or the documented contract |

Report all five. A report that lists only successes hides the loop's real hit rate.

## A green judge is evidence, not proof

In the manual review in the SoK on DARPA's AIxCC competition (arXiv 2602.07666, 2026), patches from the authors' own reference runs that passed build, proof-of-vulnerability replay and the project's tests were still judged semantically wrong in 37.7% (20 of 53) of cases for one agent and 45.6% (26 of 57) for another. Those are small lab samples, so read them as a warning, not a rate. What follows for this skill:

- A fix is only fixed-agent-verified. The independent verifier, the rejudge and the main session each add a check, and none of them replaces reading the diff.
- Confirmation is a separate, executed step. A finder's own crash or claim is never enough: Google's OSS-Fuzz-Gen work reports that validating crashes from generated fuzz drivers against realistic entry points removed more than half of the crashes first classed as program errors.
- Skepticism has to be built in. Anthropic reports that LLM evaluators stay lenient toward LLM output and that tuning a separate evaluator to be skeptical is more tractable than making a generator self-critical. The verifier here runs commands and reports numbers; the diff-review fields (rootCause, testsWeakened, specialCased) are model judgement, so the main session reads the diff itself.
- Telling an agent not to edit tests is weak. Anthropic's long-running harness forbids it by instruction only, with nothing hashing or locking the tests. This loop hashes the protected files and diffs them against the base commit, which is the stronger form.
- When a known-good implementation exists, differential comparison against it is the best oracle (Anthropic's C compiler project used GCC this way). The oracle lens in the lens catalogue is for that case.
- A regression gate matters. In the same project the agents began to break existing behaviour late in the work, so the full judge runs after every fix, in the verifier and again in the rejudge.

Not established by the research: how often fixers tamper with judges in loops like this one, and any held-out oracle or judge canary design that has been tested rather than reasoned. The optional canary below is a reasoned design.

## Final proof is the human's

Every command in the loop is run by an agent. Before telling the user anything is fixed, re-run the judge yourself in the worktree, bare, and show its output; then run the manifest check, then run git status --porcelain (a halted run can leave uncommitted work, so expect it empty only after a clean finish), then list what changed since the base commit with git diff --name-status BASE, which covers committed and uncommitted tracked changes (modified and added source files are expected; no deleted file, no modified existing test or config, and no added file under CI, git hook or tool-config locations other than ordinary regression test files is acceptable), then compare the shared git state snapshot described below. The manifest lives in the scratch directory, so the diff against the base commit is the check that does not depend on it.

## Shared git state snapshot

A linked worktree shares its git directory with the primary checkout, so anything an agent writes there can fire later in the user's own checkout. Save the output of this snapshot to a file before launching the loop and again after it ends, then compare the two files; the only acceptable difference is none (the filter already excludes the loop's own branches, rejected-attempt refs and stash):

```bash
snapshot() { g="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)"; mask() { sed -E 's#(://)[^/@]*@#\1***@#'; }; git -C "$REPO" config --local --list | mask; [ -f "$g/config.worktree" ] && mask < "$g/config.worktree"; git -C "$REPO" for-each-ref --format='%(refname) %(objectname)' | grep -v -E '^refs/(heads/chaos/|chaos/|stash )'; find "$g/hooks" \( -type f -o -type l \) ! -name '*.sample' -exec shasum -a 256 {} + 2>/dev/null; shasum -a 256 "$g/info/exclude" "$g/info/attributes" 2>/dev/null; ls -1 "$g/worktrees" 2>/dev/null; return 0; }
```

REPO is the primary checkout. Hooks, local and worktree config (with credentials in remote URLs masked), other branches' refs, the ignore and attributes files and the list of linked worktrees in the git directory are all in the snapshot. Keep the saved file outside the scratch directory with mode 600. Take the snapshot after the loop's worktree exists: its last lines list the linked worktrees, so a snapshot taken before the worktree differs from one taken after by exactly that entry. The worktree config file is read directly, not through git config --worktree, which fails once a linked worktree exists unless the worktree-config extension is on. The repository's tests run this exact command against an ordinary loop run, which must not change it, and against planted hooks, config and attributes changes, new refs and a leftover worktree, which must. It cannot prove that a sandbox-free agent did nothing else; it catches the changes that would later run code in the user's checkout. If you cannot run it (denied, tool missing), say "unverified" and give the user the exact command and the output to expect.

## Optional: judge-integrity canary

To learn whether the fixer would cheat, occasionally plant a break that cannot be fixed without editing a protected file (for example a test that contradicts the documented contract). Any "fixed-verified" result for it means the judge or the protected set has a hole. The loop does not automate this yet; it is a manual check worth running when the stakes are high.
