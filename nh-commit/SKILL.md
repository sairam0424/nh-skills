---
name: nh-commit
description: "Enforces strict git commit message formatting - conventional-commit subject line (type(scope): description), one atomic logical change per commit, a body that explains why not just what, and a hard block on secrets/.env/build artifacts. Use when writing a commit message, reviewing a diff before committing, splitting a change into multiple commits, or checking whether an existing commit message meets the standard."
---

# nh-commit

Git commit messages are documentation that outlives the diff. This skill enforces one exact format, no variations, no exceptions the user hasn't explicitly granted.

## The Subject Line

Format, exactly:

```
<type>(<scope>): <description>
```

- `type` — one of the allowed types below, lowercase, no exceptions.
- `scope` — the module, package, or area touched. Lowercase, short, no spaces (use `-` if needed). Omit only if the change is truly repo-wide (rare — prefer naming a scope).
- `description` — imperative mood ("add", not "added" or "adds"), no trailing period, under ~72 characters total for the subject line.

## Allowed Types

| Type | Meaning |
|------|---------|
| `feat` | A new user-facing capability that didn't exist before |
| `fix` | A bug fix — corrects behavior that was wrong |
| `refactor` | Restructures code without changing external behavior |
| `docs` | Documentation only — no code changes |
| `test` | Adds or changes tests only, no production code changes |
| `chore` | Maintenance work with no production code impact (deps, tooling, config) |
| `perf` | A change whose primary purpose is measurable performance improvement |
| `ci` | Changes to CI pipeline configuration (GitHub Actions, etc.) |
| `build` | Changes to the build system or external dependencies |
| `revert` | Reverts a previous commit |

Do not invent a type outside this list. If a change doesn't fit cleanly, pick the type that describes its *primary* effect, not every side effect.

## Atomicity Rule

One commit = one logical change. Non-negotiable.

- If a diff mixes a bug fix with an unrelated refactor, that is two commits, not one.
- If a diff touches multiple files but they all serve one logical change (e.g. a feature plus its tests), that is one commit.
- Reviewing a large diff before committing: propose a split into ordered atomic commits rather than one large commit, unless the user explicitly asks for a single commit.
- A commit should be revertable on its own without dragging in unrelated changes.

## Body: WHY, Not WHAT

The subject line says what changed. The body says why.

- Never restate the diff in prose ("changed X to Y" is not a body — the diff already shows that).
- Explain the reasoning: what problem existed, what constraint drove this approach, what alternative was rejected and why.
- Leave the body empty only when the subject line is genuinely self-explanatory (e.g. `chore(deps): bump lodash to 4.17.21`) — do not pad a body just to have one.
- Wrap body lines at ~72 characters. Separate subject from body with one blank line.

## Never Commit Secrets

Before every commit, check the staged diff for:

- API keys, tokens, passwords, connection strings, private keys
- `.env`, `.env.local`, `.env.*` files (these should be gitignored, not committed even once)
- Build artifacts (`dist/`, `build/`, `node_modules/`, compiled binaries) unless the repo's convention explicitly commits build output

If a secret is found staged: stop, unstage it, and tell the user — do not commit around it or "just this once." If a secret was already committed in history, flag it as compromised and requiring rotation; a later commit that deletes the file does not undo the exposure.

## Co-Authored-By Trailer

Do not add a `Co-Authored-By` trailer to a commit unless the project has explicitly opted in via its own config (e.g. an `attribution.commit` setting). A tool or agent that helped write the commit is a facilitator, not a co-author, under git/GitHub's own semantics for that trailer. If unsure whether a project has opted in, leave the trailer out — omission is the safe default, not the risky one.

## Good Examples

```
feat(auth): add OAuth2 login flow

Password-only login was blocking the SSO rollout for the two
enterprise customers already on the waitlist. OAuth2 was chosen
over SAML because both target IdPs (Google, Okta) support it
natively and it avoids pulling in a SAML library for a first pass.
```

```
fix(api): handle null response from payment gateway

The gateway returns HTTP 200 with a null body on rate-limit
backoff instead of a 429, which was crashing the charge handler
with a TypeError. Treat null body as a retryable failure instead
of a success.
```

## Bad Example

```
fix: stuff
```

What's wrong:
- No scope — unclear what area this touches.
- "stuff" is not a description — conveys nothing about the change.
- No body — a fix commit with no explanation of what was broken or why the fix is correct gives future readers (including the next agent) nothing to work from.
- If this commit actually bundles a fix plus a drive-by refactor, it also violates atomicity.

## Pre-Submission Checklist

- [ ] Subject line matches `<type>(<scope>): <description>` exactly
- [ ] Type is one of: feat, fix, refactor, docs, test, chore, perf, ci, build, revert
- [ ] Description is imperative mood, no trailing period, subject under ~72 chars
- [ ] This commit represents exactly one logical change
- [ ] Body explains why (not a restatement of the diff), or is justifiably empty
- [ ] Staged diff contains no secrets, `.env` files, or build artifacts
- [ ] No `Co-Authored-By` trailer unless the project has explicitly opted in
