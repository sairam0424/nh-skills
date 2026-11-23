import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tryCreate } from "../nh-chaos-monkey/scripts/sandbox-probe.mjs";
import { cleanGitEnv, minimalGitEnv } from "./support/git-env.mjs";

const PROBE = fileURLToPath(new URL("../nh-chaos-monkey/scripts/sandbox-probe.mjs", import.meta.url));
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const canSandbox = process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC);
const NEEDS_SEATBELT = canSandbox ? false : "needs macOS /usr/bin/sandbox-exec (Seatbelt); not available on this platform";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const NEEDS_PERMISSIONS =
  process.platform === "win32" || isRoot ? "needs POSIX file permissions and a non-root user, which are not available here" : false;

// The probe looks for secret-looking variable names. Build one at run time so no literal sits in this file.
const SECRET_NAME = ["MY", "API", "TOKEN"].join("_");
const SECRET_VALUE = "v".repeat(24);

// A throwaway repository with a linked worktree and a fake home that holds fake credential files.
function makeWorld(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nh-probe-")));
  const repo = path.join(root, "repo");
  const wt = path.join(root, "wt");
  const scratch = path.join(root, "scratch");
  const home = path.join(root, "home");
  fs.mkdirSync(repo);
  fs.mkdirSync(scratch);
  fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
  fs.writeFileSync(path.join(home, ".ssh", "id_rsa"), "not a real key\n");
  fs.writeFileSync(path.join(home, ".npmrc"), "not a real token line\n");
  const git = (...args) =>
    execFileSync("git", ["-C", repo, "-c", "user.email=t@example.invalid", "-c", "user.name=t", ...args], {
      stdio: "ignore",
      env: cleanGitEnv(),
    });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  git("worktree", "add", "-q", "-b", "chaos/probe", wt);
  const world = { root, repo, wt, scratch, home };
  // Put every permission back before removing, so a locked world never leaks into the temp directory.
  t.after(() => {
    spawnSync("chmod", ["-R", "u+rwx", root]);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return world;
}

const listing = (dir) => fs.readdirSync(dir, { recursive: true }).sort();

function runProbe(world, { sandboxProfile, net: target, env = {} } = {}) {
  const args = [PROBE, "--workdir", world.wt, "--scratch", world.scratch, "--net", target, "--json"];
  const childEnv = minimalGitEnv({ HOME: world.home, ...env });
  const [cmd, argv] = sandboxProfile
    ? [SANDBOX_EXEC, ["-p", sandboxProfile, process.execPath, ...args]]
    : [process.execPath, args];
  const done = spawnSync(cmd, argv, { env: childEnv, encoding: "utf8" });
  return { status: done.status, report: done.stdout ? JSON.parse(done.stdout) : null, stderr: done.stderr };
}

// A local listener gives the network probe something real to reach.
function withListener(run) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.listen(0, "127.0.0.1", async () => {
      try {
        resolve(await run("127.0.0.1:" + server.address().port));
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

const PROFILE = (w, extraWrite = "") => `(version 1)
(deny default)
(allow process-exec*) (allow process-fork) (allow sysctl-read) (allow mach-lookup) (allow ipc-posix-shm*)
(allow file-read*)
(deny file-read* (subpath "${w.home}/.ssh") (literal "${w.home}/.npmrc"))
(allow file-write* (subpath "${w.wt}") (subpath "${w.scratch}") ${extraWrite} (literal "/dev/null"))
(deny network*)`;

const byName = (report) => Object.fromEntries(report.probes.map((p) => [p.name, p.result]));

test("without a sandbox the probe reports not-enforced, names what was allowed and exits 1", async (t) => {
  const world = makeWorld(t);
  const before = listing(world.root);
  const { status, report } = await withListener((target) => runProbe(world, { net: target, env: { [SECRET_NAME]: SECRET_VALUE } }));
  assert.equal(status, 1);
  assert.equal(report.verdict, "not-enforced");
  assert.deepEqual(byName(report), {
    "write-home": "allowed",
    "write-outside-workdir": "allowed",
    "symlink-escape": "allowed",
    "read-credentials": "allowed",
    "git-hooks-write": "allowed",
    "git-config-write": "allowed",
    "env-secrets": "allowed",
    "network-egress": "allowed",
  });
  assert.equal(report.allowed.length, 8);
  assert.deepEqual(report.unresolved, []);
  assert.deepEqual(listing(world.root), before, "the probe must remove everything it created");
});

test("the credential probe also opens the npm, kube, docker and gcloud locations", async (t) => {
  const world = makeWorld(t);
  const { report } = await withListener((target) => runProbe(world, { net: target }));
  assert.match(report.probes.find((p) => p.name === "read-credentials").detail, /\.npmrc/);
});

test("the probe never prints the value of a secret-looking variable", async (t) => {
  const world = makeWorld(t);
  const { report } = await withListener((target) => runProbe(world, { net: target, env: { [SECRET_NAME]: SECRET_VALUE } }));
  const detail = report.probes.find((p) => p.name === "env-secrets").detail;
  assert.ok(detail.includes(SECRET_NAME));
  assert.ok(!JSON.stringify(report).includes(SECRET_VALUE));
});

test("a clean environment with no secret-looking names passes that probe", async (t) => {
  const world = makeWorld(t);
  const { report } = await withListener((target) => runProbe(world, { net: target }));
  assert.equal(byName(report)["env-secrets"], "blocked");
});

// Configuration a Bedrock-backed Claude Code session needs is not a credential. Names are assembled at run time.
const CONFIG_NAMES = [
  ["AWS", "REGION"],
  ["AWS", "DEFAULT", "REGION"],
  ["AWS", "PROFILE"],
  ["ANTHROPIC", "DEFAULT", "SONNET", "MODEL"],
  ["ANTHROPIC", "DEFAULT", "OPUS", "MODEL", "DESCRIPTION"],
  ["CLAUDE", "CODE", "USE", "BEDROCK"],
  ["GITHUB", "REPOSITORY"],
  ["GH", "HOST"],
  ["OPENAI", "BASE", "URL"],
].map((parts) => parts.join("_"));

// Names that carry a credential, whatever provider prefix they have.
const CREDENTIAL_NAMES = [
  ["AWS", "ACCESS", "KEY", "ID"],
  ["AWS", "SECRET", "ACCESS", "KEY"],
  ["AWS", "SESSION", "TOKEN"],
  ["ANTHROPIC", "API", "KEY"],
  ["ANTHROPIC", "AUTH", "TOKEN"],
  ["OPENAI", "API", "KEY"],
  ["GH", "TOKEN"],
  ["GITHUB", "TOKEN"],
  ["CLOUDSDK", "PROXY", "PASSWORD"],
].map((parts) => parts.join("_"));

test("configuration names a Bedrock session needs are not reported as secret-looking", async (t) => {
  const world = makeWorld(t);
  const env = Object.fromEntries(CONFIG_NAMES.map((n) => [n, "config-value"]));
  const { report } = await withListener((target) => runProbe(world, { net: target, env }));
  const probe = report.probes.find((p) => p.name === "env-secrets");
  assert.equal(probe.result, "blocked", probe.detail);
});

test("names that carry a credential stay reported, with their names and never their values", async (t) => {
  const world = makeWorld(t);
  const env = Object.fromEntries(CREDENTIAL_NAMES.map((n) => [n, SECRET_VALUE]));
  const { report } = await withListener((target) => runProbe(world, { net: target, env }));
  const probe = report.probes.find((p) => p.name === "env-secrets");
  assert.equal(probe.result, "allowed");
  for (const name of CREDENTIAL_NAMES) assert.ok(probe.detail.includes(name), name + " should be listed");
  assert.ok(!JSON.stringify(report).includes(SECRET_VALUE));
});

// Claude Code's built-in sandbox injects the login for its own loopback proxy into every sandboxed shell.
// That login only reaches the proxy the sandbox already bounds, so the probe must not count it as a leaked secret.
const PROXY_USER = ["CLOUDSDK", "PROXY", "USERNAME"].join("_");
const PROXY_PASS = ["CLOUDSDK", "PROXY", "PASSWORD"].join("_");
const proxyEnv = (extra = {}) => ({
  SANDBOX_RUNTIME: "1",
  CLOUDSDK_PROXY_ADDRESS: "127.0.0.1",
  [PROXY_USER]: "u".repeat(20),
  [PROXY_PASS]: SECRET_VALUE,
  ...extra,
});
const envProbe = async (t, env) => {
  const world = makeWorld(t);
  const { report } = await withListener((target) => runProbe(world, { net: target, env }));
  return { probe: report.probes.find((p) => p.name === "env-secrets"), report };
};

test("the sandbox runtime's own loopback proxy login is not counted as a leaked secret, and the probe says it ignored it", async (t) => {
  const { probe, report } = await envProbe(t, proxyEnv());
  assert.equal(probe.result, "blocked", probe.detail);
  assert.ok(probe.detail.includes(PROXY_PASS) && probe.detail.includes("ignored"), probe.detail);
  assert.ok(!JSON.stringify(report).includes(SECRET_VALUE));
});

test("the same proxy variables are flagged outside the sandbox runtime", async (t) => {
  const { SANDBOX_RUNTIME, ...withoutRuntime } = proxyEnv();
  const { probe } = await envProbe(t, withoutRuntime);
  assert.equal(probe.result, "allowed");
  assert.ok(probe.detail.includes(PROXY_PASS));
});

test("a proxy that is not on loopback is flagged even inside the sandbox runtime", async (t) => {
  const { probe } = await envProbe(t, proxyEnv({ CLOUDSDK_PROXY_ADDRESS: "203.0.113.7" }));
  assert.equal(probe.result, "allowed");
  assert.ok(probe.detail.includes(PROXY_PASS));
});

test("a real credential next to the sandbox's proxy login is still flagged, and the proxy login is still reported as ignored", async (t) => {
  const { probe, report } = await envProbe(t, proxyEnv({ [CREDENTIAL_NAMES[7]]: SECRET_VALUE }));
  assert.equal(probe.result, "allowed");
  assert.ok(probe.detail.includes(CREDENTIAL_NAMES[7]), probe.detail);
  assert.ok(probe.detail.includes("ignored"), probe.detail);
  assert.ok(!JSON.stringify(report).includes(SECRET_VALUE));
});

test("a refused connection counts as a reachable network, not as a block", async (t) => {
  const world = makeWorld(t);
  const closed = await new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve("127.0.0.1:" + port));
    });
  });
  const { report } = runProbe(world, { net: closed });
  assert.equal(byName(report)["network-egress"], "allowed");
});

test("usage errors exit 2 and print usage", (t) => {
  const world = makeWorld(t);
  for (const args of [[], ["--workdir", "rel", "--scratch", world.scratch], ["--workdir", world.wt], ["--bogus"]]) {
    const done = spawnSync(process.execPath, [PROBE, ...args], { encoding: "utf8" });
    assert.equal(done.status, 2, JSON.stringify(args));
    assert.match(done.stderr, /usage: sandbox-probe/);
  }
});

test("a worktree that is not a git checkout leaves the git probes unresolved: the verdict is incomplete, not enforced", async (t) => {
  const world = makeWorld(t);
  fs.rmSync(path.join(world.wt, ".git"));
  const { status, report } = await withListener((target) => runProbe(world, { net: target }));
  assert.equal(byName(report)["git-hooks-write"], "unknown");
  assert.equal(byName(report)["git-config-write"], "unknown");
  assert.deepEqual(report.unresolved, ["git-hooks-write", "git-config-write"]);
  assert.equal(report.verdict, "not-enforced", "the allowed probes of this unsandboxed world still decide first");
  assert.equal(status, 1);
});

test("a creation that succeeds but cannot be removed is reported as allowed, never as blocked", () => {
  const refusingUnlink = {
    writeFileSync() {},
    unlinkSync() {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    },
  };
  const result = tryCreate("write-home", "/h/.x", refusingUnlink);
  assert.equal(result.result, "allowed");
  assert.match(result.detail, /could not remove it \(EPERM\); remove it by hand/);
  const refusingCreate = {
    writeFileSync() {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    },
  };
  assert.equal(tryCreate("write-home", "/h/.x", refusingCreate).result, "blocked");
  const odd = {
    writeFileSync() {
      throw Object.assign(new Error("gone"), { code: "ENOENT" });
    },
  };
  assert.equal(tryCreate("write-home", "/h/.x", odd).result, "unknown");
});

// A world locked with ordinary file permissions needs no sandbox, so this runs on every platform CI uses.
function lockWorld(world, { withWorktreeConfig = false } = {}) {
  const common = path.join(world.repo, ".git");
  if (withWorktreeConfig) fs.writeFileSync(path.join(common, "config.worktree"), "");
  for (const file of [path.join(world.home, ".ssh", "id_rsa"), path.join(world.home, ".npmrc")]) fs.chmodSync(file, 0o000);
  fs.chmodSync(path.join(world.home, ".ssh"), 0o555);
  fs.chmodSync(world.home, 0o555);
  fs.chmodSync(path.join(common, "hooks"), 0o555);
  fs.chmodSync(path.join(common, "config"), 0o444);
  if (withWorktreeConfig) fs.chmodSync(path.join(common, "config.worktree"), 0o444);
  fs.chmodSync(world.root, 0o555);
}

test("a world locked with file permissions yields enforced and exit 0, with no sandbox involved", { skip: NEEDS_PERMISSIONS }, async (t) => {
  const world = makeWorld(t);
  lockWorld(world);
  const { status, report } = runProbe(world, { net: "nonexistent.invalid:443" });
  assert.equal(status, 0, JSON.stringify(report));
  assert.equal(report.verdict, "enforced");
  assert.deepEqual(report.allowed, []);
  assert.deepEqual(report.unresolved, []);
  for (const name of ["write-home", "write-outside-workdir", "symlink-escape", "read-credentials", "git-hooks-write", "git-config-write", "network-egress"])
    assert.equal(byName(report)[name], "blocked", name);
});

test("when nothing is allowed but a probe could not be evaluated the verdict is incomplete and the exit is 1", { skip: NEEDS_PERMISSIONS }, async (t) => {
  const world = makeWorld(t);
  fs.rmSync(path.join(world.wt, ".git"));
  lockWorld(world);
  const { status, report } = runProbe(world, { net: "nonexistent.invalid:443" });
  assert.equal(report.verdict, "incomplete", JSON.stringify(report));
  assert.deepEqual(report.allowed, []);
  assert.deepEqual(report.unresolved, ["git-hooks-write", "git-config-write"]);
  assert.equal(status, 1);
});

test("an existing worktree config file is probed, and a writable one is caught", { skip: NEEDS_PERMISSIONS }, async (t) => {
  const locked = makeWorld(t);
  lockWorld(locked, { withWorktreeConfig: true });
  const a = runProbe(locked, { net: "nonexistent.invalid:443" });
  assert.equal(byName(a.report)["git-worktree-config-write"], "blocked");
  assert.equal(a.status, 0);

  const open = makeWorld(t);
  fs.writeFileSync(path.join(open.repo, ".git", "config.worktree"), "");
  const b = runProbe(open, { net: "nonexistent.invalid:443" });
  assert.equal(byName(b.report)["git-worktree-config-write"], "allowed");
});

test("under a real Seatbelt sandbox that denies writes, credentials and network, every probe is blocked", { skip: NEEDS_SEATBELT }, async (t) => {
  const world = makeWorld(t);
  const { status, report, stderr } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: PROFILE(world) }));
  assert.equal(stderr, "");
  assert.equal(status, 0, JSON.stringify(report));
  assert.equal(report.verdict, "enforced");
  assert.deepEqual(report.allowed, []);
  assert.deepEqual(report.unresolved, []);
  const results = byName(report);
  for (const name of ["write-home", "write-outside-workdir", "symlink-escape", "read-credentials", "git-hooks-write", "git-config-write", "network-egress"])
    assert.equal(results[name], "blocked", name);
});

test("under Seatbelt, a profile that opens the shared git directory is caught", { skip: NEEDS_SEATBELT }, async (t) => {
  const world = makeWorld(t);
  const loose = PROFILE(world, `(subpath "${world.repo}/.git")`);
  const { status, report } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: loose }));
  assert.equal(status, 1);
  assert.deepEqual(report.allowed, ["git-hooks-write", "git-config-write"]);
});

test("under Seatbelt, a profile that leaves the network open is caught", { skip: NEEDS_SEATBELT }, async (t) => {
  const world = makeWorld(t);
  const open = PROFILE(world).replace("(deny network*)", "(allow network*)");
  const { status, report } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: open }));
  assert.equal(status, 1);
  assert.deepEqual(report.allowed, ["network-egress"]);
});

test("under Seatbelt, a profile that allows creating but not removing is caught as allowed", { skip: NEEDS_SEATBELT }, async (t) => {
  const world = makeWorld(t);
  const noUnlink = `(version 1)
(deny default)
(allow process-exec*) (allow process-fork) (allow sysctl-read) (allow mach-lookup) (allow ipc-posix-shm*)
(allow file-read*)
(allow file-write* (subpath "${world.wt}") (subpath "${world.scratch}") (literal "/dev/null"))
(allow file-write-create (subpath "${world.home}"))
(deny network*)`;
  const { report } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: noUnlink }));
  const home = report.probes.find((p) => p.name === "write-home");
  assert.equal(home.result, "allowed", JSON.stringify(home));
  assert.match(home.detail, /could not remove it/);
});
