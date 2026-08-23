// Drain 2026-08-24-2330 — the routing signal is not the display hint.
//
// THE INCIDENT this is built from. The driver's `authoring/random_note`
// (Description-canonical, slot-bearing Recipe, nested id) failed every
// run on v0.2.366 with:
//
//   Empty or missing Python code for 'authoring/random_note'.
//
// Mechanism, established by probe before this file was written: drain
// 1600 threaded `canonicalLayer` into the Description-canonical
// branch's run call (92d83d7, `undefined` -> `canonicalLayer`) so the
// error message could name the right facet. But the SAME argument is
// also the engine's routing directive, and on that branch its value is
// 'description' by construction. The engine answers a 'description'
// routing signal with `return None` (executor.py:1006), so the run
// received no code at all and exec_python's empty-code guard fired.
//
// The fix is not "stop passing it" — the message needs it. It is that a
// DISPLAY HINT and a ROUTING DIRECTIVE are two different facts that
// were travelling in one argument.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { engineRoutingLayer } from './engine-routing-layer-core.ts';

test('description is never sent as a routing signal — the original incident', () => {
  // The exact value the Description-canonical branch holds. Sending it
  // is what produced "Empty or missing Python code".
  assert.equal(engineRoutingLayer('description'), undefined);
});

test('python IS still sent — the short-circuit it names is real and wanted', () => {
  // NON-VACUITY. A fix that dropped every layer would also silence the
  // python-canonical branch, whose whole point is telling the engine to
  // run `# Python` without parsing a Recipe that may not be E-- at all
  // (executor.py:994). That branch has passed 'python' since v0.2.252
  // and must keep working.
  assert.equal(engineRoutingLayer('python'), 'python');
});

test('recipe and synced pass through unchanged', () => {
  // The engine ignores both; they reach it today and nothing about this
  // drain should change what it sees.
  assert.equal(engineRoutingLayer('recipe'), 'recipe');
  assert.equal(engineRoutingLayer('synced'), 'synced');
});

test('an absent layer stays absent', () => {
  // Call sites that never had a layer must not acquire one.
  assert.equal(engineRoutingLayer(undefined), undefined);
  assert.equal(engineRoutingLayer(null), undefined);
});

// --- the wiring, pinned at the source -------------------------------
//
// The unit tests above prove the function is right. These prove it is
// USED, and used in the one place that matters. Without them the fix
// could be reverted at the call site and every test above would still
// pass — which is exactly how drain 1600 changed routing while meaning
// to change only a message.

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('the wire call sends the routed layer, never the raw facet', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('undefined, routingLayer,')).length,
    1,
    'computeSnippet must be called with routingLayer',
  );
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('undefined, canonicalLayer,')).length,
    0,
    'no compute call may pass the raw facet on the wire',
  );
});

test('the routed value is derived exactly once, from the raw facet', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('engineRoutingLayer(canonicalLayer)')).length,
    1,
  );
});

test('the error classifier never reads the ROUTED value', () => {
  // Drain 1600's actual goal, and the invariant that matters: the
  // cohort-facing message must know the note is Description-canonical
  // even though the engine must not be told. Routing drops
  // 'description'; the hint must not.
  //
  // Drain 2026-08-24-2370 — this used to assert `sourceFacet:
  // canonicalLayer` directly. The hint now reads `displayFacet`, which
  // is `canonicalLayer` when the caller supplied one and a derived
  // facet when it did not (two run entry points never supplied one —
  // the Inputs strip's play button being the one that bit CCQA). The
  // guarantee is unchanged and still asserted below; what moved is
  // which variable carries it.
  const classifyOnDisplay = MAIN.split('\n')
    .filter((l) => l.includes('sourceFacet: displayFacet')).length;
  assert.ok(
    classifyOnDisplay >= 2,
    `expected the classifier to read displayFacet, saw ${classifyOnDisplay} call(s)`,
  );
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('sourceFacet: routingLayer')).length,
    0,
    'the display hint must never be the routed value — it would lose "description"',
  );
  // And the derived value must be SEEDED from the raw facet, never the
  // routed one — otherwise `displayFacet` would inherit routing's
  // dropped 'description' and this whole guarantee would be hollow.
  const call = MAIN.slice(MAIN.indexOf('resolveHintFacet('));
  assert.ok(call.startsWith('resolveHintFacet('), 'resolveHintFacet must be called');
  const firstArg = call.slice('resolveHintFacet('.length, call.indexOf(',')).trim();
  assert.equal(firstArg, 'canonicalLayer');
});
