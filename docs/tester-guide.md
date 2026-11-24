# Tester guide

`nh-chaos-monkey` has had no outside runs yet. [`Context.md`](../Context.md) records a proposed bar for calling it stable, which includes at least two outside runs, reported through an issue form (`.github/ISSUE_TEMPLATE/tester_report.yml`, the tester report form linked below), with no skill-level defect. If you are willing to try it on code you own, this page says what to run, what to write down, and what not to send.

This guide is not drawn from evidence about how other projects run test programmes. Its questions come from the safety research behind the [safety page](safety.md): a baseline, a stop condition, anything outside the stated scope, and what the sandbox let through.

## Before you start

- **Use code you own and can afford to have executed.** The loop runs your tests and agent-written scripts. Read the [safety page](safety.md) and the README's "Before you run it".
- **Run the whole session inside a sandbox, container or VM** as an ordinary user, with no network for the agents' tools and no credentials reachable from your home directory. The skill runs a probe first and stops if it does not report `enforced`. If you cannot sandbox, do not test with this skill yet; `--accept-no-sandbox` is for code you trust, and a tester run is more useful with a sandbox.
- **Set a spending limit** in your launcher. Unless a token target is set for the turn, the round and finding caps are the only stop.
- **Have a green judge.** Run your project's documented test command a few times first. It must pass, exit non-zero on failure and print a test count.
- **Commit what you want tested.** The worktree starts from `HEAD`; uncommitted changes are not included.

## The run

1. Install the skill (README, "Installing") and note the version: the release tag, or the commit if you used `main`. A plugin install reports the plugin's `version`, which only changes at a release, so for that route also note the date you installed.
2. Start with a lead-only run on one small module:

   ```text
   /nh-chaos-monkey src/your-module --judge "<your test command>" --lead-only --max-rounds 1 --max-findings 2
   ```

   (If you installed through the plugin route, the command is `/nh-chaos-monkey:nh-chaos-monkey`.)
3. Confirm the contract when the skill asks, read the probe output, and let it finish. Do not edit files in the worktree while it runs.
4. Optional second run: the same command without `--lead-only`, to see fixes. Read each fix against your module's contract before keeping it.
5. Clean up with the README's "Cleaning up" steps.

## What to write down

The [tester report form](https://github.com/sairam0424/nh-skills/issues/new?template=tester_report.yml) asks for these, so noting them as you go saves time:

| Topic | What to record |
| --- | --- |
| Version | The release tag or commit, Claude Code version, OS, Node.js and git versions, and how you installed it |
| Baseline | Your judge command, that it was green first, and the test count it printed |
| Sandbox and probe | What isolated the session (Seatbelt, a container, a VM, nothing) and the probe's verdict, with any line that surprised you |
| Stop reason | The `haltReason` and whether `finished` was true |
| Outside the scope | Anything that touched a place it should not have: files outside the worktree and scratch directory, your shared git state (branches, stash, hooks, config), a network connection, a credential location |
| Findings | For each: its class, whether its reproducer really imports or runs your code (open the file), whether you judge the break real, by design or unreachable, and for a fix whether it is right, too broad or wrong, and whether it changes behaviour your documents describe |
| Cost | Subagent tokens, minutes, and spend if your launcher reports it |
| Friction | Any sentence that was unclear, any step that did not match the docs, any point where you were unsure what to do |

## What not to send

Redact secrets, tokens and private code from everything you paste. Judge output, agent transcripts and the saved git-state snapshot can contain secrets, so scan them first. A suspected vulnerability (a tampered skill, a way around a control) goes to [`SECURITY.md`](../SECURITY.md) privately, not into the form.

## What to expect back

Support is best effort with no response-time guarantee; see [`SUPPORT.md`](../SUPPORT.md). A report that shows a skill-level defect becomes an issue and a fix; a report that shows a clear run with no defect counts toward the bar in `Context.md`.
