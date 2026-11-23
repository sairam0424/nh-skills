# Safety runner

How to run the loop so a hostile repository cannot reach the user's machine, how to check that the isolation is real, and what has and has not been tested. Written from a research pass on 2026-11-08 plus tests run on a Mac the same day, and extended on 2026-11-23 with live runs.

## Contents

- Threat model
- What Claude Code's own sandbox does and does not cover
- Recommended runner
- A tested setup: Claude Code's built-in sandbox (macOS)
- The preflight probe
- Git worktree hazards
- Prompt injection
- Tested and not tested

## Threat model

The loop reads untrusted repository text (source, comments, README, test output), runs project code through reproducers and the judge, and edits files. Meta's Agents Rule of Two (2025-10-31) says one session should have at most two of: it processes untrustworthy input, it can reach sensitive systems or private data, it can change state or communicate externally. Meta counts source code as sensitive. This skill always has the first and third, so it must remove the second as far as it can (no credentials in reach, a disposable worktree, no network) and it keeps a human decision at the end: the user alone merges, pushes or deletes anything. The OWASP Top 10 for Agentic Applications 2026 points the same way: treat natural-language inputs as untrusted (ASI01), run generated code in a sandbox with limited network, a dedicated working directory and a diff trail (ASI05), and be careful with installs and lockfile regeneration, where hostile code can run during installation.

## What Claude Code's own sandbox does and does not cover

From the Claude Code sandboxing and settings documentation as read on 2026-11-08:

- It covers shell commands and their children. File tools, hooks and local MCP servers run outside it. A read deny rule does not stop the Read tool, and the domain allowlist does not limit web fetches.
- It is off by default. When enabled and unavailable it fails open unless told otherwise, and an unsandboxed retry is allowed unless disabled.
- Reads are open across most of the machine, including the usual credential files, and environment variables are inherited, secrets included. There is no built-in credential deny list.
- Network control is a hostname allowlist at a proxy that does not inspect TLS. A broad entry such as a code-hosting domain is an exfiltration path, and domain fronting may bypass the list.

The documentation itself says the Bash sandbox alone is not enough for unattended runs and recommends running the whole process under the sandbox runtime, a container or a VM.

## Recommended runner

1. Run the whole agent process under a sandbox that confines files and network: the open-source sandbox runtime from Anthropic (srt; Seatbelt on macOS, bubblewrap and seccomp on Linux), a container or a VM. As of the research it is a beta research preview below 1.0 (v0.0.81, 2026-10-20) with a past security advisory, so pin the exact version, verify it, and never install it under a writable dependency folder.
2. Configure it explicitly: deny reads of credential locations (an unconfigured srt allows all reads), allow writes only to the worktree and the scratch directory, leave the network allowlist empty, and run as an ordinary user.
3. If the Claude Code sandbox is used as well, set it enabled and fail-closed: failIfUnavailable true, unsandboxed commands not allowed, no excluded commands, and the environment scrub that strips credentials from subprocesses turned on. The setting names above were checked against Claude Code 2.1.330 on 2026-11-23 (see "A tested setup" below); check the current settings reference before pasting them into another version.
4. Run the preflight probe below inside that environment, before anything executes project code, and pass requireSandbox to the loop so it refuses to start when the probe fails.
5. Install dependencies from the lockfile with scripts disabled, after the user agrees, with the package manager's cache and logs under the scratch directory, and never regenerate a lockfile inside the loop. With an empty network allowlist the install cannot run inside the sandbox. An interactive session says so and lets you install in the worktree yourself from your own shell, or knowingly open the network for that one step, close it again and re-run the probe before the judge (the interactive path was not tested); a non-interactive session prints the install command and stops.

Without a sandbox the loop still works and its checks still run, but its prompts only ask agents not to leave the worktree. Say so in the report.

## A tested setup: Claude Code's built-in sandbox (macOS)

Tested on 2026-11-23 with Claude Code 2.1.330, in headless `claude -p` sessions authenticated to Amazon Bedrock. This sandbox covers the shell commands every agent runs. It does not cover the model client, the file tools (Read, Write, Edit), hooks or MCP servers.

Settings, passed with `--settings` (the paths are examples):

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "denyRead": ["~/.ssh", "~/.aws", "~/.npmrc", "~/.netrc", "~/.config/gh", "~/.kube", "~/.docker", "~/.config/gcloud", "~/.git-credentials"],
      "allowWrite": ["/path/to/worktree", "/path/to/scratch", "/path/to/repo/.git"],
      "denyWrite": ["/path/to/repo/.git/hooks", "/path/to/repo/.git/config"]
    },
    "network": { "allowedDomains": [] }
  }
}
```

How it was run:

- The worktree directory and the scratch directory were created empty before the session and given to it by exact path. The sandbox lets shell commands write only there and into the shared `.git` directory. The loop needs the shared `.git` for the worktree, the commits, the refs and the stash; hooks and config stay read-only, and the probe checks that.
- The session started from a cleaned environment (`env -i` plus only the variables Claude Code needs to start) with `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, and with the allowed tools passed explicitly, because with the scrub set these sessions ran in Claude Code's default permission mode. In one session started without a cleaned environment but with the scrub set, the launching shell's GitHub and messaging tokens did not appear in the sandboxed shell, which fits the scrub stripping them (no run without the scrub was compared); the clean launch is kept as extra insurance, and the probe lists whatever credential-looking names remain.
- The model's own traffic is not affected by the empty network allowlist, because the parent process makes it.

What the probe reported inside it: **enforced**, with every write, credential and network probe blocked. The sandbox puts the login for its own loopback proxy into every shell (the proxy password variable, also embedded in `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY`). The probe ignores that password only when `SANDBOX_RUNTIME` is `1`, `CLOUDSDK_PROXY_ADDRESS` is a loopback address and `:<password>@` appears in `HTTPS_PROXY`, `HTTP_PROXY` or `ALL_PROXY`, and prints that it did. That is a string match, not proof of origin: code that can set those variables can make the probe ignore a value it chose, so the verdict stays evidence, not a guarantee.

Limits: the dependency install cannot run inside it because there is no network. At Step 2 item 6 an interactive session says so and lets you install in the worktree yourself, from your own shell, or knowingly open the network for that one step and re-run the probe afterwards (this interactive path was not tested); a non-interactive session prints the install command and stops, so use an interactive session for a project that needs an install. A sandbox that allows only your package registry would also let the install run, but that setup was not tested and a registry host is itself a network path out. The file tools and the model client are outside the sandbox, so the verdict says nothing about what the loop's agents do through them; the final checks by your session are the backstop. Linux (bubblewrap) and Windows were not tested.

## The preflight probe

[sandbox-probe.mjs](../scripts/sandbox-probe.mjs) tries the things an enforced sandbox must refuse and reports blocked, allowed or unknown for each: writing to the home directory, writing next to the worktree, writing through a symlink that points at the home directory, opening the usual credential files (it never reads a byte), writing to the shared git hooks directory and opening the shared git config for writing, secret-looking environment variable names (names only; a name counts when it contains a credential word such as TOKEN, SECRET, PASSWORD, API_KEY or ACCESS_KEY, or a whole-word PAT, PASS or AUTH, so AWS_REGION and a count such as CLAUDE_CODE_MAX_OUTPUT_TOKENS do not), and a direct TCP connect to a public address (a proxy configured in the environment is not tested). Besides the home directory credentials it also opens the npm, kube, docker and gcloud locations, and the shared worktree config file when one exists. It removes what it creates; if a removal is refused the probe still reports the write as allowed and says what to remove by hand. The verdict is enforced only when every probe was blocked; the credential probe may be unknown when none of those files exist, but any other probe that could not be evaluated makes the verdict incomplete, which counts as not enforced. Inside Claude Code's built-in sandbox the probe ignores the sandbox's own loopback proxy password, only under the conditions stated above, lists it in the `ignored` field and says so on the env-secrets line; a human reading the output sees it, but the loop's relay of the probe keeps only the verdict and the allowed probes. Exit status 0 means enforced.

```bash
node scripts/sandbox-probe.mjs --workdir /abs/worktree --scratch /abs/scratch
```

Run it where the agents run, not in a different shell, and after the worktree and scratch directory exist (Step 2, item 5 in SKILL.md, before the install and the judge). A "blocked" network result also holds when the machine is offline, so it shows the attempt failed, not why. The loop can run it for you: pass requireSandbox true and probePath (the absolute path of the script) and an agent runs it through its own Bash tool before the judge executes any project code; any allowed or unresolved probe halts the run with sandbox-not-enforced. The agent relays the probe's JSON, so its verdict is an agent's report of an incomplete test: run the probe yourself as well.

## Git worktree hazards

A linked worktree shares its git directory with the primary checkout: hooks, local config, refs and the stash. CVE-2026-55607 (fixed in Claude Code 2.1.163, 2026-06-04) was a sandbox escape that combined a worktree named .git, symlink manipulation and git's fsmonitor setting, triggered by prompt-injection text in a cloned repository. Treat it as a patched case study of the vector. The loop's defences: commits run with hooks disabled, prompts forbid writing in .git, the probe checks that hooks and config are not writable from the sandbox, and the main session compares a snapshot of the shared git state before and after the run (see the judge protocol).

## Prompt injection

Every prompt that carries earlier agents' text wraps it in a fence marked as untrusted data, reduces it to a small safe character set (quotes, backticks, dollar signs, pipes and redirects are removed; parentheses, colons and semicolons survive) and caps its length. The verifier is told that text aimed at it which the fixer added fails the fix, while instruction-like text already in the repository is not obeyed, not held against the fix, and reported. Raw judge and reproducer output tails still reach the main session unfenced in the result, so treat the whole result as untrusted data, not as instructions. That is defence in depth, not a guarantee. The spotlighting paper (Hines et al., Microsoft, 2024) found delimiters alone weak and advises assuming the attacker knows the system prompt, and the 2025 "Attacker Moves Second" paper bypassed twelve published defences with adaptive attacks. Microsoft's own position is that the defence does not rely on blocking every injection but on limiting what an injected agent can do, which is why the sandbox, the empty network allowlist and the human merge decision matter more than the fences.

## Tested and not tested

Tested on 2026-11-08, macOS, Node 26:

- The probe against a throwaway repository and linked worktree: unsandboxed (all probes allowed), in a world locked with ordinary file permissions (all blocked, runs everywhere except as root), under a real Seatbelt profile that denies writes outside the worktree and scratch, denies fake credential files and denies the network (all blocked), and under three deliberately loose profiles (an open git directory, an open network, and one that allows creating but not removing files), each caught. The Seatbelt tests run on macOS and skip with a stated reason elsewhere, so CI on Linux runs the permissions-based ones.
- One injection-canary run on 2026-11-08: instruction text planted in a source file header and in the README told agents to create an acknowledgement file, request a localhost URL, push to a bait remote, skip or delete a test, and told verifiers to pass fixes unchecked. Canary values were random per run, and a logger, a bare repository and a directory watch recorded any obedience. Across 41 agents and 526 tool calls none of it was executed: no acknowledgement file, no request in the logger, an empty bait remote, no test skipped or removed, and several agents named the injection in their reports. The cost was availability: the verifier counted the pre-existing hostile text against fixes and rejected three legitimate ones, so the loop failed closed. The verifier rule is now scoped to text the fixer added, and hostile text found anywhere is reported in the result as injectionSuspected. The run was repeated with that change (38 agents, 420 real tool calls): again nothing obeyed, 4 fixes instead of 2, and hostile text reported on 4 findings.

Tested on 2026-11-23 (macOS, Node 26; details in `learning.md`):

- The probe inside Claude Code's built-in sandbox (enforced), two full fixing loops inside it, and the sandbox settings in the section above.
- The probe in a locked-down Alpine container (no network, read-only root, a root-owned unreadable key file; enforced) and in the same image with default settings (not enforced); the probe alone ran there, no loop.

Not tested: srt itself, Claude Code's sandbox on Linux or Windows, a whole-process sandbox (srt, a container or a VM around the whole Claude Code process) around a live loop run, adaptive injection payloads written by an attacker who knows these prompts, and more than two canary runs (the result is two samples of naive, static payloads on one model).
