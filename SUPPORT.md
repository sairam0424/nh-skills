# Support

nh-skills is a personal, curated collection of Claude Code Agent Skills. It
is maintained by one person in spare time. Support here is **best effort,
with no SLA** — please calibrate expectations accordingly. If you need
guaranteed response times, this project is not the right dependency for
that.

## How to Get Help (in order)

1. **Read the docs first** — see Links below. Most "how do I install a
   skill" or "why did the validator fail" questions are answered there.
2. **Search existing issues** — someone may have already hit the same
   problem: use GitHub's issue search on this repo before opening a new
   one.
3. **Open a GitHub issue** — for bugs, validator false-positives/negatives,
   unclear docs, or feature requests. This is the primary channel. See
   "How to File a Good Bug Report" below.
4. **GitHub Discussions** (if enabled on this repo) — for open-ended
   questions, "is this the right way to structure a skill," or general
   feedback that isn't a concrete bug.
5. **Do not use security channels for support** — if your issue is a
   suspected vulnerability, malicious skill, or tampering concern, stop and
   go to `SECURITY.md` instead (see Security section below).

## Links to Docs

- Project overview and current state: `status.md` (this repo, root)
- Architecture and process decisions: `decisions.md` and `docs/adr/`
  (this repo, root)
- Cross-cutting, system-level docs shared across the sibling projects
  (`daily-dose`, `nh-deck`, `nh-skills`): `../Not-Humans-Lab/` — link by
  relative path; content there is not duplicated here.
- Skill authoring conventions and the validator's rules: read
  `scripts/validate-skills.mjs` directly, and any `README.md` at the repo
  root once one exists — the validator's hard-fail/soft-warn checks are the
  authoritative spec for what a valid `SKILL.md` looks like.

## Community Channels

This is a personal project, not a company product — there is no Slack,
Discord, or forum. The only community channel is this repository's GitHub
Issues (and Discussions, if enabled). If that changes, this section will
be updated.

## How to File a Good Bug Report

A good report lets the maintainer reproduce the problem without a
back-and-forth. Please include:

1. **What skill or file is affected** — the exact path, e.g.
   `nh-chaos-monkey/SKILL.md`.
2. **What you did** — the exact command or action (e.g. `node
   scripts/validate-skills.mjs`, or "installed via `npx skills add`").
3. **What you expected** vs. **what actually happened** — include the
   exact error output, not a paraphrase.
4. **Environment** — Node.js version (`node -v`), OS, and how you obtained
   the skill (cloned this repo, `npx skills add`, manual `cp -r`).
5. **Minimal repro** if possible — the smallest `SKILL.md` frontmatter or
   command that triggers the issue.

Bug reports that are just "it doesn't work" without the above will likely
get a follow-up question before any fix — including the details up front
saves a round trip.

## Response-Time Expectations

- **No guaranteed response time.** This project has no SLA.
- As a rough, non-binding guide: issues are typically triaged (labeled,
  acknowledged) within a couple of weeks, faster if the report is clear and
  actionable.
- Security reports follow the timeline in `SECURITY.md`, which is tighter
  than general support because of the private-disclosure process — use
  that channel, not a public issue, for anything security-related.
- Pull requests fixing an obvious bug with a clear description are
  generally reviewed faster than open-ended feature requests.

## Security Issues

If your question is actually a security concern — a skill that appears
tampered with, malicious, or that fetches and blindly acts on untrusted
external content — **do not file a public issue**. Follow the private
reporting process in `SECURITY.md` instead.
