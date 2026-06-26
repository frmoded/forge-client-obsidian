// v0.2.196 — facet-hash-core tests for the 3-layer canonical-state
// machine.
//
// Coverage:
// - computeFacetHash: same shape as computeDescriptionHash; stable
//   across whitespace-only edits.
// - whichLayerIsCanonical: synced / description / recipe / python
//   with downstream priority.
// - detectStaleFacets: stale-set per canonical layer.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { TextEncoder } from 'node:util';

// Polyfills for `crypto.subtle.digest` + `TextEncoder` in the Node
// test environment. computeDescriptionHash uses both.
import { webcrypto } from 'node:crypto';
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}
if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = TextEncoder as any;
}

import { computeDescriptionHash } from './description-hash-core.ts';
import {
  computeFacetHash,
  whichLayerIsCanonical,
  detectStaleFacets,
  type CanonicalLayer,
} from './facet-hash-core.ts';


// ---------- computeFacetHash matches computeDescriptionHash ----------

describe('computeFacetHash', () => {
  it('produces the same digest as computeDescriptionHash', async () => {
    const a = await computeFacetHash('hello\nworld\n');
    const b = await computeDescriptionHash('hello\nworld\n');
    assert.equal(a, b);
  });

  it('normalizes trailing whitespace per line', async () => {
    const a = await computeFacetHash('hello   \nworld   \n');
    const b = await computeFacetHash('hello\nworld\n');
    assert.equal(a, b);
  });

  it('null and empty produce the same digest', async () => {
    const a = await computeFacetHash(null);
    const b = await computeFacetHash('');
    assert.equal(a, b);
  });
});


// ---------- whichLayerIsCanonical -----------------------------------

const _helpers = (
  desc: string,
  recipe: string | null,
  python: string | null,
  storedDesc: string | null,
  storedRecipe: string | null,
  storedPython: string | null,
) => ({
  extractDescription: () => desc,
  extractRecipeSection: () => recipe,
  extractPythonSection: () => python,
  getFrontmatterField: (_body: string, key: string) => {
    if (key === 'description_hash') return storedDesc;
    if (key === 'recipe_hash') return storedRecipe;
    if (key === 'python_hash') return storedPython;
    return null;
  },
});


describe('whichLayerIsCanonical', () => {
  it('returns "synced" when all stored hashes match current content',
    async () => {
      const d = 'hello';
      const r = 'Print "hi".';
      const p = 'def compute(c): pass';
      const dh = await computeFacetHash(d);
      const rh = await computeFacetHash(r);
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsCanonical(
        'irrelevant_body',
        _helpers(d, r, p, dh, rh, ph),
      );
      assert.equal(result, 'synced');
    });

  it('returns "description" when only Description hash mismatches',
    async () => {
      const d = 'hello edited';
      const r = 'Print "hi".';
      const p = 'def compute(c): pass';
      // Stored hashes match recipe + python but NOT new description.
      const dhStored = await computeFacetHash('hello');
      const rh = await computeFacetHash(r);
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsCanonical(
        'body',
        _helpers(d, r, p, dhStored, rh, ph),
      );
      assert.equal(result, 'description');
    });

  it('returns "recipe" when Recipe hash mismatches', async () => {
    const d = 'hello';
    const r = 'Print "EDITED".';
    const p = 'def compute(c): pass';
    const dh = await computeFacetHash(d);
    const rhStored = await computeFacetHash('Print "hi".');
    const ph = await computeFacetHash(p);
    const result = await whichLayerIsCanonical(
      'body',
      _helpers(d, r, p, dh, rhStored, ph),
    );
    assert.equal(result, 'recipe');
  });

  it('returns "python" when Python hash mismatches', async () => {
    const d = 'hello';
    const r = 'Print "hi".';
    const p = 'def compute(c): pass  # hand-edited';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash(r);
    const phStored = await computeFacetHash('def compute(c): pass');
    const result = await whichLayerIsCanonical(
      'body',
      _helpers(d, r, p, dh, rh, phStored),
    );
    assert.equal(result, 'python');
  });

  it('python wins over recipe when BOTH mismatch (downstream priority)',
    async () => {
      const d = 'hello';
      const r = 'edited recipe';
      const p = 'edited python';
      const dh = await computeFacetHash(d);
      const rhStored = await computeFacetHash('old recipe');
      const phStored = await computeFacetHash('old python');
      const result = await whichLayerIsCanonical(
        'body',
        _helpers(d, r, p, dh, rhStored, phStored),
      );
      assert.equal(result, 'python');
    });

  it('recipe wins over description when those two mismatch (downstream)',
    async () => {
      const d = 'edited desc';
      const r = 'edited recipe';
      const p = 'matching python';
      const dhStored = await computeFacetHash('old desc');
      const rhStored = await computeFacetHash('old recipe');
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsCanonical(
        'body',
        _helpers(d, r, p, dhStored, rhStored, ph),
      );
      assert.equal(result, 'recipe');
    });

  it('returns "synced" when stored hashes are absent (fresh note)',
    async () => {
      const result = await whichLayerIsCanonical(
        'body',
        _helpers('anything', 'anything', 'anything', null, null, null),
      );
      assert.equal(result, 'synced');
    });

  it('absent stored hash counts as match (per-facet)', async () => {
    // Only description_hash stamped; recipe + python edits won't
    // surface canonical (their hashes are absent).
    const d = 'desc';
    const dh = await computeFacetHash(d);
    const result = await whichLayerIsCanonical(
      'body',
      _helpers(d, 'unstamped_recipe', 'unstamped_python', dh, null, null),
    );
    assert.equal(result, 'synced');
  });
});


// ---------- detectStaleFacets ----------------------------------------

describe('detectStaleFacets', () => {
  it('returns empty set when synced', async () => {
    const d = 'hello';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash('r');
    const ph = await computeFacetHash('p');
    const stale = await detectStaleFacets(
      'body',
      _helpers(d, 'r', 'p', dh, rh, ph),
    );
    assert.equal(stale.size, 0);
  });

  it('description canonical → recipe + python stale', async () => {
    const d = 'edited';
    const dhStored = await computeFacetHash('orig');
    const rh = await computeFacetHash('r');
    const ph = await computeFacetHash('p');
    const stale = await detectStaleFacets(
      'body',
      _helpers(d, 'r', 'p', dhStored, rh, ph),
    );
    assert.equal(stale.has('recipe'), true);
    assert.equal(stale.has('python'), true);
    assert.equal(stale.has('description'), false);
  });

  it('recipe canonical → python stale; description NOT stale', async () => {
    const dh = await computeFacetHash('d');
    const rhStored = await computeFacetHash('orig');
    const ph = await computeFacetHash('p');
    const stale = await detectStaleFacets(
      'body',
      _helpers('d', 'edited', 'p', dh, rhStored, ph),
    );
    assert.equal(stale.has('python'), true);
    assert.equal(stale.has('description'), false);
    assert.equal(stale.has('recipe'), false);
  });

  it('python canonical → description + recipe both stale', async () => {
    const dh = await computeFacetHash('d');
    const rh = await computeFacetHash('r');
    const phStored = await computeFacetHash('orig');
    const stale = await detectStaleFacets(
      'body',
      _helpers('d', 'r', 'edited python', dh, rh, phStored),
    );
    assert.equal(stale.has('description'), true);
    assert.equal(stale.has('recipe'), true);
    assert.equal(stale.has('python'), false);
  });
});
