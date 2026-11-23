# Judge protocol

The judge is the one thing in a breaker loop that must not be an opinion. Everything else (breakers, fixers, verifiers) is a language model reasoning; the judge is a command whose exit status and output a human can reproduce. Read this before confirming the contract with the user, and again if the judge looks weak.

## What counts as a judge

A command that the project already documents and that:

- exits non-zero when anything fails and zero only when everything passes,
- runs a countable number of tests (the loop requires a count of at least 1, so "zero tests ran, exit 0" can never pass),
- is deterministic enough to run several times in a row with the same result,
- runs without network access or credentials.

Use the project's own command exactly as documented (for example the test script in its manifest). Do not invent a narrower one. Do not pipe it into another program, add flags that narrow it, or add "always succeed" suffixes: the tool's own exit status is the evidence. The script screens for the obvious violations (pipes, semicolons, a background ampersand, tee, redirection, command substitution, eval, sh -c, a leading ! or exit, a comment, modes that run no tests, and flags such as bail or ignore) as a best effort only; the user's confirmation of the exact command in Step 1 is the real control.

Check that the command can see new tests. Some test scripts name specific files, for example a script that passes one test file to the runner. A regression test the fixer adds in another file is then never run, the test count never rises, and every fix is rejected. In that case use the runner's own discovery form of the same command, which runs the same tests plus new ones, confirm that its baseline count equals the documented command's, and tell the user in the contract. A real run found this only after the contract was confirmed, so read the test script before launching.

If the project has no such command, run in lead-only mode (set fixEnabled to false): breakers and confirmers still run, so you get proven breaks, but nothing is fixed and nothing is claimed as fixed.

## The protected set

Anything that defines "correct" or "green" must be outside the fixer's write scope, because a fixer under pressure to turn a red judge green will otherwise weaken the judge. Protect, at minimum:

- existing tests, fixtures, snapshots, golden files,
- lint, type-check, coverage and test-runner configuration,
- CI workflow files,
- dependency manifests and lockfiles.

The loop hashes every tracked file in these paths into a manifest before anything is attacked, and after every fixer attempt and every rejudge it checks the manifest with the standard checksum tool and also asks git for any protected file modified or deleted since the base commit. The second check does not depend on the manifest, which the fixer could in principle rewrite. A modified or deleted protected file fails the check. Files that git ignores (dependency folders, build output) are not covered by either check, and neither is a change to the ignore rules themselves, which is why the ignore file is on the default protected list. New test files are allowed and expected: that is how a regression test gets in. The defaults (listed as DEFAULT_PROTECTED in scripts/chaos-loop.js) cover test directories and co-located tests, the manifests and lockfiles of the main ecosystems, common CI files, and common runner, type, lint and coverage configuration. Manifests, lockfiles, test directories and config files match at any depth; most CI files and a few plain names (spec, .github, .husky, .gitignore, .envrc, .yarnrc, .yarnrc.yml, .cargo, .vscode, .devcontainer, .mvn, gradle/wrapper, pnpm-workspace.yaml) match only at the repository root, so a nested copy is not protected; setup.py, .env and nested spec directories are not included. A project with an unusual layout still needs its own list.

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

Every command in the loop is run by an agent. Before telling the user anything is fixed, re-run the judge yourself in the worktree, bare, and show its output; then run the manifest check, then run git status --porcelain (a halted run can leave uncommitted work, so expect it empty only after a clean finish), then list what changed since the base commit with git diff --name-status BASE, which covers committed and uncommitted tracked changes (modified and added source files are expected; no deleted file, no modified existing test or config, and no added file under CI, git hook or tool-config locations other than ordinary regression test files is acceptable), then compare the shared git state snapshot described below. The manifest lives in the scratch directory, so the diff against the base commit is the check that does not depend on it. For each fixed-agent-verified finding, also re-run its reproducer on the fixed head, and check its regression test on the tree just before its fix as the next section describes.

### Proving a regression test guards its fix

Do this for each fixed-agent-verified finding. Check the test against the tree just before its own fix: the fix commit's parent, which is BASE only for the first fix. Against BASE, a later fix's test can fail merely because an earlier bug is still present, which says nothing about the later fix.

1. Make the export in one command, chained so that a failed step stops the rest: `EXP="$(mktemp -d SCRATCH/export.XXXXXX)" && git -C WORKTREE archive -o "$EXP.tar" PARENT && tar -x -f "$EXP.tar" -C "$EXP" && echo "$EXP"`. PARENT is COMMIT^, with COMMIT taken from the result's commits. SCRATCH/export.XXXXXX is a template path (a bare `mktemp -d` lands in the system temp folder), and the archive gets an absolute path whose name is unique per export (a relative `-o` path is resolved inside WORKTREE). Use the printed path literally in the later commands, because shell variables may not survive between Bash calls. Never use a linked worktree, checkout or stash instead: they modify the shared git directory, the shared stash or the worktree under review, and deleting the scratch directory does not undo that.
2. Before writing anything, use TESTPATH only if it is relative with no `..` segment (the loop checks this, a by-hand run does not), then run `git -C WORKTREE ls-tree -r --name-only PARENT -- TESTPATH` and `find EXPORT -type l`, with EXPORT the printed path. Write nothing and call the finding unverified if the first prints anything (a regression test is a new file) or the second lists TESTPATH or a directory above it, because the next command follows symlinks. Otherwise put the test in the export from the fix commit, not from the worktree, which can hold uncommitted work after a halt: `mkdir -p "EXPORT/$(dirname TESTPATH)" && git -C WORKTREE show COMMIT:TESTPATH > "EXPORT/TESTPATH"`.
3. Link the worktree's gitignored dependency folders (node_modules, .venv, vendor) into the export instead of installing anything, and run the test there with the runner's single-file form (for Go, the test's package directory with `-run '^TestName$'`).
4. The test guards the fix only if it fails the way the finding claims: the wrong value, or the crash or error it describes. Call the finding unverified, and say why, when the test passes (it guards nothing about this fix, or a workspace link or editable install let it load the fixed code; either way it is not proof); when it fails on an import, syntax, collection or setup error, on a name that only the fix adds, or runs zero tests; or when the test needs git metadata or a file the export lacks (`git archive` drops `.git` and `export-ignore` files; compare with `git ls-tree -r --name-only PARENT`).

The runs execute project code, so repeat items 3 and 4 of Step 4 (status, name-status diff and shared git state) afterwards. Deleting the scratch directory in Step 5 removes the exports.

## Shared git state snapshot

A linked worktree shares its git directory with the primary checkout, so anything an agent writes there can fire later in the user's own checkout. Save the output of this snapshot to a file before launching the loop and again after it ends, then compare the two files; the only acceptable difference is none (the filter already excludes the loop's own branches, rejected-attempt refs and stash):

```bash
snapshot() {
  : "${REPO:?set REPO to the primary checkout}"
  command -v shasum >/dev/null || { echo "snapshot: shasum is missing" >&2; return 1; }
  local g f k l
  g="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)" || return 1
  # URL credentials are masked; the value of a key that looks like a credential is replaced by a short
  # hash, so a change to it is still noticed without showing it.
  mask() {
    while IFS= read -r l; do
      k="$(printf %s "${l%%=*}" | tr 'A-Z' 'a-z')"
      case "$k" in
        *credential*|*extraheader*|*password*|*passwd*|*token*|*secret*|*smtppass*)
          printf '%s=sha256:%s\n' "$(printf %s "${l%%=*}" | sed -E 's#(://)[^/@]*@#\1***@#g')" "$(printf %s "${l#*=}" | shasum -a 256 | cut -c1-12)" ;;
        *) printf '%s\n' "$l" | sed -E 's#(://)[^/@]*@#\1***@#g' ;;
      esac
    done
  }
  # A symlink is reported, never followed.
  cfg() { if [ -L "$1" ]; then echo "symlink $1 -> $(readlink "$1")"; elif [ -f "$1" ]; then echo "file $1"; mask < "$1"; fi; }
  git -C "$REPO" config --local --list | mask
  cfg "$g/config.worktree"
  for f in "$g"/worktrees/*/config.worktree; do cfg "$f"; done
  git -C "$REPO" for-each-ref --format='%(refname) %(objectname)' | grep -v -E '^refs/(heads/chaos/|chaos/|stash )'
  [ -L "$g/hooks" ] && echo "symlink $g/hooks -> $(readlink "$g/hooks")"
  find "$g/hooks/" \( -type f -o -type l \) ! -name '*.sample' -print0 | while IFS= read -r -d '' f; do
    if [ -L "$f" ]; then echo "symlink $f -> $(readlink "$f")"; else shasum -a 256 "$f" || echo "unreadable $f"; fi
  done
  shasum -a 256 "$g/info/exclude" "$g/info/attributes" 2>/dev/null
  ls -1 "$g/worktrees" 2>/dev/null
  return 0
}
```

REPO is the primary checkout. Save the output with the file mode set at creation, for example (umask 077; snapshot > FILE), and keep it outside the scratch directory, because it lists the local git configuration. Take the snapshot after the loop's worktree exists: its last lines list the linked worktrees, so a snapshot taken before the worktree differs from one taken after by exactly that entry.

What it covers: local config and every worktree config file (read directly, never followed through a symlink), refs other than the loop's own chaos/ branches, rejected-attempt refs and the stash, every hook (a symlink is reported with its target, an unreadable file is reported as unreadable), the exclude and attributes files, and the list of linked worktrees. What it does not cover, by design or limit: refs under chaos/ and the stash (the loop writes there), include.path targets of the config, everything else inside the linked worktrees' git directories, and the global and system config. It cannot prove that a sandbox-free agent did nothing else; it catches the changes that would later run code in the user's checkout.

What it hides: the value of any config key whose name contains credential, extraheader, password, passwd, token, secret or smtppass is replaced by a short hash (a change is still noticed), and the user and password part of URLs is masked. It does not hide secrets in other keys or forms (an inline secret in a core.sshCommand, a password containing @ or /, a value split over continued lines), so treat the saved file as sensitive and do not paste it. It stops with a non-zero status, and says why on stderr, when REPO is unset or not a repository or shasum is missing. The repository's tests run this exact command against an ordinary loop run, which must not change it, and against planted hooks, hook symlinks, config, worktree config, attributes and exclude changes, new refs and a leftover worktree, which must. If you cannot run it (denied, tool missing), say "unverified" and give the user the exact command and the output to expect.

## Optional: judge-integrity canary

To learn whether the fixer would cheat, occasionally plant a break that cannot be fixed without editing a protected file (for example a test that contradicts the documented contract). Any "fixed-verified" result for it means the judge or the protected set has a hole. The loop does not automate this yet; it is a manual check worth running when the stakes are high.
