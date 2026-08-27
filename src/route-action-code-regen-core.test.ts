// v0.2.121 — tests for routeActionCodeRegen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  routeActionCodeRegen,
  type RoutingResult,
} from './route-action-code-regen-core.ts';

test('routeActionCodeRegen: E-- success path returns code via e--', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/hello', {
    resolveActionCode: async () => 'def compute(context):\n    print("hi")',
    hasToken: true,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.via, 'e--');
    assert.ok(r.code.includes('print'));
  }
});

test('routeActionCodeRegen: empty E-- result with token → falls back to /generate', async () => {
  let generateCalled = false;
  const r = await routeActionCodeRegen('forge-tutorial/free-text', {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => {
      generateCalled = true;
      return 'def compute(context):\n    print("from LLM")';
    },
  });
  assert.equal(generateCalled, true);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.via, 'generate');
    assert.ok(r.code.includes('from LLM'));
  }
});

test('routeActionCodeRegen: whitespace-only E-- result → falls back to /generate', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => '   \n  \n',
    hasToken: true,
    generate: async () => 'def compute(context):\n    pass',
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.via, 'generate');
});

test('routeActionCodeRegen: empty E-- without token → no-token error', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/free-text', {
    resolveActionCode: async () => null,
    hasToken: false,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'no-token');
    assert.ok(r.message.includes('Transpile token'));
  }
});

test('routeActionCodeRegen: E-- throws → engine-error result', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => { throw new Error('Pyodide not ready'); },
    hasToken: true,
    generate: async () => { throw new Error('should not be called'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'engine-error');
    assert.ok(r.message.includes('Pyodide not ready'));
  }
});

test('routeActionCodeRegen: /generate throws → http-error result', async () => {
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => { throw new Error('HTTP 502'); },
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'http-error');
    assert.ok(r.message.includes('HTTP 502'));
  }
});

test('routeActionCodeRegen: short-circuits when E-- succeeds (no LLM call)', async () => {
  let generateCalled = false;
  const r = await routeActionCodeRegen('forge-tutorial/foo', {
    resolveActionCode: async () => 'def compute(context):\n    pass',
    hasToken: true,
    generate: async () => {
      generateCalled = true;
      return 'should not be reached';
    },
  });
  assert.equal(generateCalled, false, 'generate must NOT be called when E-- succeeds');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.via, 'e--');
});

// Type-level test: the discriminated union covers all reasons.
test('routeActionCodeRegen: result type union has all 3 failure reasons', () => {
  const reasons: Array<'no-token' | 'http-error' | 'engine-error'> = [
    'no-token', 'http-error', 'engine-error',
  ];
  for (const reason of reasons) {
    const r: RoutingResult = { ok: false, reason, message: 'test' };
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, reason);
  }
});

// ---------------------------------------------------------------------
// Drain 2026-08-27-1830 — the E-- → /generate fallback must be LOUD on a
// Recipe-canonical note.
//
// Follow-up to drain 1700, which fixed the LIE (the false
// python_derived_from_recipe_hash claim) but deliberately left the
// routing alone. The residue: a note whose `source_facet` is `recipe`
// —  a hand-authored artifact — can have its E-- transpile yield
// nothing, fall through to Phase 2, and get LLM Python generated from
// its DESCRIPTION written over the top. /generate's payload carries no
// Recipe at all (drain 1700 §1), so the Recipe is not merely stale in
// that output — it was never read.
//
// Forge-core chose shape 3 of the three in message 1810: keep the
// fallback, make it visible. Same behaviour, no longer silent.

import {
  shouldWarnRecipeCanonicalFallback,
  recipeCanonicalFallbackNotice,
} from './route-action-code-regen-core.ts';
import { readFileSync } from 'node:fs';

test('1830 THE CASE: a Recipe-canonical note warns on the fallback', () => {
  assert.equal(shouldWarnRecipeCanonicalFallback('recipe'), true);
});

test('1830 NON-VACUITY: Description-canonical does NOT warn', () => {
  // Drain 1700 §2's framing: on a Description-canonical forge the
  // canonical model holds — the sibling _llmGenerateRecipe rebuilt the
  // Recipe from that same Description — so there is nothing to warn
  // about. §1 of this drain says explicitly not to touch that case.
  assert.equal(shouldWarnRecipeCanonicalFallback('description'), false);
});

test('1830 NON-VACUITY: python-canonical and unknown do NOT warn', () => {
  // A python-canonical note has no hand-authored Recipe being bypassed.
  // An absent source_facet is a pre-drain-1200 note with no stored
  // claim — same PERMIT convention drains 1620 and 1700 both adopted;
  // warning there would cry wolf on every legacy note.
  assert.equal(shouldWarnRecipeCanonicalFallback('python'), false);
  assert.equal(shouldWarnRecipeCanonicalFallback(null), false);
  assert.equal(shouldWarnRecipeCanonicalFallback(undefined), false);
});

test('1830 the notice names the note and says the Recipe was not used', () => {
  const msg = recipeCanonicalFallbackNotice('show_colors');
  assert.match(msg, /show_colors/);
  assert.doesNotMatch(msg, /undefined/);
  assert.match(msg, /Recipe/);
  assert.match(msg, /Description/);
});

test('1830 the warn point is reached ONLY on the fallback, never on E-- success', async () => {
  // The load-bearing property behind wiring the warning into the
  // `generate` dep: routeActionCodeRegen calls deps.generate from
  // Phase 2 and nowhere else. If E-- ever succeeded and still touched
  // the dep, the notice would fire on healthy notes.
  let generateCalls = 0;
  const r = await routeActionCodeRegen('forge-tutorial/07-data/show_colors', {
    resolveActionCode: async () => 'def compute(context):\n  return 1',
    hasToken: true,
    generate: async () => { generateCalls += 1; return 'x'; },
  });
  assert.equal(r.ok, true);
  assert.equal(generateCalls, 0, 'the generate dep was touched on an E-- success');

  const r2 = await routeActionCodeRegen('forge-tutorial/07-data/show_colors', {
    resolveActionCode: async () => null,
    hasToken: true,
    generate: async () => { generateCalls += 1; return 'x'; },
  });
  assert.equal(r2.ok, true);
  assert.equal(generateCalls, 1, 'the fallback did not reach the generate dep');
});

test('1830 WIRED: routingDeps.generate consults the note and surfaces the notice', () => {
  // The half a pure-core assertion cannot see. Wiring it into
  // `routingDeps().generate` rather than at the two call sites is
  // deliberate: forgeSnippet's tail and dispatchModaBranch BOTH build
  // their deps from this one method, so a future third caller cannot
  // forget the warning. Same reasoning drain 1620 used for putting
  // mayMachineWriteFacet inside writeSourcePythonBack.
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const deps = main.slice(
    main.indexOf('private routingDeps(): RoutingDeps {'),
    main.indexOf('private async dispatchModaBranch('),
  );
  assert.match(deps, /shouldWarnRecipeCanonicalFallback\(/,
    'the fallback decision is not consulted in routingDeps');
  assert.match(deps, /recipeCanonicalFallbackNotice\(/,
    'the notice text is never built');
  assert.match(deps, /getFmFieldV2\(\s*body,\s*'source_facet'\s*\)/,
    "routingDeps never reads the note's source_facet");
  assert.equal(
    [...deps.matchAll(/shouldWarnRecipeCanonicalFallback\(/g)].length, 1,
    'exactly one decision point expected');
});
