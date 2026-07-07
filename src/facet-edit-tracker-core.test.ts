// v0.2.260 drain 1400 Option A — facet-edit-tracker tests.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  identifyEditedFacet,
  decideCanonicalWrite,
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

describe('decideCanonicalWrite', () => {
  it('editedFacet null → return null (no write)', () => {
    assert.equal(decideCanonicalWrite(null, 'description'), null);
    assert.equal(decideCanonicalWrite(null, 'synced'), null);
    assert.equal(decideCanonicalWrite(null, null), null);
  });

  it('editedFacet matches stored → null (idempotent)', () => {
    assert.equal(decideCanonicalWrite('description', 'description'), null);
    assert.equal(decideCanonicalWrite('recipe', 'recipe'), null);
    assert.equal(decideCanonicalWrite('python', 'python'), null);
  });

  it('editedFacet differs from stored → return editedFacet', () => {
    assert.equal(decideCanonicalWrite('description', 'python'), 'description');
    assert.equal(decideCanonicalWrite('recipe', 'description'), 'recipe');
    assert.equal(decideCanonicalWrite('python', 'synced'), 'python');
  });

  it('editedFacet + null stored → return editedFacet', () => {
    assert.equal(decideCanonicalWrite('description', null), 'description');
  });
});
