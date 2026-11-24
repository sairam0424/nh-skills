import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

const rejectsWith = (args, pattern) =>
  assert.rejects(runLoop({ args }), (e) => {
    assert.match(e.message, pattern);
    return true;
  });

test("a lens entry that is not an object with a string key is refused", async () => {
  for (const bad of ["boundaries", null, 5, ["a"], {}, { key: 3, brief: "x" }])
    await rejectsWith(baseArgs({ lenses: [bad] }), /each lens must be an object with a string key/);
});

test("entries past the sixth lens are validated too, even though only six are used", async () => {
  const ok = (n) => ({ key: "lens-" + n, brief: "b" });
  const seven = [ok(1), ok(2), ok(3), ok(4), ok(5), ok(6), "not-an-object"];
  await rejectsWith(baseArgs({ lenses: seven }), /each lens must be an object with a string key/);
});
