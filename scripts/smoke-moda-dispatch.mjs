// scripts/smoke-moda-dispatch.mjs
//
// v0.2.126 — end-to-end wiring smoke for the moda branch dispatch
// chain. The 6 unit tests in moda-dispatch-outcome-core.test.ts
// cover decideModaDispatchOutcome in isolation. This smoke
// exercises the COMPOSITION of the four pure-cores that fire on
// every Forge-click of a featured moda snippet:
//
//   1. parseRoutingFrontmatter(body)  — frontmatter head parse
//   2. decideForgeRouting(path, fm)   — branch decision (moda? python? english?)
//   3. routeActionCodeRegen(id, deps) — E-- → /generate router
//   4. decideModaDispatchOutcome(rr)  — write-and-open | open | notice-and-open
//
// If any pair in this chain drifts shape (e.g. RoutingResult adds
// a new failure reason, or decideForgeRouting changes its
// precedence rules), the smoke catches the drift before BRAT
// install. Unit tests catch shape changes ONE-AT-A-TIME but not
// the composition surprises.
//
// Specifically catches the v0.2.124 cohort regression class:
//   - simulation.md frontmatter parses correctly
//   - decideForgeRouting routes it to moda
//   - regen runs FIRST (E-- success → write-and-open code returned)
//   - on failure modes (no-token, http-error, engine-error), the
//     notice text explains the stale-state surface
//
// Runs as a release-gate. No filesystem state; pure in-memory
// composition test.
//
// Usage:
//   node scripts/smoke-moda-dispatch.mjs

import {
  parseRoutingFrontmatter,
  decideForgeRouting,
  hasRoutingKeys,
} from "../src/forge-snippet-routing-core.ts";
import { routeActionCodeRegen } from "../src/route-action-code-regen-core.ts";
import { decideModaDispatchOutcome } from "../src/moda-dispatch-outcome-core.ts";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed += 1;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}`);
    failed += 1;
  }
}

function section(name) {
  console.log(`\n${DIM}— ${name} —${RESET}`);
}

// ---------------------------------------------------------------
// Synthetic frontmatter shapes
// ---------------------------------------------------------------

const SIMULATION_MD_BODY = `---
type: action
featured: true
---
# English

Run the simulation.

# Python

def compute(context):
    return {}
`;

const HELLO_WORLD_MD_BODY = `---
type: action
---
# English

Print "hello world".
`;

const PYTHON_MODE_SIM_BODY = `---
type: action
featured: true
edit_mode: python
---
# English

unused — edit_mode is python.

# Python

def compute(context):
    return 42
`;

const STALE_CACHE_FM = { type: "action" }; // missing 'featured'

// ---------------------------------------------------------------
// Phase 1 — frontmatter head parser composition
// ---------------------------------------------------------------

section("Phase 1: parseRoutingFrontmatter → decideForgeRouting (the routing surface)");

const simFm = parseRoutingFrontmatter(SIMULATION_MD_BODY);
assert(simFm !== null, "parseRoutingFrontmatter accepts canonical simulation.md");
assert(simFm?.featured === true, "  featured coerces to boolean true");
assert(simFm?.type === "action", "  type stays string 'action'");

const simRouting = decideForgeRouting("forge-moda/simulation.md", simFm);
assert(simRouting.kind === "moda", "decideForgeRouting routes simulation.md to MODA branch");

const helloFm = parseRoutingFrontmatter(HELLO_WORLD_MD_BODY);
const helloRouting = decideForgeRouting(
  "forge-tutorial/01-hello/hello_world.md",
  helloFm,
);
assert(
  helloRouting.kind === "english-mode",
  "decideForgeRouting routes hello_world.md to ENGLISH-MODE branch",
);

const pythonModeFm = parseRoutingFrontmatter(PYTHON_MODE_SIM_BODY);
const pythonRouting = decideForgeRouting("forge-moda/simulation.md", pythonModeFm);
assert(
  pythonRouting.kind === "python-mode",
  "decideForgeRouting: edit_mode:python > moda precedence (v0.2.123 fix)",
);

// ---------------------------------------------------------------
// Phase 2 — fast-path key-presence guard (v0.2.125 gap closure)
// ---------------------------------------------------------------

section("Phase 2: hasRoutingKeys (v0.2.125 fast-path gap closure)");

assert(hasRoutingKeys(simFm) === true, "fresh simulation.md fm has routing keys");
assert(
  hasRoutingKeys(STALE_CACHE_FM) === false,
  "stale cache {type: action} does NOT have routing keys — disk fallback fires (v0.2.125 fix)",
);
assert(hasRoutingKeys(null) === false, "null cache → no routing keys");
assert(hasRoutingKeys(undefined) === false, "undefined cache → no routing keys");
assert(hasRoutingKeys({}) === false, "empty cache → no routing keys");

// ---------------------------------------------------------------
// Phase 3 — routeActionCodeRegen → decideModaDispatchOutcome composition
// ---------------------------------------------------------------

section("Phase 3: routeActionCodeRegen → decideModaDispatchOutcome (the moda-branch composition)");

// Scenario A: E-- success → write-and-open
{
  const deps = {
    resolveActionCode: async (id) => {
      assert(id === "simulation", "  E-- success: deps received snippetId 'simulation'");
      return "def compute(context):\n  return 'tamar'\n";
    },
    hasToken: true, // shouldn't matter for E-- success
    generate: async () => {
      throw new Error("smoke fail: generate should NOT be called on E-- success");
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(regen.ok === true, "  routeActionCodeRegen returns ok:true on E-- success");
  assert(regen.via === "e--", "  via: 'e--'");

  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "write-and-open",
    "Scenario A — E-- success → write-and-open outcome",
  );
  if (outcome.kind === "write-and-open") {
    assert(
      outcome.code.includes("tamar"),
      "  outcome.code carries the transpiled Python through",
    );
  }
}

// Scenario B: E-- empty + token present → /generate success → open
{
  let generateCalled = false;
  const deps = {
    resolveActionCode: async () => null, // E-- couldn't compile
    hasToken: true,
    generate: async (id) => {
      generateCalled = true;
      assert(id === "simulation", "  /generate fallback: deps received snippetId");
      return "<generate-write-completed>"; // sentinel per main.ts's routingDeps
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(generateCalled, "  generate() was called when E-- returned null");
  assert(regen.ok === true, "  routeActionCodeRegen returns ok:true on /generate success");
  assert(regen.via === "generate", "  via: 'generate'");

  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "open",
    "Scenario B — /generate success → open outcome (no write; generate() already wrote)",
  );
}

// Scenario C: E-- empty + NO token → no-token failure → notice-and-open
{
  const deps = {
    resolveActionCode: async () => null,
    hasToken: false,
    generate: async () => {
      throw new Error("smoke fail: generate should NOT be called when hasToken=false");
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(regen.ok === false, "  routeActionCodeRegen returns ok:false when no token");
  assert(
    regen.reason === "no-token",
    "  failure reason: 'no-token'",
  );

  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "notice-and-open",
    "Scenario C — no-token failure → notice-and-open (iframe still opens per v0326 §2.4)",
  );
  if (outcome.kind === "notice-and-open") {
    assert(
      /no-token/.test(outcome.notice),
      "  notice text includes the failure reason",
    );
    assert(
      /current Python/.test(outcome.notice),
      "  notice text includes 'current Python' UX cue",
    );
  }
}

// Scenario D: E-- throws → engine-error → notice-and-open
{
  const deps = {
    resolveActionCode: async () => {
      throw new Error("Pyodide host not ready");
    },
    hasToken: true,
    generate: async () => {
      throw new Error("smoke fail: generate should NOT be called on engine-error");
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(regen.ok === false, "  routeActionCodeRegen returns ok:false on engine-error");
  assert(regen.reason === "engine-error", "  failure reason: 'engine-error'");

  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "notice-and-open",
    "Scenario D — engine-error → notice-and-open",
  );
  if (outcome.kind === "notice-and-open") {
    assert(
      /engine-error/.test(outcome.notice),
      "  notice text includes 'engine-error' reason",
    );
    assert(
      /Pyodide host not ready/.test(outcome.notice),
      "  notice text includes the engine's specific error message",
    );
  }
}

// Scenario E: /generate throws → http-error → notice-and-open
{
  const deps = {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => {
      throw new Error("/generate returned 503");
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(regen.ok === false, "  routeActionCodeRegen returns ok:false on /generate throw");
  assert(regen.reason === "http-error", "  failure reason: 'http-error'");

  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "notice-and-open",
    "Scenario E — http-error → notice-and-open",
  );
  if (outcome.kind === "notice-and-open") {
    assert(
      /http-error/.test(outcome.notice),
      "  notice text includes 'http-error' reason",
    );
    assert(
      /503/.test(outcome.notice),
      "  notice text includes the HTTP status from the /generate error",
    );
  }
}

// ---------------------------------------------------------------
// Phase 4 — end-to-end: simulate the full Forge-click code path
// ---------------------------------------------------------------

section("Phase 4: end-to-end Forge-click simulation (parse → route → regen → decide)");

// Driver scenario: user edits # English on simulation.md, clicks Forge.
// Cache is empty (the v0.2.124 regression's runtime cause). Plugin reads
// disk, parses frontmatter, routes to moda, re-transpiles, decides
// write-and-open. Iframe opens with fresh Python.
{
  // Step 1: metadataCache returns nothing (the regression).
  const cachedFm = null;
  assert(!hasRoutingKeys(cachedFm), "  cache is null → falls through to disk read");

  // Step 2: plugin reads disk + parses frontmatter.
  const fmFromDisk = parseRoutingFrontmatter(SIMULATION_MD_BODY);
  assert(fmFromDisk?.featured === true, "  disk parse recovers featured: true");

  // Step 3: routing decision against the recovered frontmatter.
  const route = decideForgeRouting("forge-moda/simulation.md", fmFromDisk);
  assert(route.kind === "moda", "  routes to moda even though cache was empty");

  // Step 4: dispatchModaBranch's regen call.
  const deps = {
    resolveActionCode: async () => "def compute(context):\n  return 'fresh'\n",
    hasToken: true,
    generate: async () => {
      throw new Error("should not /generate when E-- succeeds");
    },
  };
  const regen = await routeActionCodeRegen("simulation", deps);
  assert(regen.ok && regen.via === "e--", "  E-- success on fresh transpile");

  // Step 5: decision shape — write fresh Python back before opening iframe.
  const outcome = decideModaDispatchOutcome(regen);
  assert(
    outcome.kind === "write-and-open",
    "  outcome: write-and-open (the v0.2.126 fix — iframe gets fresh Python)",
  );
  if (outcome.kind === "write-and-open") {
    assert(
      outcome.code.includes("fresh"),
      "  fresh transpiled Python flows to writeCanonicalPythonBack",
    );
  }
  console.log(
    `  ${DIM}simulation regression chain: NULL CACHE → disk read → MODA → regen → write fresh Python → open iframe${RESET}`,
  );
}

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------

console.log(`\n${DIM}Smoke complete.${RESET}`);
console.log(`  ${GREEN}passed: ${passed}${RESET}`);
if (failed > 0) {
  console.log(`  ${RED}failed: ${failed}${RESET}`);
  process.exit(1);
} else {
  console.log(`  ${GREEN}all wiring intact — v0.2.126 dispatch chain healthy${RESET}`);
}
