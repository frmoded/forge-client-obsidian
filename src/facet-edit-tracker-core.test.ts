// v0.2.260 drain 1400 Option A — facet-edit-tracker tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  identifyEditedFacet,
  decideSourceWrite,
  type FacetHashes,
} from './facet-edit-tracker-core.ts';

const H = (d: string, r: string, p: string): FacetHashes => ({ desc: d, recipe: r, python: p });

describe('identifyEditedFacet', () => {
  it('null cache → null (no baseline)', () => {
    assert.equal(identifyEditedFacet(H('a', 'b', 'c'), null), null);
  });

  it('cache matches current → null (nothing changed)', () => {
    assert.equal(identifyEditedFacet(H('a', 'b', 'c'), H('a', 'b', 'c')), null);
  });

  it('only Description hash changed → description', () => {
    assert.equal(identifyEditedFacet(H('X', 'b', 'c'), H('a', 'b', 'c')), 'description');
  });

  it('only Recipe hash changed → recipe', () => {
    assert.equal(identifyEditedFacet(H('a', 'Y', 'c'), H('a', 'b', 'c')), 'recipe');
  });

  it('only Python hash changed → python', () => {
    assert.equal(identifyEditedFacet(H('a', 'b', 'Z'), H('a', 'b', 'c')), 'python');
  });

  // CW-1800 (2026-07-06 driver call) — multi-facet tiebreak flipped
  // from downstream-wins to upstream-wins. External file rewrites
  // (cp / git checkout / sync tools) change all three facets
  // simultaneously; downstream-wins wrongly attributed them to Python
  // → canonical_facet: python → L45 short-circuit → Description +
  // Recipe rendered `— ignored` even though cohort didn't Python-edit.
  // Upstream-wins picks Description in the ambiguous case (matches
  // driver's cohort intuition: "external rewrites are Description-
  // authored until proven otherwise").

  it('Description + Python changed → description (upstream-wins, CW-1800)', () => {
    assert.equal(identifyEditedFacet(H('X', 'b', 'Z'), H('a', 'b', 'c')), 'description');
  });

  it('Description + Recipe changed → description (upstream-wins, CW-1800)', () => {
    assert.equal(identifyEditedFacet(H('X', 'Y', 'c'), H('a', 'b', 'c')), 'description');
  });

  it('Recipe + Python changed → recipe (upstream-wins, CW-1800)', () => {
    assert.equal(identifyEditedFacet(H('a', 'Y', 'Z'), H('a', 'b', 'c')), 'recipe');
  });

  it('all three changed → description (upstream-most, CW-1800)', () => {
    // Simulates external multi-facet rewrite (cp / git checkout / sync).
    // Pre-CW-1800 this returned 'python' via downstream-wins.
    assert.equal(identifyEditedFacet(H('X', 'Y', 'Z'), H('a', 'b', 'c')), 'description');
  });

  it('driver case: fresh Description edit on note with residual multi-facet drift → description', () => {
    // Simulates driver's slow_burn scenario. Cache captured the current
    // (drifted-across-multiple-facets) state on plugin load. User then
    // types "x" in Description. Only desc hash changes vs cache;
    // recipe + python bodies still match cache. Result: 'description'.
    const cachedOnLoad = H('desc_drifted', 'recipe_drifted', 'python_drifted');
    const afterUserEdit = H('desc_drifted_more', 'recipe_drifted', 'python_drifted');
    assert.equal(identifyEditedFacet(afterUserEdit, cachedOnLoad), 'description');
  });
});

describe('decideSourceWrite', () => {
  it('editedFacet null → return null (no write)', () => {
    assert.equal(decideSourceWrite(null, 'description'), null);
    assert.equal(decideSourceWrite(null, 'synced'), null);
    assert.equal(decideSourceWrite(null, null), null);
  });

  it('editedFacet matches stored → null (idempotent)', () => {
    assert.equal(decideSourceWrite('description', 'description'), null);
    assert.equal(decideSourceWrite('recipe', 'recipe'), null);
    assert.equal(decideSourceWrite('python', 'python'), null);
  });

  it('editedFacet differs from stored → return editedFacet', () => {
    assert.equal(decideSourceWrite('description', 'python'), 'description');
    assert.equal(decideSourceWrite('recipe', 'description'), 'recipe');
    assert.equal(decideSourceWrite('python', 'synced'), 'python');
  });

  it('editedFacet + null stored → return editedFacet', () => {
    assert.equal(decideSourceWrite('description', null), 'description');
  });
});

// ---------------------------------------------------------------
// Drain 2026-08-25-1060 §1 — CW-1800 refinement, driver adopted (a).
//
// When a multi-facet external change lands and the stored
// `source_facet` names a facet that did NOT change, keep the stored
// value. The note's own declaration survives a rewrite that did not
// touch the facet it points at.
//
// This is the refinement drain 1000 offered and did not take
// unilaterally, because CW-1800 was a driver call. It is now adopted.
//
// The trade, accepted on the record: a genuine hand edit spanning
// Recipe AND Python on a Description-sourced note also keeps
// `description`, where before it became `recipe`. CW-1800's own
// comment calls multi-facet human edits rare and external rewrites the
// common case, which is the reasoning behind taking that trade.
// ---------------------------------------------------------------

import { changedFacets, decideSourceWriteFromChange } from './facet-edit-tracker-core.ts';

describe('CW-1800 refinement (drain 1060)', () => {

  it('1060: the cheer.md shape now KEEPS description', () => {
  // A `git restore` of a note carrying machine write-back: Recipe and
  // Python move, Description does not. Drain 1000 reproduced this
  // against the real bodies and it flipped description -> recipe.
  const changed = changedFacets(
    { desc: 'D', recipe: 'R2', python: 'P2' },
    { desc: 'D', recipe: 'R1', python: 'P1' },
  );
  assert.deepEqual(changed, ['recipe', 'python']);
  assert.equal(decideSourceWriteFromChange(changed, 'description'), null,
    'Description did not move, so the note keeps its own declaration');
});

  it('1060: a single-facet edit still moves the source', () => {
  // The ordinary case must be untouched — someone editing the Recipe
  // of a Description-sourced note still makes the Recipe the source.
  assert.equal(decideSourceWriteFromChange(['recipe'], 'description'), 'recipe');
  assert.equal(decideSourceWriteFromChange(['python'], 'description'), 'python');
  assert.equal(decideSourceWriteFromChange(['description'], 'recipe'), 'description');
});

  it('1060: multi-facet change that DOES touch the stored source still moves', () => {
  // Description moved too, so the declaration is no longer untouched
  // and upstream-wins applies as before.
  assert.equal(decideSourceWriteFromChange(['description', 'python'], 'description'), null,
    'upstream-most changed IS description — same as stored, so no write');
    // stored='python' AND python moved -> carve-out does not apply.
    assert.equal(decideSourceWriteFromChange(['description', 'python'], 'python'), 'description');
    // Mirror case: python UNTOUCHED keeps the declaration. This line
    // previously asserted `['description','recipe'], 'python'` ->
    // 'description', which was wrong about its own premise (python is
    // not in that change set, so the carve-out applies). The test
    // failing is what caught it.
    assert.equal(decideSourceWriteFromChange(['description', 'recipe'], 'python'), null);
});

  it('1060: no stored source means the carve-out cannot apply', () => {
  // A note with no `source_facet` yet has no declaration to protect.
  assert.equal(decideSourceWriteFromChange(['recipe', 'python'], null), 'recipe');
});

  it('1060: nothing changed means no write', () => {
  assert.equal(decideSourceWriteFromChange([], 'description'), null);
});

  it('1060: THE PIN SURVIVES — a whole-file rewrite still never lands on python', () => {
  // Drain 1000's guarantee, re-asserted through the new path. This is
  // the value drain 0110 promotes to engine routing, so an unprompted
  // flip here would change which code runs.
  for (const stored of ['description', 'recipe', 'python', null] as const) {
    const out = decideSourceWriteFromChange(['description', 'recipe', 'python'], stored);
    assert.notEqual(out, 'python',
      `all three facets moved with stored=${stored} — must never resolve to python`);
  }
  // Non-vacuity: python IS reachable when it is the sole facet that moved.
  assert.equal(decideSourceWriteFromChange(['python'], 'description'), 'python');
});
});
