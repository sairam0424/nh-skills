# Changelog

All notable changes to this repository are recorded here, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Versions follow [Semantic Versioning](https://semver.org/); while the version starts with `0.`, a skill's arguments or behaviour may change between minor versions and the entry says so. Dates are the GitHub release dates in UTC. Each release's notes on the [releases page](https://github.com/sairam0424/nh-skills/releases) carry the full evidence and the checksum of its archive.

## [Unreleased]

### Fixed

- A round in which every breaker ran the code and found nothing should be a plateau again (checked by deterministic tests and a live replay of the original scenario, which stopped on `plateau` after a quiet round 2; see `learning.md`). Breakers wrote "No defect found" into the optional `blocked` field and the loop stopped with `breakers-blocked` ("nothing was tested"). Breakers now set `ranProjectCode`; `blocked` counts only when they did not run the code, and a no-defect sentence without the flag no longer counts.
- A correct fix should no longer end in `independent-rejudge-disagrees-with-verifier-claims` because two agents read a summary such as "2038 passed, 2 skipped" differently (one live replay completed where the original run halted): the baseline, verifier and re-judge prompts now carry one passed-only counting rule.
- Fixers are told not to run `git stash` to see their new test fail on the old code (it left stray entries in the stash shared with your checkout); the fixer prompt says how to do it with `git archive` in the scratch directory.
- A judge that starts with environment assignments (an offline Go cache, a module path) should be reproducible by the confirmer: breakers are given the assignments and set them inside the reproducer (tested with fake agents; not re-run on a Go project).
- Found by the loop on its own source and re-checked by a fresh agent: a non-object or duplicate lens entry and a `workdir` or `scratch` written with a trailing slash defeated the argument checks in `chaos-loop.js`; `sandbox-probe.mjs` crashed when `closeSync` failed and on a malformed or dangling `--net` value (now undecided, and a usage error with exit 2).

### Changed

- `SKILL.md`: Step 2 item 6 says to pass the sandbox's proxy variables through the install scrub (without them `npm ci` fails with ENOTFOUND for an allowed registry); Step 4 gets a report-only item 10 (what the judge did not run, where each changed function is called from, and a fix that turns a failure into silence or flips its direction); Step 5 tells the user to run the project's own lint, type check and CI steps before merging.

### Documentation

- `references/safety-runner.md`: a table of what a project's tests may need allowed inside the sandbox (loopback, unix sockets, nested `sandbox-exec`, `/tmp`, home paths, Docker, offline toolchains, `--allow-install`), measured on eight real projects.
- `references/loop-design.md`: new known limits (one fix per regression-test path, runners cannot carry environment variables, the confirm gate and file-path imports, classification varies between runs, what a green judge does not prove) and the validation history of 22 live sessions.
- README and `docs/tester-guide.md`: the evidence row for the 22 sessions, the corrected not-exercised list, and a pointer to the sandbox table.
- README: a first-run checklist (dynamic workflows must be on for your plan, `/sandbox`, a Python virtualenv example for `--judge` and `--repro-runner`, start lead-only); the Workflow-tool availability from Anthropic's documentation; install snippet that works for both scopes; `npx skills` pinned to the tested version and its `skills-lock.json` noted; cleanup steps for the scratch directory, the snapshot file and a dirty worktree (`git worktree remove --force`); the probe warning (do not run it by hand outside a sandbox); "Your repository", "Order of events" and the probe split into bullets; a glossary entry for the confirm gate; stale statements corrected (the v0.2.2 tag does carry the plugin manifests, and a tag-pinned install was tested).
- Found by a first-user read of the published release. The route checks of release v0.2.2 and one fixing run of the published plugin are added to the README's evidence table, and its statements that no loop had been run through the plugin route are corrected.

## [0.2.2] - 2026-11-24

### Changed

- **Behaviour change.** A break is only confirmed when the confirmer says it has read the reproducer and quotes the line that imports or runs the project's code (the script checks that the quote is present, not that it is true). A reproducer that copies, re-implements, simulates or stubs the code becomes a lead, and a behaviour that the confirmer says the project's own documents describe as accepted becomes invalid, with the document named. The finding records `runsProjectCode`, `projectCodeLine`, `documentedByDesign` and `docRef`; the last two text fields are listed in `untrustedFields`.
- The breaker prompt no longer asks for a "self-contained" reproducer (which invited copies of the code under test) and sends the breaker to the project's README, decision log and changelog before it claims a defect.
- A reproducer runner may be a plain absolute interpreter path (a virtualenv outside the worktree), so a project whose dependencies are not importable by the default `python3` can be reached; `--repro-runner` passes one.
- The verifier reports `changesDocumentedBehaviour` (information, it never fails a fix) and the committer says so in the commit body; commit messages and fixer summaries must describe only what the diff does and treat severity as the breaker's claim.
- **Behaviour change (loosens a stop).** The config listing now uses `--show-scope`. The four standard git-lfs lines (`filter.lfs.clean`, `.smudge`, `.process` and `.required`, with the exact values `git lfs install` writes) no longer stop a run, interactive or not, when they come from the global or system git config; they are listed in the report. Any other value, the same lines in the repository's own config, and every other line (`core.hooksPath`, `core.fsmonitor`, `hook.*`, other `filter.*`, `include`) still stop it. This reverses the 0.2.1 note that a non-interactive run stops on any machine where git-lfs is installed.
- Two new halt reasons that are not a plateau: `breakers-blocked` (no candidate anywhere and a breaker said it could not run the project; the candidates schema gains an optional `blocked` reason) and `reproducers-do-not-run-the-project` (every reproducer of a round was a copy, a simulation or a stub). A round with a blocked lens never counts as dry.
- A quoted line must survive cleaning and contain letters or digits, and an accepted behaviour needs a document reference with a file name or line number, or it is not treated as accepted. A runner path may not lie inside the worktree or the scratch directory. The fixer is told not to edit the project's documents, which later confirmers read, and the verifier is told to report any such change in protectedTouched (documents are not in the protected set, so that rests on its reading).
- `SKILL.md` Step 4 item 8: the main session reads the reproducer of every unfixed, fixed or lead finding and checks that it runs the project's code; item 9 (report-only) reads each commit message against its diff; Step 5 forbids calling a confirmed-unfixed finding a real break and asks for "claimed severity".

### Added

- A Claude Code plugin route: `.claude-plugin/marketplace.json` at the repository root and `nh-chaos-monkey/.claude-plugin/plugin.json`, so the skill installs with `/plugin install nh-chaos-monkey --marketplace sairam0424/nh-skills`. The plugin is the skill folder and nothing else. The plugin's `version` equals `package.json`, a test enforces it, and a new copy reaches plugin users only when the next release bumps it.
- `docs/safety.md` (trusted-input boundary, containment, blast radius, Rule of Two per setup, controls against OWASP's code-execution threat, stop conditions, verdicts, limitations), `docs/troubleshooting.md` with an FAQ, and `docs/tester-guide.md`.
- A tester report issue form, `.github/ISSUE_TEMPLATE/tester_report.yml`.
- README sections for Update, Uninstall, "Verify what you downloaded" and Compatibility, and this changelog.

## [0.2.1] - 2026-11-23

### Changed

- **Behaviour change.** A non-interactive run now stops on any git config line that can run code, including the `filter.lfs.*` lines git-lfs sets in a global git config and the `core.hooksPath` husky sets. Those setups need an interactive session until a later version.
- `SKILL.md`: a git config listing before any `git status` (any listed line is a stop), a worktree command with hooks and fsmonitor switched off and a slug rule, and an npm install from a scrubbed environment with stop rules for an `.npmrc` expansion, a symlinked `.npmrc`, an unexpected registry, a `git` or `script-shell` setting, and an absolute `--git`.
- Loop script: a wider default protected set (CI, manifests, lockfiles, test layouts and runner or coverage config of the common ecosystems); a wider judge screen (length limit, control and invisible characters, an inverted or hidden exit status, process substitution, `eval` and shell `-c` forms); the judge command in one labelled block per prompt; judge and reproducer output tails cleaned before they reach the session, with `untrustedFields` naming the agent-written fields.

### Fixed

- The probe opens 15 credential locations instead of 9. Only a refusal counts as blocked; any other error is undecided and makes the verdict incomplete. A directory or a named pipe at a credential path is skipped, and a named pipe no longer makes the probe hang.

### Added

- 34 tests, none of the existing ones changed; 307 pass.

## [0.2.0] - 2026-11-23

### Changed

- **Behaviour change.** The sandbox probe now runs before any project code. Step 2 used to install dependencies and run the judge first; it now creates the worktree and the git-state snapshot, runs the probe, and only then installs and runs the judge. A verdict other than enforced stops the run and names what it created.
- If the sandbox blocks the network the install cannot run: an interactive session lets you install yourself or open the network for that one step, and a non-interactive run stops and prints the install command. The package manager's cache and logs go under the scratch directory.
- A stricter probe: it flags environment names that contain a credential word and no longer flags configuration such as `AWS_REGION`. Inside Claude Code's built-in sandbox it ignores that sandbox's own proxy password variable, under three conditions, and says so.

### Added

- `references/safety-runner.md`: the tested Claude Code sandbox setup, how the session was started and what the probe reports.
- Community files: a contributing guide, a code of conduct, a bug report form and a pull request template.

## [0.1.0] - 2026-11-20

### Added

- First public release, with one skill, `nh-chaos-monkey`: a loop in a git worktree on a `chaos/*` branch with breaker agents per lens, a confirmer that runs every reproducer twice, a separate fixer that adds a regression test, a fresh verifier and an independent re-run of the judge after each round that made commits.
- A fault-injection lens that must show evidence the fault fired, a sandbox probe with a `requireSandbox` gate, a non-interactive contract for `claude -p`, caps that default low, and a validator and test harness (264 passing results in CI).

[Unreleased]: https://github.com/sairam0424/nh-skills/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/sairam0424/nh-skills/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/sairam0424/nh-skills/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sairam0424/nh-skills/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sairam0424/nh-skills/releases/tag/v0.1.0
