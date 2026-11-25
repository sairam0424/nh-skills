import { test } from "node:test";
import assert from "node:assert/strict";

import { baseArgs, runLoop } from "./support/chaos-loop-harness.mjs";

test("duplicate lens keys are refused so parallel breakers never share a directory", async () => {
  await assert.rejects(
    runLoop({
      args: baseArgs({
        maxRounds: 1,
        lenses: [
          { key: "dup", brief: "first brief" },
          { key: "dup", brief: "second brief" },
        ],
      }),
    }),
    /lens keys must be unique/,
  );
});
