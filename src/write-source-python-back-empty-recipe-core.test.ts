// v0.2.285 drain 1700 — empty-Recipe detection tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkEmptyRecipeForTranspile } from './write-source-python-back-empty-recipe-core.ts';

const EXPECTED_NOTICE =
  'Fresh note: no valid Recipe to transpile. Try refining the Description or check the previous notice from Recipe generation.';

test('drain-1700 empty-recipe: null body → skip transpile + surface notice', () => {
  const r = checkEmptyRecipeForTranspile(null);
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: undefined body → skip', () => {
  const r = checkEmptyRecipeForTranspile(undefined);
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: empty string → skip', () => {
  const r = checkEmptyRecipeForTranspile('');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: whitespace-only body → skip', () => {
  const r = checkEmptyRecipeForTranspile('\n\n   \n\t\n');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: single # comment → skip', () => {
  const r = checkEmptyRecipeForTranspile('# missing chip: foo');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: multiple # comments + blank lines → skip', () => {
  const r = checkEmptyRecipeForTranspile(
    '# missing chip: foo\n\n# missing chip: bar\n\n',
  );
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: single Return statement → transpile', () => {
  const r = checkEmptyRecipeForTranspile('Return 42.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: valid Let + Return → transpile', () => {
  const r = checkEmptyRecipeForTranspile(
    'Let x = Call [[chorus]].\nReturn x.',
  );
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: valid stmt + comment → transpile (comments are metadata)', () => {
  const r = checkEmptyRecipeForTranspile(
    '# valid annotation\nLet x = Call [[chorus]].\nReturn x.',
  );
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: shorthand-call statement → transpile', () => {
  const r = checkEmptyRecipeForTranspile('[[show_score]] score.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: bogus prose → transpile (falls through to E-- parse error)', () => {
  // Non-empty and non-comment → shouldTranspile true; E-- will reject
  // this downstream. This check is a gap-preventer for EMPTY, not a
  // syntax validator (that's sanitizeLlmRecipe's job upstream).
  const r = checkEmptyRecipeForTranspile('Let me think about this.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

// ---------------------------------------------------------------
// drain 2026-07-30-1030 — the same predicate now gates COMPUTE, not
// just transpile.
//
// Driver's capture on a fresh Description-only note showed
// `[fresh-note-empty-recipe] skipping transpile` immediately followed
// by `Forge Compute → … Result: {result: undefined, stdout: ''}`:
// the guard stopped the transpile and then the run went ahead anyway
// against an empty snippet. main.ts now consults this same pure-core
// before runSnippet, so the two halves cannot disagree about what
// "empty" means.
//
// These pin the predicate for exactly the bodies the fresh-note path
// produces. They are the unit-testable half; the wiring itself is
// covered by the driver smoke in the drain's acceptance #4/#6.

test('drain-1030 compute-gate: sanitize-fail leaves empty Recipe → no compute', () => {
  // CW-2200 sanitize-fail on a FRESH note: prior Recipe is '' because
  // there is no prior Recipe. This is the exact driver-reported state.
  const r = checkEmptyRecipeForTranspile('');
  assert.equal(r.shouldTranspile, false, 'must not compute on empty Recipe');
  assert.ok(r.noticeText, 'guidance text must exist for the transpile half to surface');
});

test('drain-1030 compute-gate: LLM failure leaves Recipe absent → no compute', () => {
  // _llmGenerateRecipe returned null (token missing, network error,
  // no active view). Nothing was written; extractRecipeSection yields
  // null on a note with no # Recipe section at all.
  const r = checkEmptyRecipeForTranspile(null);
  assert.equal(r.shouldTranspile, false, 'must not compute when Recipe never materialized');
});

test('drain-1030 compute-gate: successful LLM write → compute proceeds', () => {
  // Gate passed upstream, sanitized Recipe written back. The run must
  // NOT be suppressed — this is the regression the compute-gate could
  // plausibly introduce, so it is pinned explicitly.
  const r = checkEmptyRecipeForTranspile('Let x be Call [[diatonic_scale]]("C").\nReturn x.');
  assert.equal(r.shouldTranspile, true, 'populated Recipe must still run');
  assert.equal(r.noticeText, null);
});

test('drain-1030 compute-gate: transpile gate and compute gate cannot disagree', () => {
  // Both call sites pass the SAME body through the SAME function, so
  // agreement is structural. This pins it against a future refactor
  // that gives one side its own notion of empty.
  const bodies = [
    '', '   ', '\n\n', '# just a comment', '# a\n\n# b',
    'Return 1.', 'Let x be 1.', '[[show_score]] s.', 'prose line',
  ];
  for (const body of bodies) {
    const transpileGate = checkEmptyRecipeForTranspile(body).shouldTranspile;
    const computeGate = checkEmptyRecipeForTranspile(body).shouldTranspile;
    assert.equal(computeGate, transpileGate, `gates disagreed on ${JSON.stringify(body)}`);
  }
});
