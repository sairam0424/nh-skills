import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CREDENTIAL_PATHS, probeCredentialReads, runProbes } from "../nh-chaos-monkey/scripts/sandbox-probe.mjs";

const PROBE_URL = new URL("../nh-chaos-monkey/scripts/sandbox-probe.mjs", import.meta.url).href;
const SAFETY_RUNNER = fileURLToPath(new URL("../nh-chaos-monkey/references/safety-runner.md", import.meta.url));
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const NEEDS_PERMISSIONS =
  process.platform === "win32" || isRoot ? "needs POSIX file permissions and a non-root user, which are not available here" : false;
const NEEDS_SYMLINKS = process.platform === "win32" ? "needs POSIX symbolic links" : false;
const NEEDS_FIFO =
  process.platform === "win32" || spawnSync("mkfifo", ["--help"]).error ? "needs POSIX named pipes and the mkfifo tool" : false;

// A fake home that holds only what a test puts there. Permissions are restored before removal.
function fakeHome(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "nh-cred-")));
  t.after(() => {
    spawnSync("chmod", ["-R", "u+rwx", home]);
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

const put = (home, rel, body = "not a real credential\n") => {
  const file = path.join(home, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
};

// A file system that fails every open with one error code, to test the classification itself.
const failingFs = (code) => ({
  openSync() {
    throw Object.assign(new Error(code), { code });
  },
  closeSync() {},
  fstatSync() {
    return { isFile: () => true };
  },
});

// A file system with a different outcome per path ("ok" opens, anything else is the error code) that counts opens,
// closes and reads, so ordering, priority and the "never reads a byte" promise can be checked.
function perPathFs(outcomes) {
  const spy = { opens: 0, closes: 0, reads: 0 };
  return {
    spy,
    fs: {
      openSync(file) {
        for (const [rel, outcome] of Object.entries(outcomes)) {
          if (!file.endsWith("/" + rel)) continue;
          if (outcome === "ok") {
            spy.opens += 1;
            return 3;
          }
          throw Object.assign(new Error(outcome), { code: outcome });
        }
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
      closeSync() {
        spy.closes += 1;
      },
      fstatSync() {
        return { isFile: () => true };
      },
      readSync() {
        spy.reads += 1;
        throw new Error("the probe must never read a credential file");
      },
    },
  };
}

test("the credential list holds exactly the 15 locations the docs name", () => {
  assert.equal(CREDENTIAL_PATHS.length, 15);
});

test("the credential list holds the six added locations, has no duplicates and stays within 16", () => {
  for (const added of [
    ".git-credentials",
    ".azure/msal_token_cache.json",
    ".config/gcloud/application_default_credentials.json",
    ".pypirc",
    ".cargo/credentials.toml",
    ".terraform.d/credentials.tfrc.json",
  ])
    assert.ok(CREDENTIAL_PATHS.includes(added), added + " must be probed");
  assert.equal(new Set(CREDENTIAL_PATHS).size, CREDENTIAL_PATHS.length);
  assert.ok(CREDENTIAL_PATHS.length <= 16, "the list is capped at 16 locations");
});

test("every probed credential location is opened, and the detail names each one", (t) => {
  const home = fakeHome(t);
  for (const rel of CREDENTIAL_PATHS) put(home, rel);
  const v = probeCredentialReads(home);
  assert.equal(v.result, "allowed");
  for (const rel of CREDENTIAL_PATHS) assert.ok(v.detail.includes(rel), rel + " must be reported as openable");
});

test("a symlink loop is undecided, never counted as a refusal", { skip: NEEDS_SYMLINKS }, (t) => {
  const home = fakeHome(t);
  fs.symlinkSync(path.join(home, ".netrc"), path.join(home, ".netrc"));
  const v = probeCredentialReads(home);
  assert.equal(v.result, "unknown");
  assert.match(v.detail, /undecided/);
  assert.match(v.detail, /ELOOP/);
  assert.notEqual(v.absent, true, "an undecided result is not the tolerated 'nothing exists' case");
});

test("any error other than a refusal is undecided and names its code", () => {
  for (const code of ["EIO", "EMFILE", "ENFILE", "ESTALE", "ETIMEDOUT", "ENAMETOOLONG", "EBUSY"]) {
    const v = probeCredentialReads("/h", failingFs(code));
    assert.equal(v.result, "unknown", code);
    assert.ok(v.detail.includes(code), code + " must be named");
    assert.notEqual(v.absent, true, code);
  }
});

test("an error without a code is undecided and is named by its message", () => {
  const v = probeCredentialReads("/h", { ...failingFs("x"), openSync() { throw new Error("boom without a code"); } });
  assert.equal(v.result, "unknown");
  assert.match(v.detail, /boom without a code/);
});

test("EACCES and EPERM count as refused", () => {
  for (const code of ["EACCES", "EPERM"]) {
    const v = probeCredentialReads("/h", failingFs(code));
    assert.equal(v.result, "blocked", code);
    assert.match(v.detail, /refused/);
  }
});

test("a file with mode 000 is refused", { skip: NEEDS_PERMISSIONS }, (t) => {
  const home = fakeHome(t);
  fs.chmodSync(put(home, ".netrc"), 0o000);
  const v = probeCredentialReads(home);
  assert.equal(v.result, "blocked");
  assert.match(v.detail, /\.netrc/);
});

test("when outcomes are mixed, readable outranks undecided, undecided outranks refused, and nothing stops the scan early", () => {
  const refusedAndUndecided = perPathFs({ ".netrc": "EACCES", ".npmrc": "ELOOP" });
  const a = probeCredentialReads("/h", refusedAndUndecided.fs);
  assert.equal(a.result, "unknown", "one refusal must not hide an undecided path");
  assert.match(a.detail, /\.npmrc \(ELOOP\)/);

  const undecidedAndReadable = perPathFs({ ".netrc": "ELOOP", ".npmrc": "ok" });
  const b = probeCredentialReads("/h", undecidedAndReadable.fs);
  assert.equal(b.result, "allowed", "a readable credential file must not be hidden by an undecided one");
  assert.match(b.detail, /\.npmrc/);

  const undecidedFirstReadableLast = perPathFs({ ".ssh/id_rsa": "EIO", ".terraform.d/credentials.tfrc.json": "ok" });
  const c = probeCredentialReads("/h", undecidedFirstReadableLast.fs);
  assert.equal(c.result, "allowed", "the scan must go on past an undecided path");
  assert.match(c.detail, /credentials\.tfrc\.json/);

  const refusedOnly = perPathFs({ ".netrc": "EPERM", ".kube/config": "EACCES" });
  const d = probeCredentialReads("/h", refusedOnly.fs);
  assert.equal(d.result, "blocked");
  assert.match(d.detail, /\.netrc/);
  assert.match(d.detail, /\.kube\/config/);
});

test("the probe never reads a byte and closes every descriptor it opens", () => {
  for (const outcomes of [
    { ".netrc": "ok", ".npmrc": "ok", ".pypirc": "ok" },
    { ".netrc": "EACCES", ".npmrc": "ELOOP", ".pypirc": "ok" },
    { ".netrc": "ok" },
    {},
  ]) {
    const { spy, fs: fake } = perPathFs(outcomes);
    probeCredentialReads("/h", fake);
    assert.equal(spy.reads, 0, "no read for " + JSON.stringify(outcomes));
    assert.equal(spy.opens, spy.closes, "every opened descriptor must be closed for " + JSON.stringify(outcomes));
  }
});

test("missing files and entries below a regular file are skipped as absent", (t) => {
  const home = fakeHome(t);
  put(home, ".azure", "this is a file, so .azure/msal_token_cache.json is ENOTDIR");
  const v = probeCredentialReads(home);
  assert.equal(v.result, "unknown");
  assert.equal(v.absent, true);
});

test("a directory and a dangling symlink at a credential path are skipped, not reported as readable", { skip: NEEDS_SYMLINKS }, (t) => {
  const home = fakeHome(t);
  fs.mkdirSync(path.join(home, ".netrc"));
  fs.symlinkSync(path.join(home, "nowhere"), path.join(home, ".npmrc"));
  const v = probeCredentialReads(home);
  assert.equal(v.result, "unknown", JSON.stringify(v));
  assert.equal(v.absent, true);
});

test("a socket at a credential path is undecided, not skipped", { skip: NEEDS_SYMLINKS }, async (t) => {
  const home = fakeHome(t);
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(path.join(home, ".netrc"), resolve));
  t.after(() => server.close());
  const v = probeCredentialReads(home);
  assert.equal(v.result, "unknown");
  assert.match(v.detail, /undecided/);
  assert.notEqual(v.absent, true);
});

test("a named pipe at a credential path does not hang the probe", { skip: NEEDS_FIFO }, (t) => {
  const home = fakeHome(t);
  execFileSync("mkfifo", [path.join(home, ".netrc")]);
  const code = `import { probeCredentialReads } from ${JSON.stringify(PROBE_URL)}; console.log(JSON.stringify(probeCredentialReads(${JSON.stringify(home)})));`;
  const done = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 });
  assert.equal(done.error, undefined, "the probe must return within 10 seconds, not wait for a writer on the pipe");
  const v = JSON.parse(done.stdout);
  assert.equal(v.result, "unknown");
  assert.equal(v.absent, true);
});

test("only the 'nothing exists' unknown is tolerated; an undecided one makes read-credentials unresolved", { skip: NEEDS_SYMLINKS }, async (t) => {
  // runProbes runs git: keep any GIT_* variable of an outer git hook from reaching the real repository.
  const savedGit = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("GIT_")));
  for (const k of Object.keys(savedGit)) delete process.env[k];
  t.after(() => Object.assign(process.env, savedGit));
  const world = fakeHome(t);
  const scratch = path.join(world, "scratch");
  const workdir = path.join(world, "wt");
  fs.mkdirSync(scratch);
  fs.mkdirSync(workdir);

  const emptyHome = path.join(world, "empty-home");
  fs.mkdirSync(emptyHome);
  const tolerated = await runProbes({ workdir, scratch, home: emptyHome, net: "nonexistent.invalid:443", env: {} });
  assert.ok(!tolerated.unresolved.includes("read-credentials"), "an empty home is tolerated");

  const loopHome = path.join(world, "loop-home");
  fs.mkdirSync(loopHome);
  fs.symlinkSync(path.join(loopHome, ".netrc"), path.join(loopHome, ".netrc"));
  const undecided = await runProbes({ workdir, scratch, home: loopHome, net: "nonexistent.invalid:443", env: {} });
  assert.ok(undecided.unresolved.includes("read-credentials"), "an undecided credential probe is unresolved");
});

test("every probed location lies under a deny-read root in the documented sandbox settings", () => {
  const doc = fs.readFileSync(SAFETY_RUNNER, "utf8");
  const block = doc.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, "safety-runner.md must hold the settings JSON block");
  const roots = JSON.parse(block[1]).sandbox.filesystem.denyRead.map((r) => r.replace(/^~\//, ""));
  for (const rel of CREDENTIAL_PATHS) {
    const covered = roots.some((root) => rel === root || rel.startsWith(root + "/"));
    assert.ok(covered, rel + " is probed but the documented denyRead list does not cover it");
  }
});
