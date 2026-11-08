#!/usr/bin/env node
// Sandbox preflight probe for nh-chaos-monkey.
//
// Run it in the SAME environment the loop's agents will use (their Bash tool), not somewhere else.
// It tries a handful of actions an enforced sandbox must refuse and reports, per action, whether
// the environment "blocked" it, "allowed" it, or could not tell ("unknown"). It never reads a
// credential file's content, never sends data over the network, and removes everything it creates.
//
//   node sandbox-probe.mjs --workdir /abs/worktree --scratch /abs/scratch [--net host:port] [--json]
//
// Exit status: 0 when every probe that could be evaluated was blocked, 1 when any was allowed,
// 2 on a usage error. "blocked" on the network probe also covers "the machine is offline", so a
// pass says the egress attempt failed, not why.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK_CODES = new Set(["EACCES", "EPERM", "EROFS"]);
const CREDENTIAL_PATHS = [".ssh/id_rsa", ".ssh/id_ed25519", ".aws/credentials", ".config/gh/hosts.yml", ".netrc"];
const SECRET_ENV = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|PRIVATE_?KEY|^AWS_|^ANTHROPIC_|^OPENAI_|^GH_|^GITHUB_)/i;

const rand = () => randomBytes(6).toString("hex");
const verdict = (name, result, detail) => ({ name, result, detail });

// Try to create a file; "allowed" means it was created (and is removed again).
function tryCreate(name, file) {
  try {
    fs.writeFileSync(file, "nh-chaos-monkey sandbox probe\n", { flag: "wx" });
    fs.unlinkSync(file);
    return verdict(name, "allowed", "created " + file);
  } catch (e) {
    if (BLOCK_CODES.has(e.code)) return verdict(name, "blocked", e.code);
    return verdict(name, "unknown", String(e.code || e.message));
  }
}

function probeCredentialReads(home) {
  const found = [];
  const readable = [];
  for (const rel of CREDENTIAL_PATHS) {
    const file = path.join(home, rel);
    let fd;
    try {
      fd = fs.openSync(file, "r"); // open and close only; no byte is ever read
      readable.push(rel);
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") continue;
      found.push(rel);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  if (readable.length) return verdict("read-credentials", "allowed", "openable: " + readable.join(", "));
  if (found.length) return verdict("read-credentials", "blocked", "refused: " + found.join(", "));
  return verdict("read-credentials", "unknown", "none of the usual credential files exist here");
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
  try {
    return tryCreate("symlink-escape", path.join(link, ".nh-chaos-probe-" + rand()));
  } finally {
    fs.unlinkSync(link);
  }
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
  const hooks = path.join(common, "hooks");
  const config = path.join(common, "config");
  let configResult;
  try {
    fs.closeSync(fs.openSync(config, "r+")); // write access check without changing a byte
    configResult = verdict("git-config-write", "allowed", "opened " + config + " for writing");
  } catch (e) {
    configResult = BLOCK_CODES.has(e.code)
      ? verdict("git-config-write", "blocked", e.code)
      : verdict("git-config-write", "unknown", String(e.code || e.message));
  }
  return [tryCreate("git-hooks-write", path.join(hooks, ".nh-chaos-probe-" + rand())), configResult];
}

function probeEnvironment(env) {
  const names = Object.keys(env).filter((k) => SECRET_ENV.test(k));
  return names.length
    ? verdict("env-secrets", "allowed", "secret-looking variables visible: " + names.sort().join(", "))
    : verdict("env-secrets", "blocked", "no secret-looking variable names");
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
  return { verdict: allowed.length ? "not-enforced" : "enforced", allowed, probes };
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (["--workdir", "--scratch", "--net"].includes(argv[i])) out[argv[i].slice(2)] = argv[++i];
    else return null;
  }
  const absolute = (p) => typeof p === "string" && path.isAbsolute(p);
  return absolute(out.workdir) && absolute(out.scratch) ? out : null;
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
    console.log("\nverdict: " + report.verdict + (report.allowed.length ? " (allowed: " + report.allowed.join(", ") + ")" : ""));
  }
  process.exit(report.verdict === "enforced" ? 0 : 1);
}
