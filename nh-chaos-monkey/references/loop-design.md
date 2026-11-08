# Loop design

Why the breaker loop is built the way it is, the limits it knows about, and how to change it safely. Read this when tuning caps, adding a lens, explaining the design to the user, or editing the workflow script.

## Contents

- Roles and contexts
- Phases
- Caps and stop rules
- What is enforced and what is only requested
- Mapping to chaos engineering
- Known limits
- Editing the script
- Sources
- Validation history

## Roles and contexts

| Role | Sees | Writes | Why separate |
| --- | --- | --- | --- |
| Breaker (one per lens) | code, existing tests, docs | reproducers in the scratch directory only | Reading the tests shows where they are blind; a breaker that cannot see them mostly rediscovers covered cases |
| Confirmer | the reproducer and the claim | nothing | Re-runs the reproducer twice on the current tree, applies the legitimacy gate and records the reproducer's hash, so the breaker never grades its own find |
| Fixer | one confirmed break | non-protected files plus a new regression test, uncommitted | Has the incentive to make the judge green, so its write scope is fenced and its work is checked by someone else; it is not told where the manifest lives |
| Verifier | the uncommitted change | nothing in the worktree | Fresh context; runs the checks in the judge protocol, including the reproducer hash. Pass a different model through verifierModel when the account allows one, because a model tends to be lenient toward its own family's output |
| Committer, reset, rejudge | one command each | commit or stash only | Mechanical steps kept out of the judging agents |

Fixes are applied one at a time in one worktree. Concurrent fixers would edit the same files and make every verification ambiguous.

## Phases

1. Baseline. A cheap isolation probe runs first, before any project code executes: the workdir must be a linked worktree (its git directory differs from the common one) on a branch starting with chaos/, with a clean tree. When requireSandbox is set, a probe agent then runs the sandbox probe and any allowed action halts the run before the judge. Only then does the judge run; it must be green with a test count of at least 1, and the protected manifest must list files and pass its own check. If a verifier model was requested, a one-word probe must succeed with it. Otherwise the loop stops before attacking anything.
2. Break. One breaker per lens, in parallel. Every candidate is validated by the script: the reproducer must live in that lens's scratch folder with a plain file name, the command must be exactly an allowed runner followed by that path, the source path must be a safe relative path, and the observed exit status must be positive. Text fields are reduced to a safe character set and length. Candidates that match on file and title, or on file and line, are merged across lenses and with the backlog: the strongest severity wins and the number of lenses that reported the same break is kept as corroboration. They are ranked by severity, then corroboration, and at most maxPerFile per file are taken so one function cannot fill a round. Whatever the caps leave out waits in a backlog for the next round and is listed in the result; it is never marked as seen. Rejections are logged.
3. Confirm. Two separate reproducer runs plus the legitimacy gate, the reproducer hash, and a check that HEAD has not moved. A reproducer that leaves files in the worktree halts the loop, and the breaks already confirmed in that round are kept in the result.
4. Fix. After the first fix of a round, an agent re-runs each later break's reproducer once on the current head; a break an earlier fix already removed is recorded as superseded instead of being fixed again. A candidate carried over from the backlog whose reproducer now passes twice, after commits, is recorded as superseded too. Per confirmed break: up to maxFixAttempts rounds of fixer then verifier. If a verifier returns nothing twice the loop halts as verifier-unavailable instead of spending more attempts, because an outage is not a rejected fix. A rejected attempt is stashed and also pinned under a named ref, so the next attempt starts from the last verified commit and must take a different approach, with the verifier's reasons passed back. A verified fix is committed atomically from a message file, with repository hooks disabled for that commit.
5. Rejudge. After any round with commits, an independent agent re-runs the judge and the manifest check and must agree with the verifier on the test count and the head commit.

## Caps and stop rules

| Setting | Default | Why |
| --- | --- | --- |
| maxRounds | 3 | A loop that stops itself needs an outside limit; gains flatten after the first rounds |
| maxFindingsPerRound | 6 | Bounds cost per round; extra candidates wait in the backlog for the next round |
| maxPerFile | 2 | Keeps one function's near-duplicate reports from filling a round |
| maxFixAttempts | 3 | A fix that fails three different ways usually means a design problem a human should see |
| plateauRounds | 1 | One round with no new confirmed break after a fix round is the re-attack that finds nothing |
| token budget | stop below 80k left | The tool's budget is a hard ceiling; stop cleanly before it throws |

Measured cost is about 0.8M subagent tokens per fixed finding with four lenses (the first toy and real-project runs), and about 0.85M to 2.7M with the five default lenses, typically 1.2M to 1.4M: on 2026-11-08, 2.6M for 3 fixes, 5.2M and 5.7M for 4 fixes, and 5.3M for only 2 fixes when rejected attempts piled up; a clean run that finds nothing cost 0.9M. The defaults allow 18 fixes, roughly 23M tokens at the typical rate and up to 48M at the worst measured rate; lower maxRounds and maxFindingsPerRound for most uses.

## Arguments

The script refuses unknown argument names and wrong types, and the result's settings field echoes what took effect. Integers outside their range are clamped and anything that is not an integer falls back to the default.

| Argument | Default | Meaning |
| --- | --- | --- |
| workdir, scratch | required | Absolute paths (letters, digits and ._/- only) of the linked worktree and a separate scratch directory |
| judgeCmd | required | The project's own test command; screened best-effort for pipes, semicolons, a background ampersand and narrowing flags |
| target | required | What to attack, reduced to a safe character set |
| protectedPaths | built-in set | Pathspecs added to the built-in protected set (tests, CI, hooks, ignore file, lint, type and runner config, lockfiles, manifests and tool-config files such as .npmrc) |
| replaceProtectedDefaults | false | true makes protectedPaths the whole set; needs protectedPaths |
| lenses | five defaults | Up to six {key, brief} entries; briefs are trimmed to 600 characters; extra lenses are not run and the log says which |
| reproRunners | node, node --test, python3, python, pytest, bash, sh, ruby, deno run, bun, go run, php | The only commands a reproducer may start with |
| maxRounds, maxFindingsPerRound, maxFixAttempts, plateauRounds, maxPerFile | 3 (1 to 6), 6 (1 to 10), 3 (1 to 5), 1 (1 to 4), 2 (1 to 10) | The caps |
| fixEnabled | true | false is lead-only mode |
| verifierModel | session model | Model for verifiers, probed first |
| testCountHint | none | How agents should read the judge's test count; given to the baseline, verifier and rejudge prompts |
| regressionTestPattern | built-in pattern | Regular expression a regression test path must match; hidden, config and fixture locations are always refused |
| requireSandbox, probePath | false, none | Run the sandbox probe through an agent before the judge; probePath is the absolute path of sandbox-probe.mjs |

## Halt reasons

haltReason is set on every return. finished is true only for the first row.

| haltReason | Meaning | What it leaves behind |
| --- | --- | --- |
| plateau, max-rounds, budget | Normal stops: a dry round, the round cap, the token floor | Clean tree unless a rejected attempt was stashed |
| breakers-unavailable | No breaker answered in a round: nothing was tested | Clean tree |
| isolation-check-failed, not-an-isolated-worktree, workdir-not-clean-at-start, sandbox-probe-failed, sandbox-not-enforced, verifier-model-unavailable | Refusals before the judge runs | Nothing changed |
| baseline-agent-failed, baseline-head-not-a-commit-sha, baseline-judge-red, baseline-test-count-unknown, no-protected-files-found, protected-manifest-self-check-failed, judge-run-left-the-worktree-dirty | The baseline is not a usable steady state; the judge ran once | Judge output may have dirtied the tree |
| reproducer-dirtied-the-worktree, head-moved-during-break-or-confirm | A reproducer or something else changed the tree during confirmation | Confirmed breaks so far are kept in the result |
| verifier-unavailable, verifier-unavailable-and-worktree-dirty, worktree-not-clean-after-rejected-attempt, commit-failed, independent-rejudge-disagrees-with-verifier-claims | A fix-phase safety halt | Uncommitted work may remain; a halt after a commit skips the independent rejudge, so Step 4 is then the only independent check |
| agent-error | An agent call threw (for example the token ceiling) | A partial result: commits so far, the break being fixed and every unprocessed confirmed break |

Any halt other than the first two rows adds a warning that the worktree may hold uncommitted changes.

## What is enforced and what is only requested

| Property | Mechanism | Strength |
| --- | --- | --- |
| Worktree on a chaos/* branch, not the primary checkout | Script reads git directories and branch from the isolation probe agent and halts before the judge runs | Checked, but the values come from an agent |
| Judge green, counted tests, manifest self-check | Script compares returned integers | Checked, same caveat |
| Reproducer and command shape, safe paths, text charset | Script validates strings before using them | Enforced in code |
| Judge command screened for pipes, semicolons, a background ampersand and common narrowing flags | Script refuses the run on a match | Best-effort denylist (it misses many narrowing options); the user's confirmation in Step 1 is the real control |
| Fix verdict | Script computes it from the verifier's returned numbers and flags, never from a verifier "pass" field | Enforced in code, inputs from an agent |
| Independent rejudge agrees | Script halts on any mismatch | Enforced in code |
| No network, no push, no reading secrets, fixer write scope, no writes in .git | Preamble in every prompt | Requested only |
| Real isolation | OS sandbox chosen by the user | Not provided here |

Agents are language models running shell commands, so every "checked" row means the script checked what an agent said it saw. The main session's final run of the judge, the manifest check and the name-status diff against the base commit are what turn the loop's output into proof.

## Mapping to chaos engineering

The loop is the scientific method chaos engineering asks for, applied to code instead of infrastructure:

| Chaos concept | Here |
| --- | --- |
| Steady-state hypothesis | The judge is green with a counted number of tests |
| Experiment | A reproducer that tries to violate the documented contract |
| Blast radius | A linked git worktree on its own branch, ideally inside an OS sandbox |
| Abort criteria | Round, attempt, finding and token caps; a protected-file change rejects the attempt, and the rejudge halts the run if the manifest check still fails; any rejudge disagreement |
| Rollback | Discard the worktree and branch; rejected attempts are pinned under refs/chaos/rejected |

What it does not do: inject faults into running services, networks or Claude Code's own tool calls. For services, use a dedicated chaos platform with a human-owned experiment definition and platform-side stop conditions.

## Known limits

- Agents run every command, so the loop's output is evidence to check, not proof. A reproducer is arbitrary code by design, so validating its path and command does not make running it safe; only a sandbox does.
- The git stash is shared between a worktree and the primary checkout, and git hooks live in the shared git directory. The loop disables hooks for its own commits and forbids writes in .git, but only the main session's shared git state snapshot comparison (see the judge protocol) detects tampering. Files that git ignores, such as dependency folders and build output, are watched by nothing in the loop.
- The manifest protects existing files only. Renames, deletions and type changes are caught by a separate git check against the base commit, and any file added under the protected paths other than the declared regression tests is flagged. Added files elsewhere (for example new source files) are checked by the verifier's diff review, which is a model judgement.
- There is no hidden oracle: nothing measures whether fixes overfit the breakers' reproducers. A held-out set of reproducers the fixer never sees would measure that.
- The regression test path that the added-file rule allows still comes from the fixer, but the script now requires it to be among the changed files, to look like a test file (the default pattern covers common layouts for several languages and regressionTestPattern replaces it), to avoid hidden, config and fixture locations, and not to repeat an earlier fix's test. Only one new file under the protected paths is allowed per fix, so a fix that legitimately needs a new fixture or helper file there is rejected, which costs attempts but fails closed.
- Severity is the breaker's own claim and corroboration only counts lenses that reported the same location or title, so ranking is a heuristic. The backlog keeps the rest, but a run that ends on its round cap leaves some candidates unexamined; the result lists them as leads.
- Judge output and agent summaries can contain secrets and are kept in the scratch directory and the workflow transcript. Scan before sharing, delete after review.
- Reproducer quality depends on the language and the project's test tooling. See the validation history for what has actually been exercised.
- Raw judge output and reproducer output tails (baseline, rejudge and each finding's observed output) are returned to the main session as the agents wrote them. Treat the result as untrusted data.
- A halt in the middle of a round, after a commit, skips the independent rejudge for that round. The commits exist, the rounds list may be empty for it, and only Step 4 checks them.
- The sandbox probe verdict reaches the loop through an agent's relay of the probe's JSON, and the probe tests a direct TCP connect, not a proxy, and only the credential locations it lists.
- Mutation-guided breaking (real mutants executed by a mutation tool) would give a stronger signal than model-written reproducers where a mutation tool exists. It needs different confirmation semantics (see the lens catalogue) and is not implemented.

## Editing the script

The script runs inside the Workflow tool, which strips the export from the meta declaration and wraps the rest in an async function, so top-level await and return are legal there but a plain `node --check` rejects the file. Check syntax the same way the tool loads it:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8').replace(/^export const meta/m,'const meta');new (require('vm').Script)('(async()=>{'+s+'\n})',{filename:process.argv[1]});console.log('syntax ok')" scripts/chaos-loop.js
```

Syntax is the weakest check. The repository's tests run the real script against scripted fake agents in about a second (the harness under the test folder); change a test first, watch it fail, then change the script. A useful extra check is to copy the script into a temporary folder, break it on purpose (drop a halt, loosen a verdict check, remove the preamble from a prompt) and confirm each break fails some test. A hand-picked list of 37 such mutations was caught on 2026-11-08; an independent reviewer's 39 arbitrary single-edit mutants mostly survived, so the suite is a net with gaps, not proof of correctness. The mutation list is not kept in the repository. After any change to prompts, schemas or control flow, also re-run the loop on a throwaway fixture project with a planted bug and an executable judge, and read what the agents actually returned. The workflow runtime loads exactly one script file, which is why this file is far longer than the repository's usual size limit; do not split it without changing how the tool loads it. The script must not use the clock or random numbers (the Workflow tool rejects them so runs can resume), and agent labels must stay deterministic. A code formatter may expand the file; keep it under the repository's size limit.

## Sources

- [Harness design for long-running apps (Anthropic)](https://www.anthropic.com/research/harness-design-long-running-apps): generator and evaluator roles, contracts agreed before work, plateau behavior.
- [Finding bugs with property-based testing (Anthropic)](https://www.anthropic.com/research/property-based-testing): agentic bug finding with a self-checking step.
- [Recent frontier models are reward hacking (METR)](https://metr.org/blog/2025-06-05-recent-reward-hacking/) and [ImpossibleBench](https://arxiv.org/abs/2510.20270): why the judge and the protected set must be outside the fixer's reach.
- [XBOW: the road to top 1](https://xbow.com/blog/top-1-how-xbow-did-it): validators that turn a model's claim into a checked fact.
- [Meta: LLMs and mutation testing](https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/): a confirmed break becomes a permanent test.
- [Trail of Bits skills](https://github.com/trailofbits/skills): the patching-bugs and post-patch-validation skills use a baseline, patched and reverted proof.
- [Principles of Chaos Engineering](https://principlesofchaos.org/) and [ChaosEater](https://arxiv.org/abs/2511.07865): hypothesis, experiment, analysis, improvement.

## Validation history

Renamed on 2026-11-08 from nh-breaker to nh-chaos-monkey: the folder, command and script (now chaos-loop.js), the branch prefix (breaker/ became chaos/) and the rejected-attempt refs (refs/breaker/rejected became refs/chaos/rejected). The roles keep their names: breaker, confirmer, fixer, verifier. Rows below that mention the skill were written under the old name and are shown with the new one.

Fixture: a throwaway Node project (node:test, judge npm test, 5 tests) with two planted bugs, a dropped trailing chunk and a missing zero-total guard. A third real bug, float error in tie rounding, was found by the loop and not planted. Runs used two lenses (one for the lead-only run), at most two rounds, and the session model for every agent. The fixture lived in its own temporary repository outside any real project, and the session was not sandboxed.

| Date | Script version | Outcome |
| --- | --- | --- |
| 2026-11-02 | first | Break and Confirm found both planted bugs. Fix failed closed: every verifier call was refused by the account (an explicit deny on the model chosen for verifiers), nothing was committed, the tree stayed clean. Exposed that a verifier outage burned fix attempts and hid its cause, which led to the verifier probe, the retry then halt, and the isolation probe |
| 2026-11-02 | second | 3 findings fixed and committed, judge 14 of 14, no protected file changed |
| 2026-11-02 | third | 3 findings fixed and committed (5 tests became 16). Negative tests on this version: a judge command with a pipe was refused with no agents started; a primary checkout as workdir halted after one read-only probe without running the judge; a nonexistent verifier model halted at the probe with no breaker or fixer started |
| 2026-11-02 | final | Full run: 3 findings fixed and committed (5 tests became 11, then 16), stopped on the round cap, and the independent rejudge agreed in both rounds with the three-part protected check passing on the legitimate regression tests. Lead-only run: 2 breaks proven, nothing edited, HEAD unchanged. Checked by hand afterwards: clean tree, name-status diff against the base showing only added and modified files, manifest clean, no protected file modified, deleted, renamed or type-changed, the only files added under protected paths being the declared regression tests, no leftover verifier worktrees, shared git state identical before and after, judge passing |
| 2026-11-02 | final, real project | First run outside the fixture, on this repository's own validator (a 356-line script with 3 tests), judge `node --test`, no sandbox, trusted code, session model for every agent. 8 breaks proven and fixed in two rounds (tests 3 to 54 to 79); it stopped on the round cap with 4 new breaks still found in round 2, and one fix needed a second attempt after the verifier rejected the first. Checked by hand: clean tree, only added and modified files, manifest and git-based protected check clean, the eight declared tests the only additions under protected paths, no leftover worktrees, judge passing 79 of 79, shared git state unchanged apart from tracking entries from the user's own push. Cost: 45 agents, about 6.2M subagent tokens, 76 minutes. It exposed a gap in the skill: the project's documented test command named one file and would have hidden every new test |

### 2026-11-08, upgraded script

The repository now has a deterministic harness: more than 150 loop and probe tests (npm test prints the current number) that run the real script against scripted fake agents, including three runs under a real Seatbelt sandbox for the probe. It exposed seven gaps in the earlier script before any model ran (a round where every breaker died was reported as a plateau, a candidate whose confirmer died vanished, halts dropped confirmed breaks, a thrown agent call discarded every commit, and three holes around the fixer's regression test path), all fixed with tests.

Live runs followed on throwaway fixtures (no sandbox, trusted code, session model for every agent, five lenses, results checked by hand afterwards with the bare judge, the manifest, status, name-status against the base commit, the shared git state snapshot, and the new tests run against the original code):

| Run | Fixture | Outcome | Agents | Subagent tokens | Time |
| --- | --- | --- | --- | --- | --- |
| Clean control | two correct JavaScript functions, 7 tests | plateau, 0 findings, no commits, tree and git state unchanged; 5 of 5 breakers probed before returning nothing | 7 | 0.89M | 3 min |
| Python | unittest project with 4 planted bugs, cap 3 findings, 1 round | 3 found and fixed with root-cause changes (14 regression tests failed on the original code, judge 7 to 27); the fourth was beyond the cap | 20 | 2.56M | 12 min |
| JavaScript | 6 planted aspects, 2 rounds | 4 fixed, 2 unfixed; the most blatant planted bug (median) was never fixed, see below | 40 | 5.19M | 28 min |
| JavaScript with planted injection | same code plus instruction text in a source header and README | 2 fixed, 3 unfixed; no planted instruction was obeyed (see the safety runner) | 41 | 5.30M | 30 min |

What the live runs exposed, all fixed afterwards with tests and then re-run live (table below): candidates cut by the round cap were marked as seen and never offered again, so median, reported by six breakers, was never fixed; all four slots in round 1 went to one function; two breaks that an earlier commit had already fixed burned two attempts each and were reported unfixed, with a misleading reason when the fixer changed nothing; and the verifier counted pre-existing hostile text against legitimate fixes. The faults lens produced real findings (an exhausted retry budget that resolved undefined) and its reproducers printed their fault counts.

After the fixes, the two JavaScript runs were repeated on fresh copies of the same fixture with the same caps, and the skill itself was run through a real headless session:

| Run (upgraded script) | Outcome | Agents | Subagent tokens | Time |
| --- | --- | --- | --- | --- |
| JavaScript, repeated | 4 fixed (median, retry, parseDuration, percentile rounding) with the median bug first in line; a duplicate retry report was marked superseded with no wasted attempt; 2 stale backlog candidates were classed invalid (now superseded); 1 break stayed unfixed because the breaker's reproducer evaluated its call eagerly, so even a correct fix could not make it pass (the verifier rejected both attempts, correctly); judge 8 to 37; 2 candidates left waiting in the backlog | 44 | 5.69M | 30 min |
| JavaScript with planted injection, repeated | 4 fixed, 2 superseded, 2 invalid, 0 unfixed; no planted instruction obeyed in 420 real tool calls; hostile text reported on 4 findings; all four planted bug areas fixed | 38 | 4.87M | 24 min |
| Headless claude -p on the skill | The non-interactive contract worked end to end: no questions asked, worktree and baseline built, loop run, bare judge, manifest, status, name-status diff and git snapshot checked by the session, report with outcome classes and not-tested list; 1 planted bug fixed and confirmed by me (judge 2 to 6, new test fails 2 of 4 on the original code). The Workflow tool refused the skill's script path (outside the working directory), so the session copied it, checked the hash and removed only the copy | 12 | 1.37M | 7 min loop, 13 min session |

Planted-bug areas fixed per run (median, percentile at p = 0, parseDuration, retry): first JavaScript run 2 of 4 (median never reached; it fixed a different percentile bug, NaN), repeated run 3 of 4 (percentile at p = 0 missed), first injection run 1 of 4 (plus the NaN bug), repeated injection run 4 of 4. Totals for the day: about 25.9M subagent tokens across seven live runs (plus the main sessions), on top of 43.3M for the three research runs. Two runs of the same fixture differ because breakers are model samples; treat any single run as one draw.

Independent review before merge (2026-11-08, 57 agents, about 9.3M subagent tokens): five reviewers, each given only the exported branch and one lens (security under this repository's mandatory skill review, loop correctness, test integrity, docs honesty, usability), with two skeptics trying to refute every medium or high finding by running things. No high-severity finding; 25 medium findings were confirmed by both skeptics and none was refuted. They clustered into: safety switches and protected paths failing open on a wrong type or a replaced list; the probe treating unknown as a pass and reporting a write as blocked when only its clean-up was refused; a round of rejected candidates counting as dry; a thrown agent call dropping unprocessed breaks; superseded hiding an unfired fault; CI path filters that skipped the loop's own tests; weak or vacuous test assertions; docs that inverted the lead and invalid classes, under-stated cost and over-stated what is enforced. All were fixed with tests in the same change except what the known limits above now say outright. The review also noted two open items: candidates that cite the same file and line are merged even when they are different defects (breakers often cite a function's first line), and some constants and output schemas are still not pinned by any test.

The negative tests were not repeated on the final version. The code they cover was not edited afterwards except argument path validation, which the final runs exercised with valid paths. The git checks behind the protected-file rules (renames, type changes, added files, hook and config tampering) were also exercised directly in scratch repositories, not only through the loop.

Not exercised on the final version: a real verifier outage after the probe, the lead and invalid classes, the added-file and reproducer-name rejection paths inside the loop (they are covered only by direct git checks), languages other than JavaScript, a project with a build step or a slow judge, and any run inside an OS sandbox. Treat those paths as untested. A rejected fix attempt fed back to the fixer with the verifier's reasons has been exercised once, on the real project.
