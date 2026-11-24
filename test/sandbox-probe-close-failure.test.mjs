import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { probeCredentialReads } from "../nh-chaos-monkey/scripts/sandbox-probe.mjs";

const eio = () => Object.assign(new Error("EIO"), { code: "EIO" });

test("a failing close is reported as an undecided path, not thrown", () => {
  const fsImpl = {
    ...fs,
    openSync: () => 99,
    fstatSync: () => ({ isFile: () => false }),
    closeSync: () => {
      throw eio();
    },
  };
  const result = probeCredentialReads("/h", fsImpl);
  assert.equal(result.result, "unknown");
  assert.match(result.detail, /close failed: EIO/);
  assert.notEqual(result.absent, true, "an undecided path is never the tolerated empty-home unknown");
});

test("a readable credential file still wins over a close failure on another path", () => {
  let calls = 0;
  const fsImpl = {
    ...fs,
    openSync: () => 99,
    fstatSync: () => ({ isFile: () => ++calls === 1 }),
    closeSync: () => {
      throw eio();
    },
  };
  const result = probeCredentialReads("/h", fsImpl);
  assert.equal(result.result, "allowed");
  assert.match(result.detail, /openable/);
});

test("a normal close still yields blocked when every path is refused", () => {
  const fsImpl = {
    ...fs,
    openSync: () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    },
    closeSync: () => assert.fail("nothing was opened, so nothing may be closed"),
  };
  assert.equal(probeCredentialReads("/h", fsImpl).result, "blocked");
});
