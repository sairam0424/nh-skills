import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../nh-chaos-monkey/scripts/sandbox-probe.mjs";

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "nh-chaos-monkey", "scripts", "sandbox-probe.mjs");
// IPv6 literals ("[::1]:80") are bad too: the host:port form splits on the first colon and never supported them.
const BAD_NET = ["localhost", "localhost:", "localhost:abc", "localhost:0", "localhost:99999", "localhost:-1", ":443", "a:1:2", "a b:1", "[::1]:80"];

test("a malformed --net value is a usage error (exit 2), not a crash", (t) => {
  // A fake home keeps a regression (the probe running instead of refusing) away from the real one.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "nh-net-usage-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  for (const bad of BAD_NET) {
    const done = spawnSync(process.execPath, [PROBE, "--workdir", home, "--scratch", home, "--net", bad], {
      encoding: "utf8",
      env: { HOME: home, PATH: process.env.PATH },
    });
    assert.equal(done.status, 2, bad);
    assert.match(done.stderr, /usage: sandbox-probe/, bad);
    assert.doesNotMatch(done.stderr, /RangeError|ERR_SOCKET_BAD_PORT/, bad);
  }
});

test("a dangling --net with no value is a usage error too", () => {
  assert.equal(parseArgs(["--workdir", "/w", "--scratch", "/s", "--net"]), null);
});

test("well-formed --net values and the absence of --net still parse", () => {
  for (const good of ["localhost:1", "127.0.0.1:443", "example.test:65535"]) {
    const parsed = parseArgs(["--workdir", "/w", "--scratch", "/s", "--net", good]);
    assert.ok(parsed, good);
    assert.equal(parsed.net, good);
  }
  assert.equal(parseArgs(["--workdir", "/w", "--scratch", "/s"]).net, undefined);
  assert.equal(parseArgs(["--workdir", "/w", "--scratch", "/s", "--json"]).json, true);
});
