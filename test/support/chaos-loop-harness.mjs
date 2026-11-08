// Deterministic harness for nh-chaos-monkey/scripts/chaos-loop.js.
//
// The loop script is a Workflow script: it calls the globals agent(), parallel(),
// phase(), log() and reads budget and args. This module runs the real, unmodified
// script source against a scripted fake runtime, so every halt, verdict and
// prompt can be exercised in milliseconds with no model, no git and no tokens.
//
// Fidelity rules (from the Workflow tool reference):
//   - agent() resolves to null when the agent dies or is skipped
//   - parallel() never rejects; a thunk that throws resolves to null
//   - a structured-output reply that breaks the schema is a scenario bug here,
//     so it is recorded and the run fails loudly instead of reading as a dead agent
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SCRIPT_PATH = fileURLToPath(
  new URL("../../nh-chaos-monkey/scripts/chaos-loop.js", import.meta.url),
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function loadLoopSource() {
  const source = readFileSync(SCRIPT_PATH, "utf8");
  const body = source.replace(/^export const meta = /m, "const meta = ");
  if (body === source) throw new Error("harness: meta export not found");
  if (/^\s*(export|import)\s/m.test(body))
    throw new Error("harness: unexpected module syntax in the loop script");
  return body;
}

// ---------- schema check (the subset the loop's shape() helper emits) ----------
export function schemaErrors(schema, value, path = "$") {
  if (!schema) return [];
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return [path + " is not an object"];
    const errors = (schema.required || [])
      .filter((k) => !(k in value))
      .map((k) => path + "." + k + " is missing");
    for (const key of Object.keys(value)) {
      if (!schema.properties[key]) errors.push(path + "." + key + " is not in the schema");
      else errors.push(...schemaErrors(schema.properties[key], value[key], path + "." + key));
    }
    return errors;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [path + " is not an array"];
    const errors = [];
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(path + " has more than " + schema.maxItems + " items");
    value.forEach((v, i) => errors.push(...schemaErrors(schema.items, v, path + "[" + i + "]")));
    return errors;
  }
  if (schema.type === "integer")
    return Number.isInteger(value) ? [] : [path + " is not an integer"];
  if (schema.type === "boolean")
    return typeof value === "boolean" ? [] : [path + " is not a boolean"];
  if (schema.type === "string") {
    if (typeof value !== "string") return [path + " is not a string"];
    if (schema.enum && !schema.enum.includes(value))
      return [path + " is not one of " + schema.enum.join("|")];
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      return [path + " is longer than " + schema.maxLength];
  }
  return [];
}

// ---------- the fake world the default agents live in ----------
export const hexSha = (n) => Number(n).toString(16).padStart(40, "0");
export const h64 = (s) =>
  [...String(s)]
    .map((c) => c.charCodeAt(0).toString(16))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);

export const baseArgs = (extra = {}) => ({
  workdir: "/w/repo",
  scratch: "/w/scratch",
  judgeCmd: "npm test",
  target: "src module",
  testCountHint: "use the tap summary",
  ...extra,
});

// A finding spec; the harness turns it into a valid breaker candidate for a round and lens.
export const finding = (n, extra = {}) => ({
  name: "repro" + n,
  title: "Defect number " + n + " in the module",
  file: "src/m" + n + ".js",
  line: 10 * n,
  severity: "high",
  ...extra,
});

export function candidate(scratch, tag, lens, spec) {
  const reproFile = scratch + "/" + tag + "/" + lens + "/" + spec.name + ".mjs";
  return {
    title: spec.title,
    file: spec.file,
    line: spec.line,
    claim: "The module mishandles case " + spec.name,
    contractRef: "README documents the behavior",
    reproCmd: "node " + reproFile,
    reproFile,
    observedExit: 1,
    observedOutputTail: "AssertionError: expected true",
    severity: spec.severity,
    ...(spec.fields || {}),
  };
}

function makeWorld(plan, args) {
  return {
    plan,
    scratch: args.scratch,
    head: hexSha(1),
    testCount: 10,
    verifiedCount: 10,
    commits: 0,
  };
}

function defaultResponse(call, world) {
  const label = call.label || "";
  if (label === "isolation")
    return {
      gitDir: "/w/repo/.git/worktrees/chaos",
      gitCommonDir: "/w/repo/.git",
      branch: "chaos/demo",
      dirty: false,
    };
  if (label === "baseline")
    return {
      judgeExit: 0,
      testCount: world.testCount,
      outputTail: "pass 10",
      manifestFiles: 3,
      manifestCheckExit: 0,
      gitHead: world.head,
      dirty: false,
    };
  if (label === "probe-verifier-model") return { reply: "ok" };
  if (label === "sandbox-probe") return { verdict: "enforced", allowed: [] };
  let m = /^break:(R\d+):(.+)$/.exec(label);
  if (m) {
    const specs = world.plan[m[1] + ":" + m[2]] || [];
    return { candidates: specs.map((s) => candidate(world.scratch, m[1], m[2], s)) };
  }
  m = /^confirm:(.+)$/.exec(label);
  if (m)
    return {
      exit1: 1,
      exit2: 1,
      outputTail: "AssertionError",
      legit: true,
      symptomMatchesClaim: true,
      workdirDirty: false,
      headSha: world.head,
      reproSha: h64(m[1]),
      reason: "Reachable through the public entry point.",
    };
  m = /^fix:(.+):a(\d+)$/.exec(label);
  if (m) {
    const test = "test/regress-" + m[1] + ".test.js";
    return {
      summary: "Handle the case",
      changedFiles: ["src/fix-" + m[1] + "-a" + m[2] + ".js", test],
      regressionTestPath: test,
      reproExit: 0,
      judgeExit: 0,
      testCount: world.testCount + 1,
    };
  }
  m = /^verify:(.+):a\d+:t\d+$/.exec(label);
  if (m)
    return {
      protectedExit: 0,
      reproExit: 0,
      judgeExit: 0,
      testCount: world.testCount + 1,
      armExit: 1,
      reproSha: h64(m[1]),
      protectedTouched: [],
      testsWeakened: false,
      specialCased: false,
      hostileTextSeen: false,
      rootCause: true,
      reasons: [],
      outputTail: "pass",
    };
  m = /^recheck:(.+)$/.exec(label);
  if (m) return { exit: 1, reproSha: h64(m[1]), headSha: world.head, workdirDirty: false };
  if (/^commit:/.test(label)) return { sha: hexSha(100 + world.commits), clean: true };
  if (/^reset:/.test(label)) return { stashRef: "refs/chaos/rejected/x", clean: true };
  if (/^rejudge:/.test(label))
    return {
      judgeExit: 0,
      testCount: world.testCount,
      protectedExit: 0,
      clean: true,
      headSha: world.head,
      outputTail: "pass",
    };
  throw new Error("harness: no default agent for label " + JSON.stringify(label));
}

// What the fake repository does once an agent's reply is accepted by the script.
function observe(call, response, world) {
  const label = call.label || "";
  if (!response) return;
  if (/^verify:/.test(label)) world.verifiedCount = response.testCount;
  if (/^commit:/.test(label) && response.clean) {
    world.head = response.sha;
    world.testCount = world.verifiedCount;
    world.commits += 1;
  }
}

/**
 * Run the real loop script against scripted agents.
 * @param {object} o
 * @param {object|string} o.args       args global (object, or a string to test JSON parsing)
 * @param {object} [o.plan]            breaker output: {"R1:boundaries": [finding(1), ...]}
 * @param {function} [o.override]      (call, world, dflt) => reply | null | undefined (undefined keeps dflt)
 * @param {object} [o.budget]          budget global
 */
export async function runLoop({ args, plan = {}, override, budget }) {
  let argObject = args;
  if (typeof args === "string") {
    try {
      argObject = JSON.parse(args);
    } catch (e) {
      argObject = {}; // the script itself must reject the broken string
    }
  }
  const world = makeWorld(plan, { scratch: (argObject && argObject.scratch) || "/w/scratch" });
  const calls = [];
  const logs = [];
  const phases = [];
  const harnessErrors = [];

  const agent = async (prompt, opts = {}) => {
    const call = { n: calls.length + 1, prompt, label: opts.label, model: opts.model, opts };
    calls.push(call);
    const dflt = defaultResponse(call, world);
    const chosen = override ? override(call, world, dflt) : undefined;
    const reply = chosen === undefined ? dflt : chosen;
    if (reply === null) return null;
    const problems = schemaErrors(opts.schema, reply);
    if (problems.length) {
      const message = "harness: reply for " + opts.label + " breaks its schema: " + problems.join("; ");
      harnessErrors.push(message);
      throw new Error(message);
    }
    observe(call, reply, world);
    return structuredClone(reply);
  };
  const parallel = (thunks) =>
    Promise.all(
      thunks.map(async (thunk) => {
        try {
          return await thunk();
        } catch (e) {
          return null;
        }
      }),
    );
  const pipeline = () => {
    throw new Error("harness: pipeline() is not used by the loop script");
  };
  const loop = new AsyncFunction(
    "agent",
    "parallel",
    "pipeline",
    "phase",
    "log",
    "budget",
    "args",
    loadLoopSource(),
  );
  const result = await loop(
    agent,
    parallel,
    pipeline,
    (title) => phases.push(title),
    (message) => logs.push(message),
    budget || { total: null, spent: () => 0, remaining: () => Infinity },
    args,
  );
  if (harnessErrors.length) throw new Error(harnessErrors.join("\n"));
  return { result, calls, logs, phases, world };
}

export const labelsOf = (calls) => calls.map((c) => c.label);
export const callsFor = (calls, prefix) => calls.filter((c) => (c.label || "").startsWith(prefix));
