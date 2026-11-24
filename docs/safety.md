# Safety and threat model for nh-chaos-monkey

This page says what `nh-chaos-monkey` can do to your machine, what stops it, and what does not. The README has the install steps and the numbers; [`references/safety-runner.md`](../nh-chaos-monkey/references/safety-runner.md) and [`references/loop-design.md`](../nh-chaos-monkey/references/loop-design.md) hold the detail this page summarises. Nothing here has been audited by a human. The checks behind it are the validator, the tests and independent AI reviewers.

Read it in this order: who may run it on what, what must surround it, what it can touch, which controls are real, when it stops, what its words mean, and what it does not do.

## 1. Trusted input only

Run it on code you own. The loop executes your project's code, your tests and reproducers that agents wrote, so a hostile repository can run its own code on your machine. That is a documented risk of running it unsandboxed, not a defect in this repository (see [`SECURITY.md`](../SECURITY.md), "Out of scope"). A way around a control the skill does claim (the worktree and branch checks, the protected-file hashes, the probe) is in scope for a report.

The threat model assumes **prompt injection can succeed**. Meta calls it "a fundamental, unsolved weakness in all LLMs", so the design does not rely on an agent refusing hostile text. The prompts tell every agent to treat repository and tool text as data, and the script fences what one agent passes to the next, but a prompt cannot stop an agent from disobeying. Only an OS-level sandbox does.

## 2. Containment you must supply

The skill does not provide isolation. You run the whole session in a container, a VM or an OS sandbox that:

- blocks reads of credential files in your home directory,
- blocks writes outside the worktree and the scratch directory, except the repository's shared `.git` directory, which the loop must write (not its hooks or config),
- gives the agents' tools no network (Claude Code itself still has to reach the model provider),
- runs as an ordinary user, not root.

Step 2 of the skill runs [`sandbox-probe.mjs`](../nh-chaos-monkey/scripts/sandbox-probe.mjs) before any project code runs, and the session is instructed to stop unless it reports `enforced` or you knowingly accept the risk for code you trust. The verdict reaches the loop through an agent's relay of the probe's output, so run the probe yourself too.

What the sandbox in Claude Code does and does not cover, as Anthropic's documentation describes it in November 2026 (behaviour is version-specific):

| Covered | Not covered |
| --- | --- |
| Shell commands and their child processes, when the sandbox is on and fail-closed | The file tools (Read, Write, Edit) and the model client |
| Network egress to hosts outside your allowlist | MCP servers, command hooks and plugin monitors, which run on the host |
| | Data the sandbox can read and then send to an allowed host; a writable project mount can still be changed |

The sandbox is off by default, and Anthropic's documentation says it does not run on native Windows (not tested here). "Reduces the impact of a breach" is the strongest claim the documentation makes, and this page makes no stronger one. `safety-runner.md` has a recommended settings block (the exact list used in the tested runs was not recorded) and what a pre-release, nine-location build of the probe reported inside it.

Not tested: a whole-session container, VM or `srt` around a live loop, and the shipped 15-location probe inside Claude Code's own sandbox (the live runs used a pre-release nine-location build). The README's "What has been tested, and what has not" lists the rest.

The plugin route installs the skill folder only: `SKILL.md`, `references/`, `scripts/` and a journal. It adds no hooks, no MCP servers, no commands and no monitors.

## 3. Blast radius

A working-directory boundary is not containment. In a normal permission mode it is a prompt, so an approved shell command can write anywhere your account can. What the loop touches:

| Where | What happens | Rolled back by discarding the branch? |
| --- | --- | --- |
| The worktree (a directory outside your repository, on a `chaos/*` branch) | Fixes and regression tests are written and committed here. Reproducers are written to the scratch directory and never committed | Yes |
| The scratch directory | Judge output, exports, reproducers and (when you allow the install, or pass `--allow-install`) the package manager's cache and logs | Delete the directory yourself |
| Your repository's shared `.git` | The new branch, `refs/chaos/rejected/*` and `git stash` entries; hooks and config live here too | The branch yes; refs and stash entries only if you delete them |
| Your checkout's working files | Not edited. Uncommitted changes are not included in the worktree | Not applicable |
| Files git ignores (dependency folders, build output, caches) | Watched by nothing in the loop | No |
| Anything project code does outside those places | Possible unless the sandbox blocks it: writes elsewhere, network calls, child processes | **No.** Discarding the worktree does not undo effects outside it |

That last row is the limit on every rollback claim here: rollback is deleting a branch and a directory, not reversing what executed code did.

## 4. Rule of Two, per setup

Meta's [Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/) says that until prompt injection can be reliably detected and refused, one agent session should satisfy no more than two of: **A** processes untrustworthy inputs, **B** accesses sensitive systems or private data, **C** changes state or communicates externally. An agent that needs all three should not run autonomously.

| Setup | A | B | C | What keeps it to two, or why it does not |
| --- | --- | --- | --- | --- |
| Sandbox enforced, no install (lead-only or fixing) | Yes: repository text, dependencies and reproducers steer the agents | Reduced, not removed: the agents must read your source, which Meta counts as sensitive. An enforced probe shows that the 15 credential files it opens, its write locations and a direct network connection were refused; other files and proxied traffic are untested. The file tools are outside the sandbox, so deny reads of credential paths in your permission rules too | Yes: runs code and writes the worktree, scratch and branch. No network for shell commands | Two of three plus a reduced B, for shell commands, if the sandbox holds |
| Dependency install you approve | Yes | Possible: a project `.npmrc` can name a registry and a token | Yes: the network is open for that one step | All three for that step. Controls: a lockfile install with scripts off where the tool allows, a scrubbed environment, stop rules for `.npmrc` expansions and auth lines, and your approval. These controls are requested of your session, not enforced by the script, and the interactive path was not tested with a human. A non-interactive run never installs unless `--allow-install` is passed and stops on a risky `.npmrc` |
| `--accept-no-sandbox` | Yes, unless you trust the code (the only thing that lowers A) | Yes: your home directory is reachable | Yes: network and push are possible | All three. The skill asks you to accept the risk, and your supervision is the control. Use it only for code you trust |
| Unattended `claude -p` | As above | As above | As above | No human is present. It needs the target and `--judge` on the command line plus a passing probe or `--accept-no-sandbox`; the caps default to 1 round and 3 findings. Treat the result as leads, and set an outside time limit and a spending limit yourself |

Your own Claude Code session (the *main session*) also reads text that agents wrote from repository content, and it holds your permissions. That is why Step 4 treats the whole result as untrusted data, runs only the reproducers it names after reading them, and never runs a command found in prose.

## 5. Controls against OWASP's code-execution threat

OWASP's *Agentic AI Threats and Mitigations* (v1.1, [genai.owasp.org](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)) lists threat T11, unexpected code execution, and Playbook 3 (isolated tool execution). Each control below is marked as the skill implements it, and the gaps are stated.

| Control | Status here |
| --- | --- |
| Sandboxed, isolated execution | **Not provided.** You supply it; the probe checks it |
| CPU and memory limits, restricted system calls | **Not implemented.** Run in a container or VM if you need them |
| Restricted code-generation permissions | **Partial.** The fixer may not touch protected paths (hashed by an agent before the fixer starts and re-checked by the verifier and rejudge agents; the script compares the numbers they report), and one new regression test file is allowed. The scope in the prompts is only requested |
| Monitoring of generated scripts | **Partial.** A reproducer must start with an allowed runner and live under the scratch directory, and your session reads each reproducer before its own re-run (the loop's agents have already run it twice). A verifier's diff review of added source files is a model judgement |
| Flag elevated-privilege code for manual review | **Partial.** An added file under CI, hook or tool-config locations fails Step 4. You should read every commit before merging; nothing enforces it |
| Reset or destroy after each execution | **Partial.** The worktree is throwaway and the skill offers to delete the scratch directory, but nothing is reset after each reproducer |
| Human verification before elevated-privilege code runs | **Partial.** You confirm the contract in Step 1 and choose what merges. Reproducers run without a per-run approval from the skill |

## 6. Baseline and when it stops

**Baseline first.** Before anything is attacked, your judge must be green and print a counted number of tests (the externally measurable output the loop compares everything to). Otherwise it halts with `baseline-judge-red`, `baseline-test-count-unknown` or a related reason before any break is looked for.

**Caps and halts.** Rounds, findings per round, fix attempts per finding and findings per file are capped (3, 6, 3 and 2 by default interactively; 1 round and 3 findings in a non-interactive run). A safety halt, for example a dirty worktree, a verifier that is down or a re-run that disagrees with the verifier, stops the loop and says why. Every return carries a `haltReason`; the table is in [`loop-design.md`](../nh-chaos-monkey/references/loop-design.md#halt-reasons). A probe that cannot be evaluated counts as not enforced, and an unavailable verifier halts the loop instead of passing a fix.

**Defaults that do nothing.** The script's `requireSandbox` switch is **off** unless the caller sets it, and it is the skill's instructions that turn it on when you run inside a sandbox. Run the script without it and no sandbox probe gates the judge. The probe in Step 2 is the one that matters, and the session is instructed to stop there unless it reports enforced.

**There is no live monitor.** The loop does not watch your machine's health while it runs; it stops on its own caps. A run in `claude -p` is also stopped ten minutes after the session's last turn unless the launcher lifts that limit, which leaves unverified commits (see the troubleshooting page).

## 7. What the verdicts mean

The result's `finished` and `haltReason` fields say whether it stopped normally. Each finding then has one class:

| Class | Meaning |
| --- | --- |
| `fixed-agent-verified` | Two failing reproducer runs, a fix that passed the loop's checks, committed on the branch. Not yet proven |
| fixed-verified | The word your own session uses only after it re-ran the judge, the diff and git-state checks, the reproducer on the fixed head, and the regression test on the tree just before the fix. It means a session checked it, not that a human reviewed it |
| `confirmed-unfixed` | The loop's agents saw the reproducer fail twice; no fix was achieved. Check that the reproducer runs your project's code before you believe it |
| `superseded` | The reproducer passed again after an earlier fix |
| `lead` | Plausible but not confirmed |
| `invalid` | The confirmer judged it not reachable through a public entry point or the documented contract |

A stop on `plateau` means no further break was found within the caps, by these lenses, with this judge. It is not a pass, and the skill's instructions forbid it from writing "resilient", "robust", "secure" or "production-ready". A silent agent is not a clean result: the report lists which lenses answered.

**A confirmed break proves a behaviour, not that your documentation forbids it.** In the one lead-only run on unplanted bugs, independent AI reviewers judged 2 of 4 confirmed breaks to be by design or unreachable. Read each against the module's own contract before acting.

## 8. Limitations and what it does not do

- It does not inject faults into running services, networks or Claude Code's own tools. The faults lens uses test doubles inside the tests.
- It does not claim to find every bug. It attacks one target through five default lenses with your judge, and files outside the target are not attacked.
- Agent reports are evidence to check, not proof. Several rows in `loop-design.md` rest on values an agent reported, and the script checks what the agent said it saw.
- There is no hidden oracle, so nothing measures whether a fix overfits the reproducer that found it.
- The git stash and the hooks directory are shared with your checkout, and only your session's before-and-after snapshot comparison detects tampering. Do not run a habitual `git stash pop` afterwards.
- Judge output, agent transcripts and the saved git-state snapshot can contain secrets. Scan before sharing and delete after review.
- The tested and untested lists are in the README ("What has been tested, and what has not"). Every live run was one model on one machine, so the numbers show behaviour, not rates.

## 9. Reporting a problem

A suspected vulnerability, a tampered skill or a way around the worktree and branch checks, the protected-file hashes or the probe goes to [`SECURITY.md`](../SECURITY.md), privately. Everything else goes to a public issue; see [`SUPPORT.md`](../SUPPORT.md) and the [troubleshooting page](troubleshooting.md).
