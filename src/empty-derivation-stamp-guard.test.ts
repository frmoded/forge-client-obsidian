// Drain 2026-08-24-1600 §4-5 — a derivation stamp may never be the
// empty-string hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  EMPTY_STRING_SHA256,
  setFrontmatterField,
  getFrontmatterField,
} from './v2-note-core.ts';

const NOTE = '---\ntype: action\n---\n\n# Description\n\nx\n';

test('EMPTY_STRING_SHA256 really is sha256("")', () => {
  // NON-VACUITY for the constant itself: a typo'd literal would make
  // the guard below unreachable and every test here green for nothing.
  assert.equal(EMPTY_STRING_SHA256, createHash('sha256').update('').digest('hex'));
});

test('a derivation stamp refuses the empty-string hash', () => {
  for (const field of [
    'python_derived_from_recipe_hash',
    'recipe_derived_from_description_hash',
    'recipe_derived_from_source_hash',
    'python_derived_from_source_hash',
  ]) {
    const out = setFrontmatterField(NOTE, field, EMPTY_STRING_SHA256);
    assert.equal(out, NOTE, `${field} was stamped`);
    assert.equal(getFrontmatterField(out, field), null, field);
  }
});

test('a derivation stamp accepts a real hash', () => {
  // NON-VACUITY: a guard that refused everything would pass the test
  // above while breaking every honest stamp in the system.
  const real = createHash('sha256').update('Return 1.').digest('hex');
  const out = setFrontmatterField(NOTE, 'python_derived_from_recipe_hash', real);
  assert.equal(getFrontmatterField(out, 'python_derived_from_recipe_hash'), real);
});

test('a facet CONTENT hash may still be the empty-string hash', () => {
  // NON-VACUITY on the field list. An empty facet legitimately hashes
  // to sha256("") — barring that would be a different, wrong rule, and
  // is why the list is literal rather than a `*_hash` pattern.
  const out = setFrontmatterField(NOTE, 'recipe_hash', EMPTY_STRING_SHA256);
  assert.equal(getFrontmatterField(out, 'recipe_hash'), EMPTY_STRING_SHA256);
});

// ---------------------------------------------------------------------
// Drain 2026-08-24-1600, coupled symptom — CCQA check 5.
//
// The facet-aware exec hint (drain 0920) shipped in v0.2.365, yet the
// broken notes showed the old "open the note's # Python" wording. Not
// the P1's mechanism: `forgeSnippet`'s Description-canonical branch
// called runSnippet WITHOUT its canonicalLayer, so classifyForgeError
// saw undefined and took its designed fallback — on the one branch
// that is Description-canonical by construction.
// ---------------------------------------------------------------------

import fsMod from 'node:fs';
import pathMod from 'node:path';

function mainSrc(): string {
  return fsMod.readFileSync(pathMod.resolve(process.cwd(), 'src/main.ts'), 'utf8');
}

// ---------------------------------------------------------------------
// Drain 2026-08-25-2100 (plan F4) REPLACED the three tests that stood
// here. They pinned the exact `await this.runSnippet('Forge failed
// during execution', <facet>, file);` source lines inside forgeSnippet,
// asserting that each branch threaded its facet so the error hint
// pointed at the right section. F4 deletes those call sites outright:
// forging derives and hands off, and the run happens from the panel.
//
// The PROPERTY they guarded is not gone, and it was not weakened — it
// moved, and got stronger. `resolveHintFacet` (drain 2330) derives the
// facet from the note's own body whenever the caller passes none, on
// exactly the reasoning that a value each caller must remember to pass
// is one some future caller will forget. The panel's Run passes
// `undefined`, and the hint is still right.
//
// So these guard the mechanism rather than the call sites: a facet
// reaches the hint WITHOUT anyone threading it. That assertion would
// have failed before drain 2330 and fails again if the derivation is
// ever removed in favour of caller-threading.
// ---------------------------------------------------------------------

test('the error-hint facet is DERIVED, not threaded by the caller', () => {
  const src = mainSrc();
  assert.match(
    src, /displayFacetForRun = await resolveHintFacet\(/,
    'runSnippet must derive the hint facet from the note itself',
  );
  assert.match(
    src, /resolveHintFacet\(\s*canonicalLayer,\s*await this\.app\.vault\.read\(file\),/,
    'the derivation must read the note — an explicit facet still wins, '
    + 'but absence must fall through to the note, not to undefined',
  );
});

test('the sole run call site passes no facet, and that is fine', () => {
  // NON-VACUITY for the test above: if some caller were still threading
  // a facet, the derivation could be dead code and the guard vacuous.
  // The panel strip — the only run surface after F4 — passes none.
  const src = mainSrc();
  const calls = [...src.matchAll(/this\.runSnippet\(/g)];
  assert.equal(calls.length, 1, `expected one run call site, found ${calls.length}`);
  assert.match(
    src, /this\.runSnippet\(\s*\n\s*kwargs, 'Forge failed during execution', undefined, target/,
    'the strip must dispatch with no explicit facet, exercising the derivation',
  );
});

test('resolveHintFacet degrades to undefined rather than throwing', () => {
  // The run matters and the hint does not; a probe that threw would
  // take a run down for a nicety. Pinned here because F4 made the
  // derivation the ONLY source of the hint — before, a caller-threaded
  // facet covered for it.
  const core = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/hint-facet-core.ts'), 'utf8');
  assert.ok(
    /NOTHING HERE THROWS/.test(core),
    'hint-facet-core lost its no-throw contract',
  );
});
