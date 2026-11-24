#!/usr/bin/env node
// Sandbox preflight probe for nh-chaos-monkey.
//
// Run it in the SAME environment the loop's agents will use (their Bash tool), not somewhere else.
// It tries a handful of actions an enforced sandbox must refuse and reports, per action, whether
// the environment "blocked" it, "allowed" it, or could not tell ("unknown"). It never reads a
// credential file's content, never sends data over the network, and removes what it creates (a
// refusal to remove something is reported in that probe's detail).
//
//   node sandbox-probe.mjs --workdir /abs/worktree --scratch /abs/scratch [--net host:port] [--json]
//
// Exit status: 0 only when every probe was blocked (the credential probe may also be unknown when no
// credential file exists), 1 when any probe was allowed or could not be evaluated, 2 on a usage
// error. "blocked" on the network probe also covers "the machine is offline", so a pass says the
// egress attempt failed, not why.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK_CODES = new Set(["EACCES", "EPERM", "EROFS"]);
export const CREDENTIAL_PATHS = [
  ".ssh/id_rsa",
  ".ssh/id_ed25519",
  ".aws/credentials",
  ".config/gh/hosts.yml",
  ".netrc",
  ".npmrc",
  ".kube/config",
  ".docker/config.json",
  ".config/gcloud/credentials.db",
  ".git-credentials",
  ".azure/msal_token_cache.json",
  ".config/gcloud/application_default_credentials.json",
  ".pypirc",
  ".cargo/credentials.toml",
  ".terraform.d/credentials.tfrc.json",
];
// Only these two codes mean "the sandbox refused". Anything else (a symlink loop, too many open files,
// an I/O error) says nothing about the sandbox, so it is undecided, never a pass.
const REFUSAL_CODES = new Set(["EACCES", "EPERM"]);
const ABSENT_CODES = new Set(["ENOENT", "ENOTDIR"]);
// A name is secret-looking when it contains a credential word. Provider prefixes alone are not enough:
// AWS_REGION or ANTHROPIC_DEFAULT_SONNET_MODEL is configuration that a Bedrock-backed session needs, and
// flagging it would make "enforced" unreachable there. AWS_ACCESS_KEY_ID, AWS_SESSION_TOKEN, GH_TOKEN and
// ANTHROPIC_API_KEY still match through their credential word. TOKEN must not be followed by another letter,
// so a count such as CLAUDE_CODE_MAX_OUTPUT_TOKENS is not a credential. PAT, PASS, PASSPHRASE and AUTH
// count only as whole words between underscores (GITHUB_PAT, SSH_AUTH_SOCK), never inside PYTHONPATH or
// GIT_AUTHOR_NAME. PWD counts only as a suffix word (MYSQL_PWD): a bare PWD or OLDPWD is the current
// directory that every shell sets.
const SECRET_ENV = /(TOKEN(?![A-Z])|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|CREDENTIAL|PRIVATE_?KEY|CUSTOM_HEADERS|_PWD(_|$)|(^|_)(PAT|PASS|PASSPHRASE|AUTH)(_|$))/i;

const rand = () => randomBytes(6).toString("hex");
const verdict = (name, result, detail) => ({ name, result, detail });

// Try to create a file. Creating it is what decides "allowed"; a refused clean-up afterwards
// is reported in the detail and never turns the result into "blocked".
export function tryCreate(name, file, fsImpl = fs) {
  try {
    fsImpl.writeFileSync(file, "nh-chaos-monkey sandbox probe\n", { flag: "wx" });
  } catch (e) {
    if (BLOCK_CODES.has(e.code)) return verdict(name, "blocked", e.code);
    return verdict(name, "unknown", String(e.code || e.message));
  }
  try {
    fsImpl.unlinkSync(file);
    return verdict(name, "allowed", "created " + file);
  } catch (e) {
    return verdict(name, "allowed", "created " + file + " and could not remove it (" + (e.code || e.message) + "); remove it by hand");
  }
}

// Open a file for writing without changing a byte: a write-access check.
function openForWrite(name, file) {
  try {
    fs.closeSync(fs.openSync(file, "r+"));
    return verdict(name, "allowed", "opened " + file + " for writing");
  } catch (e) {
    return BLOCK_CODES.has(e.code) ? verdict(name, "blocked", e.code) : verdict(name, "unknown", String(e.code || e.message));
  }
}

export function probeCredentialReads(home, fsImpl = fs) {
  const readable = [];
  const refused = [];
  const undecided = [];
  for (const rel of CREDENTIAL_PATHS) {
    const file = path.join(home, rel);
    let fd;
    try {
      // Non-blocking, so a named pipe at this path cannot make the probe wait for a writer.
      fd = fsImpl.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); // open and close only; no byte is ever read
      if (fsImpl.fstatSync(fd).isFile()) readable.push(rel); // a directory or a pipe is not a credential file (a socket cannot be opened and is undecided below)
    } catch (e) {
      if (ABSENT_CODES.has(e.code)) continue;
      if (REFUSAL_CODES.has(e.code)) refused.push(rel);
      else undecided.push(rel + " (" + String(e.code || e.message) + ")");
    } finally {
      if (fd !== undefined) {
        try {
          fsImpl.closeSync(fd);
        } catch (e) {
          undecided.push(rel + " (close failed: " + String(e.code || e.message) + ")");
        }
      }
    }
  }
  if (readable.length) return verdict("read-credentials", "allowed", "openable: " + readable.join(", "));
  if (undecided.length) return verdict("read-credentials", "unknown", "undecided: " + undecided.join(", "));
  if (refused.length) return verdict("read-credentials", "blocked", "refused: " + refused.join(", "));
  // Nothing exists: the probe cannot tell a working sandbox from an empty home. This is the one tolerated unknown.
  return { ...verdict("read-credentials", "unknown", "no regular file at any of the usual credential paths"), absent: true };
}

function probeNetwork(target) {
  const [host, port] = target.split(":");
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) });
    const finish = (result, detail) => {
      socket.destroy();
      resolve(verdict("network-egress", result, detail));
    };
    socket.setTimeout(3000, () => finish("blocked", "timed out after 3 s, no connection"));
    socket.once("connect", () => finish("allowed", "connected to " + target));
    // ECONNREFUSED means the path to the host was open and nothing listened: not a sandbox block.
    socket.once("error", (e) =>
      e.code === "ECONNREFUSED"
        ? finish("allowed", "reached " + target + " (refused: nothing listening)")
        : finish("blocked", String(e.code || e.message)),
    );
  });
}

function probeSymlinkEscape(scratch, home) {
  const link = path.join(scratch, ".probe-link-" + rand());
  try {
    fs.symlinkSync(home, link);
  } catch (e) {
    return verdict("symlink-escape", "unknown", "could not create the link: " + (e.code || e.message));
  }
  const result = tryCreate("symlink-escape", path.join(link, ".nh-chaos-probe-" + rand()));
  try {
    fs.unlinkSync(link);
  } catch (e) {
    return { ...result, detail: result.detail + "; could not remove the link " + link + " (" + (e.code || e.message) + ")" };
  }
  return result;
}

function probeGitState(workdir) {
  let common;
  try {
    common = execFileSync("git", ["-C", workdir, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (e) {
    return [verdict("git-hooks-write", "unknown", "not a git worktree"), verdict("git-config-write", "unknown", "not a git worktree")];
  }
  const results = [
    tryCreate("git-hooks-write", path.join(common, "hooks", ".nh-chaos-probe-" + rand())),
    openForWrite("git-config-write", path.join(common, "config")),
  ];
  // With extensions.worktreeConfig a second config file can carry code-running settings.
  const worktreeConfig = path.join(common, "config.worktree");
  if (fs.existsSync(worktreeConfig)) results.push(openForWrite("git-worktree-config-write", worktreeConfig));
  return results;
}

// Claude Code's built-in sandbox (sandbox-runtime) puts the login for its own loopback proxy into every
// sandboxed shell: the proxy password variable, and the same login embedded in HTTPS_PROXY, HTTP_PROXY and
// ALL_PROXY. That login only reaches the proxy the sandbox already bounds, so it is not counted as a leaked
// secret, but it is always reported. The exception needs SANDBOX_RUNTIME=1, a loopback proxy address and the
// variable's own value inside a proxy URL's login, so a value the user set for their own proxy is still flagged.
// The name is assembled here so no assignment of a secret-looking name to a string sits in the file.
const PROXY_LOGIN_VAR = ["CLOUDSDK", "PROXY", "PASSWORD"].join("_");
const LOOPBACK_ADDRESS = /^(127\.0\.0\.1|localhost|::1|\[::1\])$/i;
const PROXY_URL_VARS = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"];

function sandboxProxyLogin(env) {
  const value = env[PROXY_LOGIN_VAR];
  if (!value || env.SANDBOX_RUNTIME !== "1" || !LOOPBACK_ADDRESS.test(env.CLOUDSDK_PROXY_ADDRESS || "")) return [];
  const embedded = PROXY_URL_VARS.some((v) => (env[v] || "").includes(":" + value + "@"));
  return embedded ? [PROXY_LOGIN_VAR] : [];
}

function probeEnvironment(env) {
  const matching = Object.keys(env).filter((k) => SECRET_ENV.test(k));
  const ignored = sandboxProxyLogin(env).filter((k) => matching.includes(k));
  const names = matching.filter((k) => !ignored.includes(k));
  const note = ignored.length ? ` (ignored ${ignored.length}: the sandbox runtime's own loopback proxy login, ${ignored.sort().join(", ")})` : "";
  const base = names.length
    ? verdict("env-secrets", "allowed", "secret-looking variables visible: " + names.sort().join(", ") + note)
    : verdict("env-secrets", "blocked", "no secret-looking variable names" + note);
  return { ...base, ignored };
}

export async function runProbes({ workdir, scratch, net: target = "1.1.1.1:443", home = os.homedir(), env = process.env }) {
  const probes = [
    tryCreate("write-home", path.join(home, ".nh-chaos-probe-" + rand())),
    tryCreate("write-outside-workdir", path.join(path.dirname(workdir), ".nh-chaos-probe-" + rand())),
    probeSymlinkEscape(scratch, home),
    probeCredentialReads(home),
    ...probeGitState(workdir),
    probeEnvironment(env),
    await probeNetwork(target),
  ];
  const allowed = probes.filter((p) => p.result === "allowed").map((p) => p.name);
  // A probe that could not be evaluated is not a pass, except the credential probe when none of the
  // usual credential files exist: there is nothing there to protect. An undecided credential probe counts.
  const unresolved = probes.filter((p) => p.result === "unknown" && !(p.name === "read-credentials" && p.absent === true)).map((p) => p.name);
  return { verdict: allowed.length ? "not-enforced" : unresolved.length ? "incomplete" : "enforced", allowed, unresolved, probes };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (["--workdir", "--scratch", "--net"].includes(argv[i])) out[argv[i].slice(2)] = argv[++i];
    else return null;
  }
  const absolute = (p) => typeof p === "string" && path.isAbsolute(p);
  const validNet = (n) => {
    if (!Object.hasOwn(out, "net")) return true; // a dangling --net has no value and is a usage error
    const m = /^[^:\s]+:(\d+)$/.exec(String(n));
    return m !== null && Number(m[1]) >= 1 && Number(m[1]) <= 65535;
  };
  return absolute(out.workdir) && absolute(out.scratch) && validNet(out.net) ? out : null;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("usage: sandbox-probe.mjs --workdir /abs/worktree --scratch /abs/scratch [--net host:port] [--json]");
    process.exit(2);
  }
  const report = await runProbes(args);
  if (args.json) console.log(JSON.stringify(report));
  else {
    for (const p of report.probes) console.log(p.result.padEnd(8) + p.name.padEnd(24) + p.detail);
    const why = report.allowed.length ? " (allowed: " + report.allowed.join(", ") + ")" : report.unresolved.length ? " (could not be evaluated: " + report.unresolved.join(", ") + ")" : "";
    console.log("\nverdict: " + report.verdict + why);
  }
  process.exit(report.verdict === "enforced" ? 0 : 1);
}
