# Contributing

nh-skills is one person's collection, so contributions are welcome but reviewed on a best-effort basis (see [SUPPORT.md](SUPPORT.md)). The most useful things you can do:

- **Run `nh-chaos-monkey` on your own code and report what happened**, good or bad, with the [bug report form](https://github.com/sairam0424/nh-skills/issues/new/choose). The README is only verified for its author so far.
- **Report unclear or wrong documentation.** A sentence that overclaims is a bug here.
- **Send small, focused fixes.** One logical change per pull request.

Anything that looks like a security problem (a tampered skill, a way around the sandbox probe or the protected-file checks, a prompt-injection path) goes through [SECURITY.md](SECURITY.md), not a public issue.

## Before you open a pull request

```bash
npm ci
npm run validate   # lints every SKILL.md
npm test           # validator tests plus the nh-chaos-monkey harness
```

Both must pass. CI repeats them and also runs a secret scan and CodeQL.

- **Branches:** `type/scope-slug`, for example `fix/skills-chaos-monkey-probe-order`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org). Pull requests are squash-merged, so the PR title must itself be a valid Conventional Commit.
- **Never commit** secrets, `.env` files or generated output.

## Changing a skill

- A new skill is a focused task with a `description` that says *when to use it*. The folder name must equal the `name:` in its frontmatter. Push long detail into `references/`.
- A skill that runs shell commands or touches the network needs an independent security review before it merges: a reviewer who did not write it reads its instructions and bundled scripts the way a hostile reader would, and the result is recorded (see how `nh-chaos-monkey/references/loop-design.md` and `nh-chaos-monkey/learning.md` do it).
- A change to the instructions of an existing skill should come with evidence that it helps: run the same task through the old and the new wording and record the result in that skill's `learning.md`. A typo or a broken link does not need this.
- Do not add a framework, a bundler or a manifest file. This repository deliberately has one small validator and nothing else (see [decisions.md](decisions.md)).

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE). Please follow the [code of conduct](CODE_OF_CONDUCT.md).
