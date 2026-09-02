# Tech Stack — nh-skills

Fast-lookup inventory of every technology choice in this repo, why it was
made, and how to keep it current. This file describes **nh-skills only**; it
does not restate or duplicate the umbrella-level tech.md that lives at
`../Not-Humans-Lab/` — see "Inherited constraints" below for the one item
that flows down from there.

## Stack summary

| Layer | Technology | Role |
|---|---|---|
| Skill artifacts | Markdown + YAML frontmatter | The actual content being versioned — every `SKILL.md` |
| Validator runtime | Node.js (LTS 20/22+) | Runs `scripts/validate-skills.mjs` |
| Validator dependency | `js-yaml` | Parses YAML frontmatter for schema checks |
| Validator test harness | `node:test` (built-in) | Fixture-based self-tests for the validator |
| CI | GitHub Actions | One job, runs on every PR touching `**/SKILL.md` |
| Packaging/distribution | None (directory layout only) | Third-party installers (`npx skills add`, manual `cp -r`) work off `<skill-name>/SKILL.md` + optional `scripts/`, `references/`, `assets/` — no manifest file needed |
| License | Apache-2.0 | Decided at the Not-Humans-Lab umbrella level, applied identically across sibling projects |

## Adoption status

| Technology | Status | Notes |
|---|---|---|
| Markdown + YAML frontmatter | **Adopt** | No version pin needed — this is a content format, not a dependency |
| Node.js LTS 20/22+ | **Adopt** | Only needed to *run* the validator locally/in CI — not a runtime dependency of the skills themselves. Skills stay zero-runtime. |
| js-yaml | **Adopt** | The single devDependency. Chosen because it's the de facto standard, dependency-light YAML parser for Node and matches the "dependency-light" constraint. |
| node:test | **Adopt** | Built into Node — zero install cost, sufficient for fixture-based validator tests |
| Jest / Vitest / pytest | **Hold** | Explicitly rejected — no dedicated test framework. The validator script is its own test suite. |
| Bundler (esbuild/webpack/rollup/etc.) | **Hold** | No build step exists or is needed; the validator runs directly as an `.mjs` script |
| Manifest file (e.g. `skills.json`) | **Hold** | Not needed — directory structure alone (`<skill-name>/SKILL.md`) is sufficient for both `npx skills add` and manual `cp -r` installs |
| Packaging/distribution tooling | **Hold** | Correct directory layout is the entire distribution mechanism; no additional tooling is in scope |

## Rationale (non-obvious choices)

- **Zero runtime for skill artifacts.** The entire point of the Agent Skills
  format (per the reference project, `arpitbbhayani/ape-skills`) is that a
  skill is just Markdown + YAML frontmatter — no code executes to define or
  load a skill. Preserving this is a hard constraint, not a preference.
- **Exactly one lightweight layer added on top.** `scripts/validate-skills.mjs`
  is the only piece of tooling this repo introduces beyond the skill content
  itself. It exists solely to lint frontmatter schema and structural
  conventions — it is not part of what ships to consumers of the skills.
- **`js-yaml` as the only devDependency.** Rather than hand-rolling a YAML
  parser or pulling in a heavier config-management library, one narrow,
  well-maintained dependency does the one job (parsing frontmatter) the
  validator needs.
- **No manifest file.** Both installation paths that matter — the
  third-party `npx skills add` installer and a manual `cp -r` into
  `~/.claude/skills/` — resolve purely from directory structure
  (`<skill-name>/SKILL.md`). Adding a manifest would be duplicate
  bookkeeping with no consumer.
- **`node:test` instead of a test framework.** The validator is small and
  its own correctness is verified with fixture directories
  (`fixtures/valid-skill/`, `fixtures/invalid-skill/`) run through Node's
  built-in test runner — no external test framework justifies its
  additional dependency weight for a single script.

## Version & upgrade policy

- **Node.js**: track current LTS (20.x or 22.x at time of writing). Bump the
  CI workflow's `node-version` and any `engines` field together; no need to
  pin an exact patch version.
- **js-yaml**: track latest stable minor/patch via normal dependency update
  flow (Dependabot or manual `npm update`); no special pinning policy beyond
  standard semver caution on majors.
- **Markdown + YAML frontmatter format itself**: no version to track — it is
  the Agent Skills convention, not a library. If the convention itself
  changes upstream, that's a deliberate project decision, not a routine
  upgrade.

## Constraints

- Skill artifacts (`SKILL.md` files) must remain runnable with zero
  dependencies — no code execution required to define or load a skill.
- The validator must stay "dependency-light": one devDependency (`js-yaml`)
  is the ceiling, not a floor to build up from.
- No packaging/manifest layer may be introduced solely for distribution —
  directory layout is the distribution mechanism.

## Deprecated / Hold list

- Jest, Vitest, pytest, or any other dedicated test framework — **Hold**,
  superseded by `node:test`.
- Any bundler — **Hold**, no build step exists.
- Any manifest/index file for skill discovery — **Hold**, directory
  structure suffices.

## Local dev requirements

- Node.js LTS 20 or 22+ installed.
- `npm install` at the repo root to pull in `js-yaml`.
- `npm run validate` (wraps `node scripts/validate-skills.mjs`) to lint all
  `SKILL.md` files locally before opening a PR.
- No database, no external service, no network access needed to develop or
  validate skills.

## Inherited constraints (from the Not-Humans-Lab umbrella)

- **License: Apache-2.0.** Decided once at the system level and applied
  identically across all three sibling projects (`daily-dose`, `nh-deck`,
  `nh-skills`) for enterprise-clearable, patent-safe consistency. See the
  umbrella's own tech.md at `../Not-Humans-Lab/` for the system-wide
  rationale — not duplicated here.
