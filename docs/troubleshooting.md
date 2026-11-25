# Troubleshooting and FAQ

Start with the `haltReason` in the result: it names why the loop stopped. [`loop-design.md`](../nh-chaos-monkey/references/loop-design.md#halt-reasons) has the full table. For anything that looks like a vulnerability, do not open a public issue; follow [`SECURITY.md`](../SECURITY.md). The [safety page](safety.md) explains what the skill does and does not protect.

## Contents

- [Install and start-up](#install-and-start-up)
- [Before the loop starts](#before-the-loop-starts)
- [While it runs and when it stops](#while-it-runs-and-when-it-stops)
- [Cleaning up](#cleaning-up)
- [FAQ](#faq)

## Install and start-up

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `/nh-chaos-monkey` is not offered | The folder is one level too deep or too shallow | `ls ~/.claude/skills/nh-chaos-monkey/SKILL.md` must exist, and the folder name must equal the skill name |
| `/nh-chaos-monkey` is not found after a plugin install | Plugin skills are namespaced | Run `/nh-chaos-monkey:nh-chaos-monkey` |
| Claude never starts it on its own | By design: `disable-model-invocation: true` | Run it yourself by name |
| `/plugin install ... --marketplace` is rejected | A Claude Code release without that flag | Update Claude Code, or add the marketplace first and install with `nh-chaos-monkey@nh-skills` (see the README) |
| `claude plugin update` says you are already on the latest version | The plugin's `version` did not change | A new copy arrives with the next release, which bumps `version`. To try unreleased commits, copy the folder from a clone |
| The Workflow tool refuses the script path | It only loads scripts the session can already read | Copy `scripts/chaos-loop.js` into the working directory under a new name, check it with `shasum` against the original, run it, remove only that copy. Or start with `--add-dir` for the skill folder and add `Edit(//ABSOLUTE/PATH/TO/nh-chaos-monkey/**)` to `permissions.deny` (`SKILL.md` Step 3 has the exact rule; the README's "Before you run it" explains why) |
| The skill refuses a worktree, scratch or probe path | The script accepts only absolute paths made of `A-Za-z0-9._/-` | Use a path without spaces or other characters |
| Nothing works on Windows | Native Windows is not supported; WSL is untested | Use macOS or Linux |

## Before the loop starts

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| It stops after listing git config lines | A line that can run code was found: `core.hooksPath` (husky), `core.fsmonitor`, `hook.*`, a `filter.*` line other than the four standard git-lfs ones from your global or system config, any `filter.lfs.*` line in the repository's own config, or an `include` | Read the lines. In an interactive session you may continue; a non-interactive run stops by design. That stop is an instruction to the agent, not a check in the script, so treat it as best effort: in the skill's own trials of 2026-11-23 (`learning.md`, scenario F2) both sessions stopped at the listing, but in one pre-release check of a non-interactive launcher the session listed the git-lfs lines and went on instead of stopping. The four standard git-lfs lines in your global config no longer stop a run. For anything else the documented ways out are an interactive session or a git config without those lines |
| The probe reports `not-enforced` | At least one thing an enforced sandbox must refuse was allowed: a credential file opened, a write outside the worktree, a direct network connection to `1.1.1.1:443`, hooks or git config writable, or a secret-named environment variable present | Read the line for each probe. Start the session inside a sandbox, container or VM, or clear the variable. Run the probe where the agents run. Use `--accept-no-sandbox` only for code you trust |
| The probe reports `incomplete` | A credential path was a symlink loop or a socket, or the check could not decide | An undecided check counts as not enforced. Fix the path or run elsewhere. "No regular file at any credential path" is the one tolerated unknown |
| The probe flags an environment variable | Its name contains a credential word such as `TOKEN`, `SECRET`, `PASSWORD` or `API_KEY` | Unset it for the session. Names such as `AWS_REGION` or `*_TOKENS` are not flagged |
| The install cannot run | The sandbox blocks the network | Install into the worktree yourself from your own shell, or knowingly open the network for that one step, then close it and re-run the probe before the judge. A non-interactive run prints the install command and stops |
| The install step stops on an `.npmrc` | It has a `${` expansion, an auth or token line, an unexpected registry, a `git` or `script-shell` setting, or is a symlink | That is the stop rule working. Read the file and decide. A non-interactive run cannot approve it |
| `baseline-judge-red` | The judge is red in a fresh worktree | Gitignored folders (`node_modules`, virtual environments, `.env`) are absent there. Install first, or make the judge command independent of them. Inside a sandbox the cause can also be something the sandbox refuses (a loopback server, a unix socket, nested `sandbox-exec`, a fixed `/tmp` path, a home-directory path check, Docker): see "What a project may need allowed inside the sandbox" in `references/safety-runner.md`. Run the judge on a clean clone to confirm |
| `baseline-test-count-unknown` | The runner does not print a count the skill can read | Check that your runner prints one, and tell the session how to read it (it passes `testCountHint` to the loop) |
| The judge command is refused | It contains a refused form (a pipe, `;`, `&`, redirection, `eval`, `sh -c`, `--passWithNoTests`, `--bail`, `-u` and the others in the README) or is over 400 characters | Only if your project's documented test command genuinely needs that form, put it in a wrapper script and use the script as the judge. The wrapper must keep the real exit status and the test count: a wrapper can also hide a failure, which is why the screen exists |
| `no-protected-files-found` or `protected-manifest-self-check-failed` | The protected set found nothing or could not hash it | Tell the session your test, config and lockfile paths when it asks you to confirm the protected paths (it passes them as `protectedPaths`) |
| `sandbox-not-enforced` or `sandbox-probe-failed` | The probe ran and did not pass, or could not run | See the probe rows above |

## While it runs and when it stops

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| The agents ran a different or older model than your interactive session | A headless `claude -p` session started without `--model` uses Claude Code's default model, which may not be the one your interactive session uses (the tested sandbox setup also reads no user settings, with `--setting-sources project,local`, so a `model` set there does not apply). In a real-project run (2026-11-24) the main session and all 89 subagents ran Sonnet 4.5 because the launcher passed no model | Pass `--model <full model id>` to `claude -p`; all agents inherit the session model; `verifierModel` changes only the verifier's |
| `claude -p` exits and the loop is unfinished | `claude -p` stops background work still running ten minutes after the last turn | Only the launcher can lift it: set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` and give the process an outer timeout. Treat any commits left on the `chaos/` branch as unverified leads |
| `breakers-unavailable` | No breaker agent answered, so nothing was tested | Check model access, rate limits and the spending limit. This is not a clean result |
| `verifier-model-unavailable` | The configured `verifierModel` was refused | Tell the session not to set a verifier model (`verifierModel` stays unset by default) |
| `verifier-unavailable` | The verifier agent failed mid-run | Re-run. Commits already made are unverified until your session checks them |
| `independent-rejudge-disagrees-with-verifier-claims` | The loop's own re-run of your judge disagreed with the verifier | Read the commits yourself; do not merge them on the verifier's word |
| `agent-error` | An agent call threw, for example at the token ceiling | The result is partial: it lists commits so far, the break being fixed and every unprocessed confirmed break |
| The run stopped with `reproducers-do-not-run-the-project` or `breakers-blocked`, or a finding is a lead whose note says the reproducer "does not run the code of the project" | For `reproducers-do-not-run-the-project` and the lead note: the confirmer read the reproducer and found no line that imports or runs your code (a copy, a re-write, a simulation or a stub). For `breakers-blocked`: a breaker said it could not import the project with the allowed runners | Nothing to fix: a script that fails the same way on any code is not evidence. If your dependencies are outside the worktree, pass the interpreter with `--repro-runner` so reproducers can import your project, then re-run |
| A finding is invalid and its note says "documented as accepted" | A document of yours (README, decision log, changelog, comment) says the behaviour is accepted or intended | Open the document named in the note. If the document is out of date, update it and re-run; if it is right, the finding is by design |
| It ended with `plateau` and no findings | No further break was found within the caps, by these lenses, with this judge | That is not a pass. A higher `--max-rounds` does not continue a plateau (a round with nothing new ends the run). Add or write a lens (see `references/lens-catalogue.md`), widen the target, or accept that these lenses found nothing |
| A fix looks wrong or too broad | A confirmed break proves a behaviour, not that the contract forbids it | Read the diff against your module's contract. Cherry-pick, edit or discard it |
| It cost more than expected | The default caps allow up to 18 fixes | Start with `--max-rounds 1 --max-findings 2`. `--lead-only` skips fixing but still cost 0.3M to 2.4M tokens in the runs measured. Set a spending limit in your launcher; a token target set for the turn is the only token stop |
| Step 4 says `unverified` | Your session could not run a check | It prints the exact command and the output to expect. Run it yourself |

## Cleaning up

The loop adds a branch, `refs/chaos/rejected/*` refs, `git stash` entries, a worktree and a scratch directory. The commands are in the README under "Cleaning up". Do not run a habitual `git stash pop`: it could apply a rejected attempt. Judge output and the saved git-state snapshot can contain secrets, so scan them before sharing and delete the scratch directory and the snapshot file after review.

## FAQ

**Is it safe to run on my work repository?** Only inside a sandbox, a container or a VM, and only on code you own. It runs your tests and agent-written scripts by design. Read the [safety page](safety.md) first. Native isolation is not part of the skill.

**Does it send my code anywhere?** The skill has no telemetry of its own. A search of the two shipped scripts (re-checked on v0.2.2) for network code (`fetch`, `http`, `https`, `net`, `dns`, `WebSocket`) and for subprocess and download tools (`child_process`, `curl`, `wget`) found only the probe's single TCP connect to `1.1.1.1:443`, which sends nothing and closes, and its one `git rev-parse` (the `http` hits are the names of proxy environment variables, not network code). `chaos-loop.js` has neither. Your code does reach the model provider your Claude Code uses, because the agents read it. The dependency install you approve uses the network. Anything your own tests do is up to the project.

**Does it push or merge?** Its instructions forbid pushing, merging and deleting your branch or worktree. Those are prompts, not enforcement; a sandbox with no network and no credentials is what prevents a push. Deciding what to merge is yours.

**Is it a chaos engineering tool?** It borrows the method (a baseline, a hypothesis, an experiment, stop conditions), but it attacks code under test inside a git worktree. It never kills instances or injects faults into running services. For services, use a chaos platform.

**Why must I invoke it by name?** It runs project code and costs a lot, so Claude must not start it on a guess. The skill sets `disable-model-invocation`.

**Which agents and platforms work?** Claude Code, on macOS (the only platform run live) or Linux (unit tests and the probe alone). The loop is a script for Claude Code's Workflow tool, and the skill uses Claude Code-only frontmatter (`argument-hint` and `disable-model-invocation`), and Claude Code's skills documentation says an upload with fields outside the open specification fails, so uploading it to claude.ai or the Skills API is expected to fail (not tried). The `skills` CLI can copy the folder to other agents, but nothing has been tested there.

**Can it run in CI?** An unattended run needs the target and `--judge` on the command line plus a sandbox that passes the probe (or `--accept-no-sandbox`); its caps default to 1 round and 3 findings. Add an outside timeout and a spending limit yourself. No CI run has been tested; CI for this repository runs unit tests only.

**What does "fixed-agent-verified" mean?** The loop's agents confirmed the break twice and verified the fix. It becomes "fixed-verified" only after your own session re-proves it. Neither means a human reviewed it.

**How much does it cost?** About 0.2M to 2.7M subagent tokens per fixed finding in the runs so far, typically 1.2M to 1.4M in the earlier ones, so plan for the higher figures. See "Cost and time" in the README.

**How do I report a result?** A bug or an unclear sentence goes to the [bug report form](https://github.com/sairam0424/nh-skills/issues/new?template=bug_report.yml). A run you want to report on goes to the [tester report form](https://github.com/sairam0424/nh-skills/issues/new?template=tester_report.yml); see the [tester guide](tester-guide.md).
