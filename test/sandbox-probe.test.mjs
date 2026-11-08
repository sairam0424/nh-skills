import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROBE = fileURLToPath(new URL("../nh-chaos-monkey/scripts/sandbox-probe.mjs", import.meta.url));
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const canSandbox = process.platform === "darwin" && fs.existsSync(SANDBOX_EXEC);
const NEEDS_SEATBELT = canSandbox ? false : "needs macOS /usr/bin/sandbox-exec (Seatbelt); not available on this platform";

// The probe looks for secret-looking variable names. Build one at run time so no literal sits in this file.
const SECRET_NAME = ["MY", "API", "TOKEN"].join("_");
const SECRET_VALUE = "v".repeat(24);

// A throwaway repository with a linked worktree and a fake home that holds a fake credential file.
function makeWorld() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nh-probe-")));
  const repo = path.join(root, "repo");
  const wt = path.join(root, "wt");
  const scratch = path.join(root, "scratch");
  const home = path.join(root, "home");
  fs.mkdirSync(repo);
  fs.mkdirSync(scratch);
  fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
  fs.writeFileSync(path.join(home, ".ssh", "id_rsa"), "not a real key\n");
  const git = (...args) =>
    execFileSync("git", ["-C", repo, "-c", "user.email=t@example.invalid", "-c", "user.name=t", ...args], { stdio: "ignore" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  git("worktree", "add", "-q", "-b", "chaos/probe", wt);
  return { root, repo, wt, scratch, home };
}

const listing = (dir) => fs.readdirSync(dir, { recursive: true }).sort();

function runProbe(world, { sandboxProfile, net: target, env = {} } = {}) {
  const args = [PROBE, "--workdir", world.wt, "--scratch", world.scratch, "--net", target, "--json"];
  const childEnv = { PATH: process.env.PATH, HOME: world.home, ...env };
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
(deny file-read* (subpath "${w.home}/.ssh"))
(allow file-write* (subpath "${w.wt}") (subpath "${w.scratch}") ${extraWrite} (literal "/dev/null"))
(deny network*)`;

const byName = (report) => Object.fromEntries(report.probes.map((p) => [p.name, p.result]));

test("without a sandbox the probe reports not-enforced, names what was allowed and exits 1", async () => {
  const world = makeWorld();
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
  assert.deepEqual(listing(world.root), before, "the probe must remove everything it created");
});

test("the probe never prints the value of a secret-looking variable", async () => {
  const world = makeWorld();
  const { report } = await withListener((target) => runProbe(world, { net: target, env: { [SECRET_NAME]: SECRET_VALUE } }));
  const detail = report.probes.find((p) => p.name === "env-secrets").detail;
  assert.ok(detail.includes(SECRET_NAME));
  assert.ok(!JSON.stringify(report).includes(SECRET_VALUE));
});

test("a clean environment with no secret-looking names passes that probe", async () => {
  const world = makeWorld();
  const { report } = await withListener((target) => runProbe(world, { net: target }));
  assert.equal(byName(report)["env-secrets"], "blocked");
});

test("a refused connection counts as a reachable network, not as a block", async () => {
  const world = makeWorld();
  const closed = await new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve("127.0.0.1:" + port));
    });
  });
  const { report } = runProbe(world, { net: closed });
  assert.equal(byName(report)["network-egress"], "allowed");
});

test("usage errors exit 2 and print usage", () => {
  const world = makeWorld();
  for (const args of [[], ["--workdir", "rel", "--scratch", world.scratch], ["--workdir", world.wt], ["--bogus"]]) {
    const done = spawnSync(process.execPath, [PROBE, ...args], { encoding: "utf8" });
    assert.equal(done.status, 2, JSON.stringify(args));
    assert.match(done.stderr, /usage: sandbox-probe/);
  }
});

test("a worktree that is not a git checkout leaves the git probes unknown, not allowed", async () => {
  const world = makeWorld();
  fs.rmSync(path.join(world.wt, ".git"));
  const { report } = await withListener((target) => runProbe(world, { net: target }));
  assert.equal(byName(report)["git-hooks-write"], "unknown");
  assert.equal(byName(report)["git-config-write"], "unknown");
});

test("under a real Seatbelt sandbox that denies writes, credentials and network, every probe is blocked", { skip: NEEDS_SEATBELT }, async () => {
  const world = makeWorld();
  const { status, report, stderr } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: PROFILE(world) }));
  assert.equal(stderr, "");
  assert.equal(status, 0, JSON.stringify(report));
  assert.equal(report.verdict, "enforced");
  assert.deepEqual(report.allowed, []);
  const results = byName(report);
  for (const name of ["write-home", "write-outside-workdir", "symlink-escape", "read-credentials", "git-hooks-write", "git-config-write", "network-egress"])
    assert.equal(results[name], "blocked", name);
});

test("under Seatbelt, a profile that opens the shared git directory is caught", { skip: NEEDS_SEATBELT }, async () => {
  const world = makeWorld();
  const loose = PROFILE(world, `(subpath "${world.repo}/.git")`);
  const { status, report } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: loose }));
  assert.equal(status, 1);
  assert.deepEqual(report.allowed, ["git-hooks-write", "git-config-write"]);
});

test("under Seatbelt, a profile that leaves the network open is caught", { skip: NEEDS_SEATBELT }, async () => {
  const world = makeWorld();
  const open = PROFILE(world).replace("(deny network*)", "(allow network*)");
  const { status, report } = await withListener((target) => runProbe(world, { net: target, sandboxProfile: open }));
  assert.equal(status, 1);
  assert.deepEqual(report.allowed, ["network-egress"]);
});
