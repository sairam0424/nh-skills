# nh-skills

A personal, curated collection of [Claude Code Agent Skills](https://docs.claude.com/en/docs/claude-code/skills) — self-contained `SKILL.md` files that teach Claude Code how to perform a specific task well. It is one of three sibling projects under the [Not-Humans-Lab](../Not-Humans-Lab/) umbrella (alongside the planned `nh-deck` and `daily-dose`), and it is this author's own take on the pattern popularized by [arpitbbhayani/ape-skills](https://github.com/arpitbbhayani/ape-skills). Skills here are Markdown + YAML frontmatter with no build step and no packaging tool required to use them; a skill may bundle optional scripts (`nh-breaker` ships one Claude Code Workflow script, which runs only inside that tool). The only tooling in this repo is a small validator that lints skill structure in CI.

## Installing a skill

Pick any skill folder and install it one of two ways:

**Via the community `skills` CLI** (see [bunx skills](https://skills.sh) / [`npx skills`](https://www.npmjs.com/package/skills)):

```bash
npx skills add https://github.com/sairam0424/nh-skills/tree/main/<skill-name>
```

**Manually**, by copying the folder into your Claude Code skills directory:

```bash
cp -r <skill-name> ~/.claude/skills/
```

Either approach works because a skill is just a directory containing a `SKILL.md` (plus optional `scripts/`, `references/`, or `assets/` subfolders) — there is no manifest file to keep in sync.

## How a skill gets triggered

Once installed, a skill activates in one of two ways:

- **Natural language** — Claude reads the `description` field in the skill's frontmatter and decides on its own when the request matches, no explicit invocation needed.
- **Explicit slash-style tag** — you can also invoke it directly by name, e.g. `/nh-commit`, if you want to force it rather than rely on automatic matching.

## Adding a new skill

1. Create a new top-level folder named exactly like the skill (this name is also used in the `name:` frontmatter field — the two must match).
2. Add a `SKILL.md` inside it with valid YAML frontmatter (`name`, `description`, and any other required fields).
3. Run the validator locally before opening a PR:

   ```bash
   npm install
   npm run validate
   ```

4. Open a PR. CI re-runs the same validator (plus its own self-tests) on every PR that touches a `SKILL.md` file, so anything that fails locally will fail in CI too.

This is a personal collection rather than a large open-source project, so there's no separate `CONTRIBUTING.md` — the steps above are the whole process. Keep each skill focused on one task, keep the `description` clear about *when* to use it, and push any lengthy detail into a referenced file instead of inlining it in `SKILL.md` (progressive disclosure).

## Available skills

| Skill | Description |
|---|---|
| `nh-commit` | Strict git commit message formatting |
| `nh-breaker` | Bounded breaker loop: adversarial agents try to break code you own, each break needs a failing reproducer, and fixes are checked by agents against your test command in a throwaway worktree; final proof is a manual re-run, and a sandbox is advised |

## License

Apache-2.0.
