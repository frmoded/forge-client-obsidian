// Drain 2026-08-24-2370 — the facet-aware hint must reach every run.
//
// CCQA check-5, three times on v0.2.366: a genuinely-untouched
// Description-canonical note (`source_facet: description` verified by
// file read) raising ZeroDivisionError still told the cohort
// "Fix: Open the note's # Python section…".
//
// MECHANISM, found before writing this file. It is NOT that generic
// exceptions miss the classifier — the engine wraps them, so a
// ZeroDivisionError arrives as SnippetExecError and hits the
// facet-aware rule. The hint is right only when `sourceFacet` is
// SUPPLIED, and two run entry points never supplied it:
//
//   main.ts:1437  "Run only (active snippet)" — `this.runSnippet()`
//   main.ts:5552  THE INPUTS STRIP's ▶ — `runSnippet(..., undefined, …)`
//
// The strip is the one that matters: CCQA's note declares a `scale`
// input, so the strip is exactly how it gets run. Drain 0920/1700's
// wording was never wrong — it was unreachable from the button the
// cohort actually presses.
//
// The repair is the 2330 lesson again: stop asking each call site to
// remember, and derive it once at the shared door.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveHintFacet } from './hint-facet-core.ts';
import { classifyForgeError, EXEC_FIX_BY_FACET, EXEC_FIX_DEFAULT }
  from './forge-error-core.ts';

const V2_BODY = '# Description\n\nx\n\n# Recipe\n\nReturn 1.\n\n# Python\n\nz\n';
const V1_BODY = '# English\n\nPrint "hi".\n\n# Python\n\nz\n';

const deps = (source: any, routable = true) => ({
  isV2RoutableShape: () => routable,
  whichLayerIsSource: async () => source,
});

test('an explicit facet from the caller always wins', async () => {
  // The dedicated python-canonical branch passes 'python' deliberately.
  // Derivation must never second-guess a caller that knows.
  assert.equal(
    await resolveHintFacet('python', V2_BODY, deps('description')),
    'python',
  );
});

test('a missing facet is derived — the strip and Cmd-P paths', async () => {
  assert.equal(await resolveHintFacet(undefined, V2_BODY, deps('description')), 'description');
  assert.equal(await resolveHintFacet(undefined, V2_BODY, deps('synced')), 'synced');
});

test('a non-V2 note stays undefined — drain 1600 was right about that', async () => {
  // 1600 declined to widen a variable's scope to satisfy a hint on the
  // V1/free-English tail, calling `undefined` the honest value for
  // "facet unknown". It still is: a note with no facets has no source
  // facet, and the hint table's fallback is written for this case.
  // What changed is that for a V2 note the facet is KNOWABLE, so
  // saying "unknown" there was never honest.
  assert.equal(await resolveHintFacet(undefined, V1_BODY, deps('description', false)), undefined);
});

test('a probe that throws degrades to undefined, not to a wrong facet', async () => {
  // A hint is a nicety; a run is not. Nothing here may throw into the
  // run path, and guessing a facet would be worse than the generic
  // wording.
  const throwing = {
    isV2RoutableShape: () => true,
    whichLayerIsSource: async () => { throw new Error('probe exploded'); },
  };
  assert.equal(await resolveHintFacet(undefined, V2_BODY, throwing), undefined);
});

// --- the end-to-end fact CCQA reported ------------------------------

test("CCQA's case: ZeroDivisionError on a description-canonical note", async () => {
  // The engine wraps runtime exceptions, so this is the real shape.
  const raw = 'Traceback (most recent call last):\n  File "<exec>", line 2\n'
    + 'forge.core.executor.SnippetExecError: division by zero';
  const facet = await resolveHintFacet(undefined, V2_BODY, deps('description'));
  const err = classifyForgeError({ errorMsg: raw, sourceFacet: facet });
  assert.equal(err?.suggested_fix, EXEC_FIX_BY_FACET.description);
  assert.match(err!.suggested_fix, /# Description/);
  assert.doesNotMatch(err!.suggested_fix, /Open the note's # Python/);
});

test('python-canonical still points at Python', async () => {
  const raw = 'forge.core.executor.SnippetExecError: division by zero';
  const facet = await resolveHintFacet(undefined, V2_BODY, deps('python'));
  assert.equal(
    classifyForgeError({ errorMsg: raw, sourceFacet: facet })?.suggested_fix,
    EXEC_FIX_BY_FACET.python,
  );
});

test('fully-synced gets the approved synced wording', async () => {
  const raw = 'forge.core.executor.SnippetExecError: division by zero';
  const facet = await resolveHintFacet(undefined, V2_BODY, deps('synced'));
  const fix = classifyForgeError({ errorMsg: raw, sourceFacet: facet })?.suggested_fix;
  assert.equal(fix, EXEC_FIX_BY_FACET.synced);
  assert.match(fix!, /edit whichever one you want/);
});

test('NON-VACUITY: the empty-code class keeps working', async () => {
  // §2's explicit requirement. That class was the one that DID reach
  // facet-aware selection; this drain must not disturb it.
  const raw = "forge.core.executor.SnippetExecError: Empty or missing Python "
    + "code for 'authoring/random_note'.";
  const facet = await resolveHintFacet(undefined, V2_BODY, deps('description'));
  assert.equal(
    classifyForgeError({ errorMsg: raw, sourceFacet: facet })?.suggested_fix,
    EXEC_FIX_BY_FACET.description,
  );
});

test('NON-VACUITY: an unknown facet still gets a hint, never "undefined"', async () => {
  const raw = 'forge.core.executor.SnippetExecError: division by zero';
  const err = classifyForgeError({ errorMsg: raw, sourceFacet: undefined });
  assert.equal(err?.suggested_fix, EXEC_FIX_DEFAULT);
  assert.doesNotMatch(err!.suggested_fix, /undefined/);
});

test('NON-VACUITY: resolution errors stay facet-blind', async () => {
  // A wrong NAME reads the same whichever facet is canonical, and
  // drain 0920 said so explicitly. If this started varying by facet,
  // the coverage widening had gone too far.
  const raw = 'forge.core.executor.SnippetResolutionError: no snippet named "nope"';
  const a = classifyForgeError({ errorMsg: raw, sourceFacet: 'description' });
  const b = classifyForgeError({ errorMsg: raw, sourceFacet: 'python' });
  assert.equal(a?.suggested_fix, b?.suggested_fix);
});

// --- the wiring, pinned at the source -------------------------------

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('derivation happens once, at the shared door', () => {
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('resolveHintFacet(')).length,
    1,
    'one derivation, in runSnippet — not one per call site',
  );
});

test('both classifier calls read the derived facet', () => {
  // If either kept reading the raw `canonicalLayer`, the strip's ▶
  // would still show the generic hint on one of the two error paths
  // (thrown vs non-2xx) — which is the hardest kind of half-fix to
  // notice.
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('sourceFacet: displayFacet')).length,
    2,
  );
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('sourceFacet: canonicalLayer')).length,
    0,
  );
});

test('routing is NOT taken from the derived facet', () => {
  // Deliberate scope limit. §1 asks for hint coverage; letting a
  // derived facet drive `engineRoutingLayer` would change which facet
  // the ENGINE runs for strip and Cmd-P launches, which is a
  // behaviour change nobody asked for.
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('engineRoutingLayer(canonicalLayer)')).length,
    1,
  );
  assert.equal(
    MAIN.split('\n').filter((l) => l.includes('engineRoutingLayer(displayFacet)')).length,
    0,
  );
});

// --- §3, the cosmetic ------------------------------------------------

test('a stale strip dims its title as well as its body', () => {
  // CCQA check 2: "functionally fixed, visually not". The dimming rule
  // named only `.forge-panel-inputs-body`, and the header is that
  // element's SIBLING — so the stale note's name kept rendering at
  // full opacity in the header's `font-weight: 600`, looking exactly
  // like an active strip.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.slice(
    css.indexOf('.forge-panel-inputs.is-stale'),
    css.indexOf('.forge-panel-inputs .forge-panel-inputs-actions'),
  );
  assert.match(rule, /\.forge-panel-inputs\.is-stale \.forge-panel-inputs-title/);
  assert.match(rule, /opacity:\s*0\.55/);
});

test('the collapse toggle is NOT dimmed', () => {
  // It still works while the strip is stale. Dimming a live control to
  // advertise a dead one trades one wrong signal for another.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.slice(
    css.indexOf('.forge-panel-inputs.is-stale'),
    css.indexOf('.forge-panel-inputs .forge-panel-inputs-actions'),
  );
  assert.doesNotMatch(rule, /forge-panel-inputs-toggle/);
});
