# Security Policy

nh-skills is a personal, curated collection of Claude Code Agent Skills
(`SKILL.md` files plus optional `scripts/`, `references/`, and `assets/`
alongside each). Because skill bodies are natural-language instructions that
an agent will read and act on, and because skills can bundle executable
scripts, the primary risk surface here is **supply chain integrity of the
skill artifacts themselves** — not a running service, database, or API.
That shapes this document: Supply Chain / Dependency Policy comes first,
ahead of the sections GitHub's template puts first.

## Supported Versions

nh-skills has one living line of development: the `main` branch. Releases
are tags of the form `vMAJOR.MINOR.PATCH` cut from `main`. Only the latest
release and `main` receive fixes. There are no LTS branches and no backport
policy. While the version starts with `0.`, a fix may change a skill's
arguments or behaviour, and the release notes say so.

| Version              | Supported          |
| --------------------- | ------------------- |
| Latest release (`v0.1.x`) | Yes             |
| `main` (latest commit) | Yes                 |
| Older releases / forks | No — upgrade to the latest release |

## Supply Chain & Dependency Policy (Primary)

This is the section that matters most for a skills repo, because the thing
being distributed is instructions an agent will execute, plus any bundled
scripts it may run.

### Integrity manifests (under consideration, not shipped)

**Status: not implemented in 0.1.x, and not committed to.** The project's
other documents defer any manifest until the catalogue reaches roughly 30 to
40 skills or outside contributors appear. Until then, each release attaches
an archive of the skill folder together with its SHA-256, so you can check
what you downloaded. The design under consideration:

- Every published skill directory (`<skill-name>/`) would get a
  content-addressed **SHA-256 integrity manifest** covering `SKILL.md` and
  every file under `scripts/`, `references/`, and `assets/` for that skill.
- The manifest would be generated at publish time (not authored by hand) and
  committed alongside the skill it describes.
- A consumer of a skill (a human running `cp -r` into `~/.claude/skills/`,
  or a tool like `npx skills add`) could re-hash the files they received and
  diff against the manifest to detect tampering introduced after publish —
  in transit, by a mirror, or by a compromised fork.
- The validator (`scripts/validate-skills.mjs`) could grow a
  `--verify-manifest` mode once manifests exist, so drift is caught in CI,
  not just by end users.

Until this ships, integrity rests on normal git history (commit signatures
are **not** currently required — see Known Security Considerations), on the
SHA-256 published with each release, and on the structural/schema checks the
validator performs on every PR that touches a `SKILL.md`.

### Provenance chain (planned)

nh-skills is expected to grow promotion stages as it matures (author →
reviewed → published, roughly mirroring staged rollout in the author's other
projects). The planned provenance concept:

- Each skill's manifest will record which commit/PR promoted it through
  each stage, so "what changed between the version I copied six months ago
  and the version on `main` today" is answerable from git history plus the
  manifest, not from memory.
- A skill that has never passed the lint gate in `scripts/validate-skills.mjs`
  cannot be considered "published". The GitHub Actions job that runs it on a
  PR touching a `SKILL.md` is the check today. It is path-filtered, and
  squash-only merging is a convention that repository settings do not
  enforce, so this is a review aid, not a hard gate.
- No skill in this repo currently claims a formal provenance stage beyond
  "merged to `main`" and "released." Treat everything here as unaudited
  beyond the validator, the test suite, and the independent AI reviews
  recorded in `nh-chaos-monkey/references/loop-design.md` and
  `nh-chaos-monkey/learning.md`. None of those is a human audit.

### Dependency pinning

- The repository has exactly one dependency: `js-yaml`, a devDependency
  used only by `scripts/validate-skills.mjs`. It is not shipped as part of
  any skill artifact.
- Skills themselves (`SKILL.md` + optional `scripts/`, `references/`,
  `assets/`) carry no package dependencies by design. A skill may still need
  tools on your machine: `nh-chaos-monkey` bundles two scripts,
  `chaos-loop.js` (it runs inside Claude Code's Workflow tool) and
  `sandbox-probe.mjs` (plain Node, built-in modules only), and needs Node,
  git and Claude Code itself. Dependency-free is the property this repo
  tries to preserve.
- If a skill's own `scripts/` directory ever needs a dependency, it must be
  declared explicitly inside that skill's own scope, reviewed for necessity,
  and never installed globally as a side effect of adding the skill.
- Dependabot (or equivalent) alerts against `package.json` are triaged like
  any other repo, but a dependency alert against the validator tooling is
  lower severity than a compromised skill body, because the validator never
  ships to end users — skill bodies do.

### Takedown / unpublish / notification process

If a skill in this repo is reported (or discovered) to be malicious,
tampered, or unsafe to run:

1. **Contain**: the skill's directory is reverted or removed from `main` in
   a dedicated commit — no other changes bundled in — so the takedown is
   trivially auditable.
2. **Notify**: publish a security advisory and a note on the affected
   release with a plain description of what was wrong and what changed, and
   tell the reporter and anyone known to have installed the skill (via an
   issue, discussion, or direct report) directly. GitHub offers no way to
   notify stargazers or forks, so the advisory and release notes are the
   public record. If the skill was ever tagged as "published" under the
   future provenance scheme, that status is revoked in the same commit.
3. **Root cause**: a short postmortem note is added to `status.md` or
   `decisions.md` (whichever is live at the time) recording what happened
   and what check — existing or new — should have caught it.
4. **Re-entry bar**: a takedown skill can only return to `main` after it
   passes the full validator gate again *and* an independent review of the
   fix, even if the original defect is fixed. This is a single-maintainer
   project, so that reviewer may be an outside person or an AI reviewer, not
   a second maintainer.

There is no automated kill-switch for already-copied skills (this is a
Markdown-file distribution model, not a package registry with a revoke
API) — takedown here means "stop distributing the bad version and tell
people," not "reach into their `~/.claude/skills/`."

### Prompt-injection risk in skill bodies

A `SKILL.md` is not just documentation — it is text an agent may read and
act on. That makes a specific pattern reportable as a security issue, not
just a bug:

> **Any skill whose body instructs or encourages an agent to fetch and act
> on untrusted external content** (arbitrary URLs, unpinned "latest" script
> downloads, content from a source the skill author does not control) **must
> be flagged during review.** This includes skills that fetch remote text
> and then execute or blindly trust it as instructions, and skills that
> silently expand their own effective permissions by pulling in remote
> config.

This is treated as a supply-chain concern, not just a quality concern,
because it is the most realistic way a skill in this repo could be turned
into an attack vector against whoever installs it.

## Reporting a Vulnerability

Please report suspected vulnerabilities — including a malicious, tampered,
or prompt-injection-risky skill — **privately**, not as a public GitHub
issue.

- **Preferred channel**: GitHub's private vulnerability reporting, via the
  "Report a vulnerability" button under this repo's **Security** tab
  (Security → Advisories → "Report a vulnerability"). This opens a private
  advisory visible only to the maintainer and you.
- **Fallback channel**: open a GitHub issue titled only `Security contact
  needed` with no technical details, and the maintainer will follow up to
  establish a private channel.

Do not include exploit details, working payloads, or the full contents of
a malicious skill body in a public issue, PR, or discussion.

### What to include in a report

- Which skill(s) are affected (directory name / path).
- What the concern is: tampering, prompt-injection risk, a broken/insecure
  bundled script, a dependency issue, or something else.
- Steps to reproduce, or the specific lines/behavior that concern you.
- Whether you believe this is already exploited in the wild (e.g., you
  found a copy of this skill elsewhere behaving badly).

## Disclosure Policy & Timeline

This is a personal, best-effort project — the timeline below is a target,
not a contractual SLA (see `SUPPORT.md` for the general support posture).

| Stage                          | Target timing              |
| ------------------------------- | --------------------------- |
| Acknowledge report              | Within 5 business days      |
| Initial triage / severity call  | Within 10 business days     |
| Fix or mitigation merged        | Best effort, no fixed SLA — prioritized over other work |
| Public disclosure               | After a fix is merged, or 90 days from report, whichever is sooner, unless the reporter agrees to a longer embargo |

Credit is given to reporters in the fix commit/PR description unless the
reporter asks to remain anonymous.

## Scope

**In scope:**

- Any `SKILL.md` in this repository and its bundled `scripts/`,
  `references/`, or `assets/`.
- `scripts/validate-skills.mjs` and its fixture-based self-tests.
- The GitHub Actions workflows in `.github/` (the validate and secret-scan
  jobs).
- Repository metadata that affects trust (LICENSE, this file, `SUPPORT.md`,
  `decisions.md`).

**Out of scope:**

- The third-party installer tooling (`npx skills add`) and its own
  security posture — report issues with it upstream, not here.
- Claude Code / the Agent Skills runtime itself — report to Anthropic.
- The author's other projects (`nh-deck`, `daily-dose` and others) — they
  are separate repositories; report issues there.
- Damage caused by running a skill on code you do not own, or without the
  sandbox its documentation asks for. `nh-chaos-monkey` executes project
  code by design; a hostile repository reaching your machine because you
  ran it unsandboxed is a documented risk, not a vulnerability in this
  repository. A way to bypass the controls it does claim (the worktree and
  branch checks, the protected-file hashes, the probe) is in scope.

## Known Security Considerations

- **No commit signing is currently enforced.** Anyone with write access to
  `main` can merge an unsigned commit. This is acceptable for a
  single-maintainer personal project today, but is called out here as a
  known gap rather than left implicit.
- **No sandboxing of bundled scripts.** A skill's `scripts/` files are
  reviewed by eye and by AI reviewers during PR review. The repository's
  tests (`npm test`) exercise `nh-chaos-monkey`'s loop script and sandbox
  probe, but nothing sandboxes them when you run the skill, and the CI lint
  job only validates `SKILL.md` frontmatter and structure, not the semantics
  of bundled scripts. Run `nh-chaos-monkey` inside the sandbox described in
  the root `README.md` and in `nh-chaos-monkey/references/safety-runner.md`.
- **Distribution is copy-based, not registry-based.** There is no revoke
  API once someone has `cp -r`'d a skill onto their machine — see the
  Takedown section above.
- **The validator is a lint gate, not a security scanner.** It hard-fails
  on structural/schema problems (frontmatter shape, name/description rules,
  duplicate names, dead file references) and soft-warns on style issues.
  It does **not** currently detect malicious instructions, prompt-injection
  patterns, or unsafe script behavior — that is still a human-review
  responsibility per the prompt-injection guidance above.

## Secrets Handling

- No skill in this repo should ever require or embed an API key, token,
  password, or connection string. If a skill needs a credential to
  function, that credential must be sourced from the *consumer's*
  environment at run time — never committed, never hardcoded in `SKILL.md`
  or in `scripts/`.
- If a secret is ever accidentally committed to this repository, treat it
  as compromised immediately: rotate it at the source, then scrub it from
  git history (not just delete it in a new commit).
- CI for this repo does not require any secrets to run the validator; if a
  future workflow needs one (e.g., a publish step), it will be scoped to
  the minimum permission needed and documented here before it is added.

## Contact

Use GitHub private vulnerability reporting (see above) as the primary
channel. For anything that is not a vulnerability report, see
`SUPPORT.md`.
