# nh-skills

[![Validate Skills](https://github.com/sairam0424/nh-skills/actions/workflows/validate-skills.yml/badge.svg)](https://github.com/sairam0424/nh-skills/actions/workflows/validate-skills.yml)
[![Secret Scan](https://github.com/sairam0424/nh-skills/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/sairam0424/nh-skills/actions/workflows/gitleaks.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A small, curated collection of [Claude Code Agent Skills](https://docs.claude.com/en/docs/claude-code/skills): self-contained `SKILL.md` files (Markdown plus YAML frontmatter) that teach Claude Code to do one task well. `nh` is just the author's prefix. There is no build step and no package to install to use a skill.

The current release, **v0.2.1**, ships one skill: **`nh-chaos-monkey`**. [Release notes](https://github.com/sairam0424/nh-skills/releases).

## nh-chaos-monkey

An adversarial bug-finding loop for code you own. Agents try to break one module inside a throwaway git worktree. A break only counts when a reproducer fails twice, a fix only counts when a fresh verifier re-checks it against your own test command, and you decide what gets merged. Despite the name it attacks *code under test*; it never kills servers or injects faults into running services.

> **At a glance.** Install it, then run it from the root of a repository you own. It executes your project's code and tests many times, so run it in a sandbox. A `--lead-only` run (finds breaks, fixes nothing) measured between 0.5M and 2.4M subagent tokens, and each fixed finding cost between about 0.3M and 2.7M, typically 1.2M to 1.4M in the earlier runs (see Cost and time). Its instructions forbid pushing and merging, and an interactive session asks you to confirm the contract before it starts.

**It is for you if** you have a module with a real test command and want to know what that test suite does not catch, or you want agents to find and fix bugs adversarially while a separate judge keeps their claims checked.

**It is not for** faults in running services or networks (use a chaos platform), production or third-party code, or runs where nobody confirmed the contract.

### How it works

1. You give it a target (a path or module) and your project's own test command, the *judge*. The skill asks you to confirm the contract first: judge, protected paths (existing tests, fixtures, config, lockfiles), caps and sandbox.
2. It creates a git worktree on a `chaos/*` branch and checks that the judge is green and prints a test count.
3. Breaker agents, one per *lens*, try to break the target. The five default lenses are boundaries, state order, error paths, contract and faults. Every break needs a reproducer.
4. A confirmer runs each reproducer twice on the current tree. The break counts only if it fails both times. A fault-injection break must also show evidence that the fault actually fired.
5. Unless you pass `--lead-only`, a separate fixer fixes each confirmed break and adds a regression test. A fresh verifier re-checks the fix against your judge, whose protected files were hashed before the fixer started. After any round that made commits, an independent re-run of the judge must agree with the verifier, or the loop halts.
6. The loop stops on its caps or when a round finds nothing new. Then your Claude Code session (the *main session*, which is a prompt-driven step, not enforced by the script) re-runs the judge itself, checks the diff and the shared git state, re-runs each reproducer and runs each regression test on the tree just before its own fix. Only after that does it call a finding fixed-verified.
7. You choose what happens to the branch: review and merge it, cherry-pick commits, or discard it. The skill's instructions forbid it from pushing, merging, or deleting your worktree or branch. It may offer to delete its own scratch directory after you have reviewed the results.

Each finding is reported as an experiment card, grouped by outcome:

| Class | Meaning |
| --- | --- |
| fixed-agent-verified | Break confirmed by two runs, fix passed every agent check and is committed on the loop's branch. It becomes fixed-verified only after the main session re-proves it. |
| confirmed-unfixed | Break confirmed, fix not achieved. Rejected attempts are kept under `refs/chaos/rejected` and in `git stash`. |
| superseded | The reproducer passed again after an earlier fix, so it was not fixed separately. |
| lead | Plausible but not confirmed: flaky, reachable but not matching the claim, or its confirmer never answered. |
| invalid | The confirmer judged it not reachable through a public entry point or the documented contract. |

A confirmed break proves a behaviour, not that your documentation forbids it. Read each one against the module's contract before acting on it.

## Installing

Two routes. Both install the same folder, [`nh-chaos-monkey/`](nh-chaos-monkey): `SKILL.md`, `references/`, `scripts/` and a maintainer journal, `learning.md`, which the skill does not need.

**By copying the folder** from a tagged release, which pins what you install:

```bash
git clone --depth 1 --branch v0.2.1 https://github.com/sairam0424/nh-skills.git
mkdir -p ~/.claude/skills                                  # or <your-project>/.claude/skills
cp -r nh-skills/nh-chaos-monkey ~/.claude/skills/
ls ~/.claude/skills/nh-chaos-monkey/SKILL.md               # must exist, one level below skills/
```

**With the community [`skills`](https://www.npmjs.com/package/skills) CLI**, a third-party tool that needs Node.js 22.20 or newer (read its documentation first). It found and installed this skill from the public repository in a clean test project (skills 1.9.0):

```bash
npx skills add sairam0424/nh-skills --skill nh-chaos-monkey -a claude-code
```

This installs into the current project (add `-y` to skip its prompts, or `-g` to make the skill available in every project).

Each [release](https://github.com/sairam0424/nh-skills/releases) attaches an archive of the skill folder and its SHA-256, so you can check what you downloaded. Then start Claude Code and run `/nh-chaos-monkey`.

**Read it before you run it.** A skill is text an agent will act on, and this one runs project code and shell commands by design. `SKILL.md` is about 120 lines and the files under `references/` about 560. What actually runs is `scripts/chaos-loop.js` (about 1,200 lines, a script for Claude Code's Workflow tool) and `scripts/sandbox-probe.mjs` (about 240 lines, plain Node using only built-in modules). No human has audited any of it. Independent AI reviewer agents reviewed the skill, and the validator and the tests check its structure and behaviour; see [`loop-design.md`](nh-chaos-monkey/references/loop-design.md) and [`learning.md`](nh-chaos-monkey/learning.md).

## Before you run it

**Platform.** macOS or Linux with a POSIX shell, git 2.31 or newer and Node.js 20 or newer. Everything live-tested ran on one Mac; CI runs the unit tests on Ubuntu. Native Windows is not supported and WSL is untested. The loop script rejects worktree, scratch and probe paths that are not absolute or that contain spaces or characters outside `A-Za-z0-9._/-`.

**Claude Code.** The loop is a script for Claude Code's Workflow tool. This README cannot tell you the first Claude Code version that has the tool, and if it is missing the skill's manual fallback (the same phases by hand with subagents) is untested. The tool only loads scripts the session can already read; if it refuses the path under `~/.claude/skills`, copy the script into the working directory and confirm with `shasum` that the copy is byte-identical (preferred), or start Claude Code with `--add-dir ~/.claude/skills/nh-chaos-monkey`. `--add-dir` can give agents edit access to the skill folder in permissive permission modes, and the documentation does not say whether workflow subagents inherit it, so if you use it, deny Edit and Write on that path in your permission rules (the sandbox settings do not cover file tools).

**Your repository.** It needs at least one commit. The worktree starts from `HEAD`, so uncommitted changes are not tested. Gitignored folders (`node_modules`, virtual environments, `.env`) are absent from a fresh worktree, so the judge can be green in your checkout and red there. With `--allow-install` (or after you agree) the skill installs from your lockfile into the worktree with scripts disabled where the tool allows it (for example `npm ci --ignore-scripts --git=/usr/bin/git` (the absolute path of your system git; `/usr/bin/git` is an example), run from a scrubbed environment so no credential variable of your shell can be expanded into a request), with the package manager's cache and logs under the scratch directory, before any agent starts. It stops and asks first if an `.npmrc` has a `${` expansion, an auth or token line, an unexpected registry, or a `git` or `script-shell` setting; a non-interactive run stops and prints what it found. Without `--allow-install`, a non-interactive run stops and prints the install command. If the project has no lockfile, `npm ci` cannot run: in the real-library run the session used `npm install --ignore-scripts --no-package-lock` and reported that the versions were whatever the registry resolved that day. Inside a sandbox that blocks the network the install cannot run unless the network is opened for that one step: an interactive session tells you so and lets you install yourself in that worktree from your own shell or knowingly open the network for that one step (this interactive path was not tested), and a non-interactive session prints the install command and stops. Installing needs the network and can run project code (a registry setting such as an `.npmrc` can send a token to the registry it names, and builds from source in other ecosystems can execute code), so read those files (their registry and auth lines, not only the lockfile's hosts) before you agree.

**Protected paths.** The built-in protected set (the list is `DEFAULT_PROTECTED` in `nh-chaos-monkey/scripts/chaos-loop.js`) covers test directories (`test`, `tests`, `__tests__`, `fixtures`, `testdata`, `__snapshots__`) and test, runner, lint, type and coverage config files by name or glob; common CI files (`.github`, `.gitlab-ci.yml`, `.circleci`, `.travis.yml`, `azure-pipelines.yml`, `Jenkinsfile`, Bitbucket and Buildkite); `.husky`, `Makefile` and `.npmrc`; runtime pins and `Dockerfile`; and the manifests and lockfiles for JavaScript, Python (including `requirements*.txt`, `Pipfile`, `uv.lock`, `poetry.lock`), Ruby, PHP, Java and Gradle, Rust and Go. Manifests, lockfiles, test directories and config files match at any depth; CI files and a few plain names (`spec`, `.github`, `.husky`) match only at the repository root, as do `.gitignore`, `.envrc`, `.yarnrc`, `.yarnrc.yml`, `.cargo`, `.vscode`, `.devcontainer`, `.mvn`, `gradle/wrapper` and `pnpm-workspace.yaml`, so a nested copy (a `.cargo/config.toml` in one crate of a workspace, say) is not protected: list it in `protectedPaths`. It leaves out `setup.py`, `.env` and a nested `spec` directory on purpose (a root `spec` folder is protected), because a library's own `lib/spec` often holds real code; name them in `protectedPaths` if they matter. A source file that happens to be named like a manifest (a sample `requirements.txt` inside a parser's own tests, say) is protected too, and a fix that has to edit it needs `protectedPaths` and `replaceProtectedDefaults`. The defaults do not cover .NET or Swift test layouts (`*Tests.cs`, `Tests/`), `.csproj` files or RSpec files outside `spec/`: list them in `protectedPaths`. When the skill asks you to confirm protected paths, add what is missing; your session's final diff review is the backstop.

**Order of events.** The skill creates the worktree and the git-state snapshot, runs the sandbox probe (unless you or `--accept-no-sandbox` accepted running without a sandbox), and only then installs dependencies (if you allow it) and runs the judge. If the probe does not report enforced it stops before any project code runs and names the worktree, branch, scratch directory and snapshot file it created, unless you accept the risk for code you trust. If the sandbox blocks the network, the install cannot run: an interactive session lets you install yourself in the worktree or knowingly open the network for that one step, then close it and re-run the probe before the judge (this interactive path was not tested); a non-interactive session stops and prints the install command. Before the first `git status` it lists the git config lines that can run code (`core.hooksPath`, `core.fsmonitor`, `hook.*`, `filter.*`, which includes the lines git-lfs sets); any line listed makes it stop and ask, and a non-interactive run stops and prints them, so a non-interactive run stops on any machine where git-lfs is installed (its `filter.lfs` lines live in your global git config) and in any repository that sets `core.hooksPath`, husky for example, until you use an interactive session or a clean git config. The worktree is then created with hooks and fsmonitor switched off for that one command. These prompts were not tested with a human. Your session's final checks run project code again, so put the whole session in the sandbox from the start.

**Your judge.** A good judge:
- is your project's documented test command, run once and exiting (not watch mode), for example `npm test`, `node --test`, `python -m unittest` or `pytest`;
- exits non-zero on failure, is green before you start, and prints a test count the skill can read (the skill checks that a new test file raises it). Check your runner prints one;
- contains none of `|`, `||`, `;`, a lone `&`, `tee`, a leading `!`, `exit` or `exec`, `command exit`, process substitution (`<(...)`), output redirection other than a `>&N` duplication such as `2>&1`, a `#` comment, command substitution (`$(...)`, backticks, `$'...'`), `eval`, `sh -c` or `bash -c`, a mode that runs no tests (`--collect-only`, `--list`, `--no-run`, `--dry-run`), `--passWithNoTests`, `--exit-zero`, `--updateSnapshot`, `--bail`, `--lf`, `--ignore` or `-u`, no control character other than a tab, no line-separator or invisible character, and is at most 400 characters; the script refuses these because they can invert, hide or skip the exit status or the test count. The screen is best effort: a wrapper script, `python -c`, or a test script that masks failures itself still passes it, so the baseline count gate and your own re-run stay the real checks, and quoting or option-argument forms can slip past it. A command that legitimately needs one of the refused forms (a `-u` for a container user, a comment) goes in a wrapper script;
- is not flaky. Run it a few times first. A slow judge multiplies the cost, because it runs for the baseline, in the fixer's checks, in each verification and re-run, and in your session's own re-run, and a slow judge has not been tested.

## Quick start

From the root of your repository, after installing:

```text
/nh-chaos-monkey src/parser --judge "<your project's test command>" --lead-only --max-rounds 1 --max-findings 2
```

`--lead-only` makes no code changes, but it still executes your project's code, your tests and its own reproducers, so read "Safety" below first. Drop `--lead-only` to let the loop fix what it confirms.

The skill only runs when you invoke it by name (`disable-model-invocation: true`); it does not trigger from natural language.

| Argument | Meaning |
| --- | --- |
| first positional argument | The target: a path or module. There is no `--target` flag. |
| `--judge "<cmd>"` | Your test command, exactly as you document it. |
| `--lead-only` | Prove breaks, fix nothing. |
| `--accept-no-sandbox` | You accept the risk of running without an OS-level sandbox. Only for code you trust. |
| `--allow-install` | Allow the lockfile install described above. |
| `--max-rounds N`, `--max-findings N` | Caps. Interactive defaults are 3 rounds, 6 findings per round and 3 fix attempts per finding. A non-interactive session (`claude -p`) uses 1 round and 3 findings unless you pass them. |

Non-interactive use needs the target and `--judge`, plus either a passing sandbox probe or `--accept-no-sandbox`. `claude -p` stops a loop that is still running ten minutes after the session's last turn: the commits stay on the branch but the session never reaches its final checks, so treat them as unverified leads. Only the launcher can lift that limit (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, together with an outer timeout). See [`SKILL.md`](nh-chaos-monkey/SKILL.md) for the whole contract.

### What you will see

The report lands in your Claude Code session. The loop's work lives on a `chaos/<name>` branch in a worktree outside your repository, and its scratch directory holds judge output and exports. An illustrative card for one fixed finding:

```text
chunk() drops the last partial slice                      fixed-verified (re-proved by your session)
Hypothesis   If the input length is not a multiple of n, chunk(items, n) still returns every item.
Reproducer   node <scratch>/R1/boundaries/chunk-remainder.mjs      exit 1, exit 1 (two failing runs)
Fix          commit <sha>; regression test test/chunk.test.mjs
Checks       judge 5 -> 6 tests green; protected files unchanged; the new test fails on the tree before the fix
```

### Cleaning up

The worktree shares your `.git`, so working files stay untouched but the loop adds a branch, `refs/chaos/rejected/*` refs and `git stash` entries to your repository. Do not run a habitual `git stash pop`: it could apply a rejected attempt. When you are done:

```bash
git worktree list                 # find the loop's worktree
git worktree remove <path>        # remove it
git branch -D chaos/<name>        # after you have merged or discarded the work
git for-each-ref refs/chaos       # rejected attempts, delete with git update-ref -d
git stash list                    # entries named after the run
```

## Cost and time

The loop is slow and uses many agents. Runs on 2026-11-08 (small projects, five default lenses) used typically 1.2M to 1.4M subagent tokens per fixed finding, within a range of 0.85M to 2.7M, and the first runs (four lenses) about 0.8M; the three runs of 2026-11-23 that recorded token counts came in at about 0.3M to 0.8M per fixed finding, so plan for the higher figures. Three fixes took 12 to 14 minutes on small projects, eight fixes in two rounds took 76 minutes on a real 350-line module, and a clean run that found nothing took 3 minutes and 0.9M tokens. A five-lens, one-round, one-finding lead-only run used about 0.9M by the session's own report ([`learning.md`](nh-chaos-monkey/learning.md), 2026-11-13). On the release candidate (2026-11-23), by the sessions' own reports: a two-bug JavaScript fixture took 13 minutes and about 0.65M subagent tokens for 2 fixes (inside a sandbox), a small Python fixture about 5 minutes and 1.48M tokens for 2 fixes, and a real library with a 366-package dev tree about 24 minutes and 2.48M tokens for 3 fixes. The default caps allow up to 18 fixes, roughly 23M tokens at the typical rate and up to 48M at the worst measured rate. Start with `--max-rounds 1 --max-findings 2`. Unless a token target is set for the turn, the round and finding caps are the only stop, and a headless run is also bounded by any spending limit your launcher sets, so set one.

## Safety: what is enforced and what is only requested

- **Checked by the script:** it screens the values agents return (exit statuses, test counts, paths, hashes), refuses unsafe or unknown arguments, requires a linked worktree on a `chaos/*` branch, and halts when its re-run disagrees with the verifier. Those values still come from agent reports, which your session then re-checks.
- **Only requested:** the prompts forbid pushing, network use and reading outside the worktree, and tell every agent to treat repository and tool text as data. A prompt cannot stop an agent from disobeying. Only an OS-level sandbox does. The final checks by your session are also prompt-driven.
- **Sandbox:** run the whole session in a container, a VM or an OS sandbox that blocks reads of credential files and writes outside the worktree and scratch directory, with no network for the agents' tools (Claude Code itself still has to reach the model API). [`references/safety-runner.md`](nh-chaos-monkey/references/safety-runner.md) has the recommended runner and a tested setup. Tested: Claude Code's built-in sandbox on macOS, fail-closed and started from a clean environment, where a pre-release build of the v0.2.0 probe (nine credential locations) reported enforced (after it learned to ignore that sandbox's own proxy login) and two full fixing loops ran. That sandbox covers shell commands only; the file tools and the model client are outside it. Not tested: a whole-process sandbox (srt, a container or a VM around the whole session).
- **Probe:** `nh-chaos-monkey/scripts/sandbox-probe.mjs` tries the things an enforced sandbox must refuse (writes outside the worktree, credential files, git hooks and config, a direct network connection, secret-looking environment variable names, meaning names with a credential word such as TOKEN, SECRET, PASSWORD or API_KEY, where TOKEN counts unless another letter follows it, and not configuration such as `AWS_REGION` or a count such as `*_TOKENS`) and reports blocked or allowed. Inside Claude Code's built-in sandbox it ignores the sandbox's proxy password variable when `SANDBOX_RUNTIME` is `1`, `CLOUDSDK_PROXY_ADDRESS` is a loopback address and `:<password>@` appears in `HTTPS_PROXY`, `HTTP_PROXY` or `ALL_PROXY`, lists it as ignored and says so; that is a string match, not proof of where the value came from. Any probe that cannot be evaluated, including an undecided credential check, counts as not enforced. Its limits: it tests a direct network connection, not an allowlisting proxy (which is how Claude Code's own sandbox filters the network); it opens 15 credential locations (SSH keys, AWS, `gh`, `.netrc`, `.npmrc`, kube, docker, gcloud, `~/.git-credentials`, Azure, `~/.pypirc`, Cargo and Terraform) and skips files that do not exist, directories and named pipes; a refusal (permission denied) counts as blocked, and any other error, such as a symlink loop or a socket at that path, counts as undecided, which makes the verdict incomplete; the result is unknown without penalty only when none of the 15 is a regular file or refused, so it does not cover files such as `~/.claude/settings.json`, and it checks the SSH agent socket only by the name of its variable. Run unsandboxed, it briefly creates and removes small files in your home directory, next to the worktree, in the shared git hooks directory and through a symlink, opens the shared git config for writing, and tries a TCP connection to a public address. Run it where the agents run. Its verdict is evidence, not a guarantee.
- **Prompt injection:** findings passed from one agent to the next are fenced as untrusted data, instruction-like text found in the repository is reported and not obeyed, and a fix that adds such text fails verification. Judge and reproducer output tails reach your session cleaned to a small character set and listed, together with the other free-text fields the script knows about, in the result's `untrustedFields` (a help, not a guarantee), but not fenced: prose in them is still text from the repository, so treat the whole result as untrusted data. This is defence in depth and was tested with naive static payloads only.
- **Fault injection** works through test doubles inside the tests. The skill never kills instances or injects faults into running services or into Claude Code's own tools.
- Judge output and agent transcripts can contain secrets. Scan them before sharing, and delete the scratch directory after review. The git-state snapshot the skill saves lists your local git configuration and lives outside the scratch directory, so delete it too.

## What has been tested, and what has not

| Check | Result |
| --- | --- |
| Deterministic harness | The real loop script runs against scripted fake agents, and the probe runs under real macOS Seatbelt profiles (skipped on other platforms). CI shows the current counts. |
| Live runs on planted-bug fixtures (JavaScript, Python), November 2026 | The loop found and fixed planted bugs, with regression tests that fail on the original code, but not all of them: for example 3 of 4 on the Python fixture (the fourth was beyond the cap) and between 1 and 4 of 4 planted areas across JavaScript runs. Results were re-checked by hand. See [`loop-design.md`](nh-chaos-monkey/references/loop-design.md). On the release candidate (2026-11-23) a two-bug JavaScript fixture and a Python fixture were each fixed twice, and each regression test failed on the tree before its fix when I re-ran it. |
| Inside an OS sandbox, macOS, 2026-11-23 | Claude Code's built-in sandbox, fail-closed, from a clean environment: the probe reported enforced (after it learned to ignore the sandbox's own proxy login), and two full fixing loops on a two-bug JavaScript fixture ran inside it (2 fixes each; judge 4 to 9 and 4 to 10; each regression test failing on its parent tree and passing on the fixed head; no credential location touched and no file written outside the allowed folders). An agent's write outside the allowed folders was refused. Shell commands only. Separately, the probe alone (no loop) in a locked-down Alpine container (no network, read-only root, an unreadable key file) reported enforced, and in the same image with default settings it reported not-enforced. |
| Prompt-injection canary, two runs | None of the planted instructions was executed (79 agents). One model, naive static payloads, and not repeated on the current version. |
| Unplanted bugs, one module, lead-only | 4 breaks confirmed. Independent AI reviewers who read the code judged 2 of them real defects and 2 by design or unreachable. The judge was a filtered subset, which the skill does not allow as normal practice. |
| Unplanted bugs, a real library, fixing, 2026-11-23 | jshttp/negotiator 1.1.0 (a local clone with no lockfile; 366 dev packages installed with scripts off): 3 fixes, judge 253 to 296 passing, each regression test failing on its parent tree. Three independent AI reviewers judged each fix against the specification and the library's history: 2 were real defects with acceptable fixes (a media type with an empty side, which version 1.0.0 rejected; a negative weight on one coding removing the implicit `identity`), and 1 was debatable and too broad (a roughly 100-line change that treats parameters after `q` as extensions, which follows the obsolete RFC 7231; upstream had closed an equivalent proposal unmerged). A confirmed break proves a behaviour, not that the library is wrong. |
| Hardening items from issue 25, 2026-11-23 (v0.2.1) | Eight open items were first reproduced by read-only investigators and re-checked by a second agent each; all reproduced, the `--add-dir` question only partly because the documentation is silent. The fixes were written test-first (34 new tests, none of the existing ones changed; a review then showed several first tests would pass against wrong implementations, so they were strengthened until the 13 sample mutants recorded in `learning.md` were caught). A wording comparison on the worktree command and the npm install flags scored 22 of 22 checks against 12 of 22: in all four baseline trials of the two scenarios that differed, the planted hook or the fsmonitor script ran; three more scenarios tied. A second wording round after an independent review (a stricter install and config pre-check) tied 13 of 13 against 13 of 13 and ships on the owner's decision, because the review proved a credential-leak path through an `.npmrc` expansion that the careful trial agents happened to avoid. The 15-location probe was not re-run inside Claude Code's own sandbox; see [`learning.md`](nh-chaos-monkey/learning.md). |
| Independent review of the release candidate, 2026-11-23 | A read-only AI review of the changes since v0.1.0 found 0 high, 6 medium and 8 low issues. The medium ones led to a wording comparison, tighter probe rules and tests; see [`learning.md`](nh-chaos-monkey/learning.md). |
| End-to-end check of the installed skill, 2026-11-12 | The probe CLI and four headless sessions found three gaps: a stop message that suggested a flag the skill does not have, a session that cut its lenses on its own after a stray `--token-budget`, and a judge run before a worktree existed. The first two were corrected in the instructions and re-probed on the merged skill on 2026-11-13; the third is documented as is. See [`learning.md`](nh-chaos-monkey/learning.md). |

**Not exercised on the current version:** the 15-location probe inside Claude Code's own sandbox (the live runs used a pre-release build of the 9-location v0.2.0 probe), Go live runs, a whole-process sandbox (srt, a container or a VM around the whole session) around a live loop, Claude Code's sandbox on Linux or Windows, the loop inside a sandbox that allows a registry for the install, a project with a build step (TypeScript, say) or a slow judge, a verifier outage, the `lead` and `invalid` classes in a live run, adaptive injection payloads written by someone who knows the prompts, a verifier from a different model family, and more than one real library. The earlier live runs and the injection canary predate some later fixes. Every live run was one model on one machine, so the numbers show behaviour, not rates.

## Glossary

- **Judge:** your test command. It decides what passes.
- **Protected paths:** existing tests, fixtures, snapshots, config and lockfiles that the fixer may not touch, so it cannot "fix" by weakening the judge.
- **Lens:** a way of attacking the target (boundaries, state order, error paths, contract, faults). One breaker agent per lens.
- **Breaker, confirmer, fixer, verifier:** the agent roles. Different agents hold them, so the one that wrote a fix never judges it.
- **Reproducer:** a small script that fails on the current code and shows the break.
- **Lead-only:** prove breaks and fix nothing.
- **Main session:** your own Claude Code session, which re-checks the loop's claims at the end.

## Security

Report anything suspicious privately, for example a tampered skill or a prompt-injection risk. See [`SECURITY.md`](SECURITY.md). Do not open a public issue for it.

## Versions

Releases are tagged `vMAJOR.MINOR.PATCH`, and each release's notes list what changed and what is untested. While the version starts with `0.`, a skill's arguments or behaviour may change between minor versions, and the release notes will say so. Only the latest release and `main` get fixes. See [`SECURITY.md`](SECURITY.md).

## Contributing and support

This is one person's collection, so support is best effort with no SLA; see [`SUPPORT.md`](SUPPORT.md). Bug reports, unclear docs and small fixes are welcome as issues and pull requests; see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). A new skill should be a focused task with a clear *when to use it* in its `description`, and a skill that shells out or touches the network goes through the security review described in [`AGENTS.md`](AGENTS.md).

To add or change a skill:

1. Create a top-level folder named exactly like the skill. The folder name must equal the `name:` in its frontmatter.
2. Add a `SKILL.md` with valid frontmatter (`name`, `description`). Push long detail into `references/` instead of the body.
3. Run the validator and the tests:

   ```bash
   npm ci
   npm run validate
   npm test
   ```

4. Open a pull request. CI repeats both on every change to a `SKILL.md`, a skill's `scripts/` or `references/` folder, the validator, the tests, the fixtures or the package files, and runs a secret scan on every pull request.

`AGENTS.md`, `Context.md`, `status.md` and the other maintainer documents in the root describe how this repository is run. Some of them link to sibling projects in the author's own workspace, and those links do not resolve here.

## License

[Apache-2.0](LICENSE).
