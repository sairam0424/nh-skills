import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanGitEnv } from "./support/git-env.mjs";

// The shared git state snapshot is the only thing that notices a loop agent planting a hook or a config
// setting in the git directory a linked worktree shares with the user's checkout. These tests run the
// command exactly as the judge protocol documents it, so the docs and the tests cannot drift apart.
const PROTOCOL = fileURLToPath(new URL("../nh-chaos-monkey/references/judge-protocol.md", import.meta.url));
// Secret-looking names and values are assembled at run time so no literal sits in this file.
const part = (...pieces) => pieces.join("");
const CREDENTIAL = part("tok", "en", "123", "abc");
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function documentedSnapshotCommand() {
  const blocks = [...fs.readFileSync(PROTOCOL, "utf8").matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
  const found = blocks.filter((b) => b.includes("snapshot() {"));
  assert.equal(found.length, 1, "the judge protocol must contain exactly one snapshot command");
  return found[0];
}

function makeRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nh-snap-")));
  t.after(() => {
    spawnSync("chmod", ["-R", "u+rwx", root]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const git = (cwd, ...args) =>
    execFileSync("git", ["-C", cwd, "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-c", "core.hooksPath=/dev/null", ...args], {
      stdio: "pipe",
      encoding: "utf8",
      env: cleanGitEnv(),
    });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "remote", "add", "origin", "https://example.invalid/x.git");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  return { root, repo, git, common: path.join(repo, ".git") };
}

function runSnapshot(repo, { env = {}, bash = "bash", cwd } = {}) {
  return spawnSync(bash, ["-c", documentedSnapshotCommand() + "\nsnapshot"], {
    env: cleanGitEnv(repo === undefined ? env : { REPO: repo, ...env }),
    encoding: "utf8",
    cwd,
  });
}

function snapshot(repo) {
  const done = runSnapshot(repo);
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

// ---------- findings of the independent security review ----------
test("a hooks directory swapped for a symlink is noticed, with the target shown", (t) => {
  const world = makeRepo(t);
  simulateLoop(world);
  const before = snapshot(world.repo);
  const elsewhere = path.join(world.root, "elsewhere-hooks");
  fs.mkdirSync(elsewhere);
  fs.rmSync(path.join(world.common, "hooks"), { recursive: true });
  fs.symlinkSync(elsewhere, path.join(world.common, "hooks"));
  const after = snapshot(world.repo);
  assert.notEqual(after, before);
  assert.match(after, new RegExp("symlink .*/hooks -> " + escapeRe(elsewhere)));
});

test("a dangling hook symlink is noticed and not silently skipped", (t) => {
  const world = makeRepo(t);
  const before = snapshot(world.repo);
  fs.symlinkSync("/nonexistent/target", path.join(world.common, "hooks", "pre-push"));
  const out = snapshot(world.repo);
  assert.notEqual(out, before);
  assert.match(out, /symlink .*pre-push -> \/nonexistent\/target/);
});

test("an unreadable hook is reported as unreadable, not dropped", { skip: process.getuid && process.getuid() === 0 ? "root can read everything" : false }, (t) => {
  const world = makeRepo(t);
  const hook = path.join(world.common, "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\n");
  fs.chmodSync(hook, 0o000);
  assert.match(runSnapshot(world.repo).stdout, /unreadable .*pre-commit/);
});

test("a config.worktree symlink is reported, never followed", (t) => {
  const world = makeRepo(t);
  const decoy = path.join(world.root, "decoy.ini");
  const decoyValue = ["DECOY", "VALUE", "7731"].join("-");
  fs.writeFileSync(decoy, part("aws_", "sec", "ret") + " = " + decoyValue + "\n");
  fs.symlinkSync(decoy, path.join(world.common, "config.worktree"));
  const out = snapshot(world.repo);
  assert.ok(!out.includes(decoyValue), "the symlink target's content must not be printed");
  assert.match(out, /symlink .*config\.worktree -> .*decoy\.ini/);
});

test("a linked worktree's own config.worktree is covered", (t) => {
  const world = makeRepo(t);
  world.git(world.repo, "config", "extensions.worktreeConfig", "true");
  const loop = simulateLoop(world);
  const before = snapshot(world.repo);
  fs.writeFileSync(path.join(world.common, "worktrees", path.basename(loop.wt), "config.worktree"), "[core]\n\tfsmonitor = planted\n");
  assert.notEqual(snapshot(world.repo), before);
});

const SENSITIVE = {
  "an extra header": [part("http.extra", "header"), "Authorization: " + part("Bear", "er ") + CREDENTIAL],
  "an inline credential helper": [part("credential.", "helper"), "!f() { echo " + part("pass", "word") + "=" + CREDENTIAL + "; }; f"],
  "a password key": [part("sendemail.smtp", "pass"), CREDENTIAL],
  "a token key": [part("github.", "tok", "en"), CREDENTIAL],
};
for (const [name, [key, value]] of Object.entries(SENSITIVE)) {
  test("the value of " + name + " is hidden but a change to it is still noticed", (t) => {
    const world = makeRepo(t);
    world.git(world.repo, "config", "--local", key, value);
    const first = snapshot(world.repo);
    assert.ok(!first.includes(CREDENTIAL), key + " leaked into the snapshot");
    assert.match(first, new RegExp(escapeRe(key) + "=sha256:[0-9a-f]{12}"));
    world.git(world.repo, "config", "--local", key, value + "-changed");
    assert.notEqual(snapshot(world.repo), first);
  });
}

test("two credentials on one config line are both masked", (t) => {
  const world = makeRepo(t);
  const second = CREDENTIAL + "2";
  world.git(world.repo, "config", "--local", "url.https://a:" + CREDENTIAL + "@h1.invalid/.insteadOf", "https://b:" + second + "@h2.invalid/");
  const out = snapshot(world.repo);
  assert.ok(!out.includes(CREDENTIAL) && !out.includes(second));
});

test("an ordinary config line is shown as it is", (t) => {
  const world = makeRepo(t);
  assert.match(snapshot(world.repo), /^remote\.origin\.url=https:\/\/example\.invalid\/x\.git$/m);
});

test("the snapshot fails loudly instead of looking like an empty success", (t) => {
  const world = makeRepo(t);
  // run from inside a repository: an unset REPO must not quietly snapshot whatever repository the shell is in
  const unset = runSnapshot(undefined, { cwd: world.repo });
  assert.notEqual(unset.status, 0, "REPO unset");
  assert.match(unset.stderr, /set REPO to the primary checkout/);
  const empty = runSnapshot("", { cwd: world.repo });
  assert.notEqual(empty.status, 0, "REPO empty");
  assert.notEqual(runSnapshot(path.join(world.root, "not-a-repo")).status, 0, "not a repository");
  // a PATH with the tools the command needs, except shasum
  const bin = path.join(world.root, "bin");
  fs.mkdirSync(bin);
  for (const tool of ["git", "find", "sed", "grep", "ls", "tr", "cut", "cat", "readlink", "bash"]) {
    const found = execFileSync("sh", ["-c", "command -v " + tool], { encoding: "utf8" }).trim();
    fs.symlinkSync(found, path.join(bin, tool));
  }
  const done = runSnapshot(world.repo, { env: { PATH: bin }, bash: path.join(bin, "bash") });
  assert.notEqual(done.status, 0, "shasum missing");
  assert.match(done.stderr, /shasum is missing/);
});

test("the git environment helper drops every inherited GIT_ variable", () => {
  const names = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];
  for (const key of names) process.env[key] = "/definitely/not/this/" + key;
  try {
    const env = cleanGitEnv({ REPO: "/x" });
    for (const key of names) assert.equal(env[key], undefined, key);
    assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
    assert.equal(env.REPO, "/x");
  } finally {
    for (const key of names) delete process.env[key];
  }
});
