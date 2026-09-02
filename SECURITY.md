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

nh-skills does not follow semver release branches. There is one living
line of development: the `main` branch. The latest commit on `main` is the
only supported version. There are no LTS branches and no backport policy.

| Version              | Supported          |
| --------------------- | ------------------- |
| `main` (latest commit) | Yes                 |
| Anything older / forked | No — pull latest `main` |

## Supply Chain & Dependency Policy (Primary)

This is the section that matters most for a skills repo, because the thing
being distributed is instructions an agent will execute, plus any bundled
scripts it may run.

### Integrity manifests (planned, not yet shipped)

**Status: planned for a future phase. Not implemented in Phase 2 (walking
skeleton).** The intended design:

- Every published skill directory (`<skill-name>/`) will get a
  content-addressed **SHA-256 integrity manifest** covering `SKILL.md` and
  every file under `scripts/`, `references/`, and `assets/` for that skill.
- The manifest will be generated at publish time (not authored by hand) and
  committed alongside the skill it describes.
- A consumer of a skill (a human running `cp -r` into `~/.claude/skills/`,
  or a tool like `npx skills add`) will be able to re-hash the files they
  received and diff against the manifest to detect tampering introduced
  after publish — in transit, by a mirror, or by a compromised fork.
- The validator (`scripts/validate-skills.mjs`) is expected to grow a
  `--verify-manifest` mode once manifests exist, so drift is caught in CI,
  not just by end users.

Until this ships, integrity is enforced only by normal git history (commit
signatures are **not** currently required — see Known Security
Considerations) and by the structural/schema checks the validator already
performs on every PR touching `**/SKILL.md`.

### Provenance chain (planned)

nh-skills is expected to grow promotion stages as it matures (author →
reviewed → published, roughly mirroring how the sibling
`Not-Humans-Lab` projects think about staged rollout — see
`../Not-Humans-Lab/` for cross-cutting system docs). The planned provenance
concept:

- Each skill's manifest will record which commit/PR promoted it through
  each stage, so "what changed between the version I copied six months ago
  and the version on `main` today" is answerable from git history plus the
  manifest, not from memory.
- A skill that has never passed the lint gate in `scripts/validate-skills.mjs`
  cannot be considered "published" — the GitHub Actions job on every PR
  touching `**/SKILL.md` is the enforcement point today, and will remain the
  gate once manifests exist.
- No skill in this repo currently claims a formal provenance stage beyond
  "merged to `main`." Treat everything here as unaudited beyond the
  automated lint checks until this section is updated to say otherwise.

### Dependency pinning

- The repository has exactly one intentional runtime dependency:
  `js-yaml`, used by `scripts/validate-skills.mjs`. It is a devDependency,
  not shipped as part of any skill artifact.
- Skill artifacts themselves (`SKILL.md` + optional `scripts/`,
  `references/`, `assets/`) are pure Markdown/YAML/static assets with **zero
  runtime dependencies** by design — this is the entire point of the Agent
  Skills format and the property this repo exists to preserve.
- If a skill's own `scripts/` directory ever needs a dependency, it must be
  declared explicitly inside that skill's own scope, reviewed for necessity
  (see `../Not-Humans-Lab/` for the workspace's general dependency-hygiene
  posture), and never installed globally as a side effect of adding the
  skill.
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
2. **Notify**: anyone who starred, forked, or is known to have installed
   the skill (via an issue, discussion, or direct report) is notified with
   a plain description of what was wrong and what changed. If the skill was
   ever tagged as "published" under the future provenance scheme, that
   status is revoked in the same commit.
3. **Root cause**: a short postmortem note is added to `status.md` or
   `decisions.md` (whichever is live at the time) recording what happened
   and what check — existing or new — should have caught it.
4. **Re-entry bar**: a takedown skill can only return to `main` after it
   passes the full validator gate again *and* an explicit second human
   review, even if the original defect is fixed.

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
- The GitHub Actions lint workflow that gates PRs touching `**/SKILL.md`.
- Repository metadata that affects trust (LICENSE, this file, `SUPPORT.md`,
  `decisions.md`).

**Out of scope:**

- The third-party installer tooling (`npx skills add`) and its own
  security posture — report issues with it upstream, not here.
- Claude Code / the Agent Skills runtime itself — report to Anthropic.
- The sibling planned projects `nh-deck` and `daily-dose` — they do not
  exist yet and have no code to audit.
- `../Not-Humans-Lab/` — a separate, docs-only meta-repo; report issues
  with its content there, not here.

## Known Security Considerations

- **No commit signing is currently enforced.** Anyone with write access to
  `main` can merge an unsigned commit. This is acceptable for a
  single-maintainer personal project today, but is called out here as a
  known gap rather than left implicit.
- **No sandboxing of bundled scripts.** A skill's `scripts/` files are
  plain files reviewed by eye during PR review; there is no automated
  sandbox execution or static analysis of arbitrary script behavior beyond
  what the CI lint job checks (which only validates `SKILL.md` frontmatter
  and structure, not the semantics of bundled scripts).
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
