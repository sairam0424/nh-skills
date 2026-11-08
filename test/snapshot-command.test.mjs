import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The shared git state snapshot is the only thing that notices a loop agent planting a hook or a config
// setting in the git directory a linked worktree shares with the user's checkout. These tests run the
// command exactly as the judge protocol documents it, so the docs and the tests cannot drift apart.
const PROTOCOL = fileURLToPath(new URL("../nh-chaos-monkey/references/judge-protocol.md", import.meta.url));
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const CREDENTIAL = ["tok", "en", "123", "abc"].join("");

function documentedSnapshotCommand() {
  const blocks = [...fs.readFileSync(PROTOCOL, "utf8").matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const found = blocks.filter((b) => b.includes("snapshot() {"));
  assert.equal(found.length, 1, "the judge protocol must contain exactly one snapshot command");
  return found[0];
}

function makeRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nh-snap-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (cwd, ...args) =>
    execFileSync("git", ["-C", cwd, "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-c", "core.hooksPath=/dev/null", ...args], {
      stdio: "pipe",
      encoding: "utf8",
      env: { ...process.env, ...GIT_ENV },
    });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "remote", "add", "origin", "https://example.invalid/x.git");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  return { root, repo, git, common: path.join(repo, ".git") };
}

function snapshot(repo) {
  const done = spawnSync("bash", ["-c", documentedSnapshotCommand() + "\nsnapshot"], {
    env: { ...process.env, ...GIT_ENV, REPO: repo },
    encoding: "utf8",
  });
  assert.equal(done.status, 0, done.stderr);
  return done.stdout;
}

// What the loop does in the shared git directory in an ordinary run: a branch, a commit, a stash pinned
// under a ref, and a short-lived detached worktree for the verifier.
function simulateLoop(world) {
  const wt = path.join(world.root, "wt");
  world.git(world.repo, "worktree", "add", "-q", "-b", "chaos/run", wt);
  return {
    wt,
    work() {
      fs.writeFileSync(path.join(wt, "fix.js"), "export const x = 1;\n");
      world.git(wt, "add", "fix.js");
      world.git(wt, "commit", "-q", "-m", "fix");
      fs.writeFileSync(path.join(wt, "rejected.js"), "export const y = 2;\n");
      world.git(wt, "stash", "push", "--include-untracked", "-q", "-m", "nh-chaos-monkey rejected run R1-1 attempt 1");
      world.git(wt, "update-ref", "refs/chaos/rejected/run/R1-1-a1", "refs/stash");
      const arm = path.join(world.root, "arm");
      world.git(world.repo, "worktree", "add", "-q", "--detach", arm, "HEAD");
      world.git(world.repo, "worktree", "remove", "--force", arm);
    },
  };
}

test("the documented snapshot is unchanged by everything an ordinary loop run does", (t) => {
  const world = makeRepo(t);
  const loop = simulateLoop(world);
  const before = snapshot(world.repo);
  loop.work();
  assert.equal(snapshot(world.repo), before);
});

test("creating the loop's worktree changes only the worktree listing, never the config blocks", (t) => {
  const world = makeRepo(t);
  const beforeWorktree = snapshot(world.repo);
  simulateLoop(world);
  const afterWorktree = snapshot(world.repo);
  const added = afterWorktree.split("\n").filter((line) => !beforeWorktree.split("\n").includes(line));
  assert.deepEqual(added, ["wt"], "only the linked worktree's own entry may appear");
  const gone = beforeWorktree.split("\n").filter((line) => line && !afterWorktree.split("\n").includes(line));
  assert.deepEqual(gone, [], "no line of the earlier snapshot may disappear");
});

const TAMPER = {
  "a planted hook": (w) => {
    fs.writeFileSync(path.join(w.common, "hooks", "pre-commit"), "#!/bin/sh\necho planted\n");
  },
  "a hook symlink": (w) => fs.symlinkSync("/usr/bin/true", path.join(w.common, "hooks", "post-checkout")),
  "a local config setting": (w) => w.git(w.repo, "config", "--local", "core.fsmonitor", "planted"),
  "a worktree config setting": (w) => {
    fs.writeFileSync(path.join(w.common, "config.worktree"), "[core]\n\tfsmonitor = planted\n");
  },
  "an info/attributes change": (w) => {
    fs.mkdirSync(path.join(w.common, "info"), { recursive: true });
    fs.writeFileSync(path.join(w.common, "info", "attributes"), "* filter=planted\n");
  },
  "an info/exclude change": (w) => {
    fs.mkdirSync(path.join(w.common, "info"), { recursive: true });
    fs.appendFileSync(path.join(w.common, "info", "exclude"), "planted\n");
  },
  "a new branch outside chaos/": (w) => w.git(w.repo, "branch", "other"),
  "a new tag": (w) => w.git(w.repo, "tag", "planted"),
  "a second linked worktree left behind": (w) => w.git(w.repo, "worktree", "add", "-q", "--detach", path.join(w.root, "left-behind"), "HEAD"),
  "a changed remote": (w) => w.git(w.repo, "remote", "set-url", "origin", "https://example.invalid/other.git"),
};

for (const [name, tamper] of Object.entries(TAMPER)) {
  test("the documented snapshot notices " + name, (t) => {
    const world = makeRepo(t);
    // the worktree-config extension is on from the start, as after a sparse-checkout init
    world.git(world.repo, "config", "extensions.worktreeConfig", "true");
    simulateLoop(world);
    const before = snapshot(world.repo);
    tamper(world);
    assert.notEqual(snapshot(world.repo), before);
  });
}

test("credentials in a remote URL are masked in the snapshot", (t) => {
  const world = makeRepo(t);
  world.git(world.repo, "remote", "set-url", "origin", "https://someone:" + CREDENTIAL + "@example.invalid/x.git");
  const out = snapshot(world.repo);
  assert.ok(!out.includes(CREDENTIAL), "the credential must not appear in the snapshot");
  assert.match(out, /https:\/\/\*\*\*@example\.invalid\/x\.git/);
});

test("a credential in the worktree config file is masked too", (t) => {
  const world = makeRepo(t);
  fs.writeFileSync(path.join(world.common, "config.worktree"), '[remote "z"]\n\turl = https://someone:' + CREDENTIAL + "@example.invalid/z.git\n");
  assert.ok(!snapshot(world.repo).includes(CREDENTIAL));
});
