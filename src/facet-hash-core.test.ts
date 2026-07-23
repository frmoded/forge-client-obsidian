// v0.2.196 — facet-hash-core tests for the 3-layer canonical-state
// machine.
//
// Coverage:
// - computeFacetHash: same shape as computeDescriptionHash; stable
//   across whitespace-only edits.
// - whichLayerIsSource: synced / description / recipe / python
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
  whichLayerIsSource,
  detectStaleFacets,
  getSourceFacet,
  computeSyncState,
  type SourceLayer,
  type SyncState,
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


// ---------- whichLayerIsSource -----------------------------------

const _helpers = (
  desc: string,
  recipe: string | null,
  python: string | null,
  storedDesc: string | null,
  storedRecipe: string | null,
  storedPython: string | null,
  storedSource: string | null = null,
) => ({
  extractDescription: () => desc,
  extractRecipeSection: () => recipe,
  extractPythonSection: () => python,
  getFrontmatterField: (_body: string, key: string) => {
    if (key === 'description_hash') return storedDesc;
    if (key === 'recipe_hash') return storedRecipe;
    if (key === 'python_hash') return storedPython;
    // v0.2.286 — primary field is `source_facet`; `getSourceFacet`
    // reads either name so legacy tests keep working via the
    // fallback. Tests exercising the fallback path pass their
    // stored value via `_legacyHelpers` below.
    if (key === 'source_facet') return storedSource;
    if (key === 'canonical_facet') return null;
    return null;
  },
});

// v0.2.286 back-compat helper: returns the stored value under the
// LEGACY `canonical_facet` key (with `source_facet` absent). Exercises
// the read-tolerance path for pre-migration notes.
const _legacyHelpers = (
  desc: string,
  recipe: string | null,
  python: string | null,
  storedDesc: string | null,
  storedRecipe: string | null,
  storedPython: string | null,
  storedLegacySource: string | null = null,
) => ({
  extractDescription: () => desc,
  extractRecipeSection: () => recipe,
  extractPythonSection: () => python,
  getFrontmatterField: (_body: string, key: string) => {
    if (key === 'description_hash') return storedDesc;
    if (key === 'recipe_hash') return storedRecipe;
    if (key === 'python_hash') return storedPython;
    if (key === 'source_facet') return null;
    if (key === 'canonical_facet') return storedLegacySource;
    return null;
  },
});


describe('whichLayerIsSource', () => {
  it('returns "synced" when all stored hashes match current content',
    async () => {
      const d = 'hello';
      const r = 'Print "hi".';
      const p = 'def compute(c): pass';
      const dh = await computeFacetHash(d);
      const rh = await computeFacetHash(r);
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsSource(
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
      const result = await whichLayerIsSource(
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
    const result = await whichLayerIsSource(
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
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dh, rh, phStored),
    );
    assert.equal(result, 'python');
  });

  it('recipe wins over python when BOTH mismatch (upstream priority, v0.2.252)',
    async () => {
      // v0.2.252 drain 1000 §3.2 — flipped from downstream-wins.
      // Rationale: source-most edit is the intent driving next forge;
      // downstream residue from prior smoke iterations must not hide
      // the upstream edit.
      const d = 'hello';
      const r = 'edited recipe';
      const p = 'edited python';
      const dh = await computeFacetHash(d);
      const rhStored = await computeFacetHash('old recipe');
      const phStored = await computeFacetHash('old python');
      const result = await whichLayerIsSource(
        'body',
        _helpers(d, r, p, dh, rhStored, phStored),
      );
      assert.equal(result, 'recipe');
    });

  it('description wins over recipe when those two mismatch (upstream, v0.2.252)',
    async () => {
      const d = 'edited desc';
      const r = 'edited recipe';
      const p = 'matching python';
      const dhStored = await computeFacetHash('old desc');
      const rhStored = await computeFacetHash('old recipe');
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsSource(
        'body',
        _helpers(d, r, p, dhStored, rhStored, ph),
      );
      assert.equal(result, 'description');
    });

  it('description wins when Description + Recipe + Python all mismatch (v0.2.252 driver scenario)',
    async () => {
      // Driver 2026-07-03 slow_burn scenario reproduced: Description
      // edited in-session; Recipe body carries "a " kwarg drift from
      // prior smoke; Python has post-fix hand-edit. Pre-v0.2.252
      // routed 'python' (downstream-wins); v0.2.252 routes 'description'
      // (upstream-wins) so the cohort's Description edit is honored.
      const d = 'edited in session';
      const r = 'Let x = a foo=1.';           // buggy kwarg
      const p = 'def compute(c): return 42';   // hand-tuned
      const dhStored = await computeFacetHash('original description');
      const rhStored = await computeFacetHash('Let x = foo=1.');
      const phStored = await computeFacetHash('def compute(c): return 0');
      const result = await whichLayerIsSource(
        'body',
        _helpers(d, r, p, dhStored, rhStored, phStored),
      );
      assert.equal(result, 'description');
    });

  it('returns "synced" when stored hashes are absent (fresh note)',
    async () => {
      const result = await whichLayerIsSource(
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
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, 'unstamped_recipe', 'unstamped_python', dh, null, null),
    );
    assert.equal(result, 'synced');
  });

  // ---------- v0.2.256 drain 1200: stored source_facet (v0.2.286 rename) -------------

  it('stored source_facet: "recipe" is returned even when Description also drifts', async () => {
    // Driver's cohort intuition: whatever was hand-edited most recently
    // is the canonical layer. Under stored-not-inferred, that decision
    // is recorded in the frontmatter field. Hash inference no longer
    // overrides it.
    const d = 'both edited';
    const r = 'recipe edited later';
    const p = 'python matches';
    const dhStored = await computeFacetHash('old desc');
    const rhStored = await computeFacetHash('old recipe');
    const ph = await computeFacetHash(p);
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dhStored, rhStored, ph, 'recipe'),
    );
    assert.equal(result, 'recipe');
  });

  it('stored source_facet: "python" with Python-drift honored', async () => {
    // Python was hand-edited (pythonMismatch = true); stored field
    // agrees. Detection returns 'python'.
    const d = 'anything';
    const r = 'anything';
    const p = 'edited python';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash(r);
    const phStored = await computeFacetHash('old python');
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dh, rh, phStored, 'python'),
    );
    assert.equal(result, 'python');
  });

  it('stored source_facet: "synced" honored', async () => {
    const d = 'anything';
    const r = 'anything';
    const p = 'anything';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash(r);
    const ph = await computeFacetHash(p);
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dh, rh, ph, 'synced'),
    );
    assert.equal(result, 'synced');
  });

  it('external multi-facet edit: stored source_facet points at facet with no drift; another facet drifted → flip via upstream-wins fallback', async () => {
    // Sample scenario: source_facet: "description" is stored, but
    // Description's body matches its stored hash while Recipe drifted
    // (external edit via git / sed). Detection flips to 'recipe'.
    const d = 'desc unchanged';
    const r = 'recipe externally edited';
    const p = 'python matches';
    const dh = await computeFacetHash(d);
    const rhStored = await computeFacetHash('old recipe');
    const ph = await computeFacetHash(p);
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dh, rhStored, ph, 'description'),
    );
    assert.equal(result, 'recipe');
  });

  it('invalid source_facet value falls through to hash inference', async () => {
    const d = 'edited';
    const dhStored = await computeFacetHash('original');
    const rh = await computeFacetHash('r');
    const ph = await computeFacetHash('p');
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, 'r', 'p', dhStored, rh, ph, 'bogus_value'),
    );
    assert.equal(result, 'description');
  });

  it('external multi-facet edit: stored "description" + no drift anywhere → return synced', async () => {
    // Edge case: stored says description, but bodies all match hashes.
    // Note is genuinely synced. Honor that.
    const d = 'x';
    const r = 'y';
    const p = 'z';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash(r);
    const ph = await computeFacetHash(p);
    const result = await whichLayerIsSource(
      'body',
      _helpers(d, r, p, dh, rh, ph, 'description'),
    );
    // Description matches storedDesc → no drift on it.
    // Same for recipe, python.
    // Stored canonical says description → not synced. But detection
    // finds no actual drift → returns synced per the external-edit
    // fallback path.
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

  it('recipe canonical → description + python both stale (symmetric per S9 v11.3)', async () => {
    // Drain 2026-07-03-0100: constitution S9 v11.3 spec — "non-canonical
    // facets" plural. Recipe-canonical implies BOTH Description AND
    // Python are stale (documentation only, not driving runtime).
    // Prior implementation only marked Python stale, missing Description.
    const dh = await computeFacetHash('d');
    const rhStored = await computeFacetHash('orig');
    const ph = await computeFacetHash('p');
    const stale = await detectStaleFacets(
      'body',
      _helpers('d', 'edited', 'p', dh, rhStored, ph),
    );
    assert.equal(stale.has('description'), true);
    assert.equal(stale.has('python'), true);
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


// ---------- v0.2.286 drain 1600: source_facet migration ---------------

describe('getSourceFacet', () => {
  const makeFmReader = (fields: Record<string, string | null>) =>
    (_b: string, k: string) => fields[k] ?? null;

  it('reads `source_facet` when only that field is present', () => {
    const r = makeFmReader({ source_facet: 'recipe' });
    assert.equal(getSourceFacet('body', r), 'recipe');
  });

  it('reads legacy `canonical_facet` when `source_facet` is absent', () => {
    // Migration read-tolerance: pre-v0.2.286 notes must still be
    // interpretable until the plugin flushes their frontmatter.
    const r = makeFmReader({ canonical_facet: 'description' });
    assert.equal(getSourceFacet('body', r), 'description');
  });

  it('prefers `source_facet` when both fields are present (transitional)',
    () => {
      // If both fields somehow linger (e.g., an external editor wrote
      // canonical_facet AFTER the plugin migrated to source_facet),
      // trust the new name. The write path deletes canonical_facet on
      // any facet write, so this transitional state resolves lazily.
      const r = makeFmReader({
        source_facet: 'python',
        canonical_facet: 'description',
      });
      assert.equal(getSourceFacet('body', r), 'python');
    });

  it('returns null when neither field is present (fresh note)', () => {
    const r = makeFmReader({});
    assert.equal(getSourceFacet('body', r), null);
  });

  it('returns null for invalid values', () => {
    const r = makeFmReader({ source_facet: 'bogus' });
    assert.equal(getSourceFacet('body', r), null);
  });

  it('accepts a legacy value under the legacy key', () => {
    const r = makeFmReader({ canonical_facet: 'synced' });
    assert.equal(getSourceFacet('body', r), 'synced');
  });
});


// v0.2.286 back-compat: whichLayerIsSource reads legacy notes via
// getSourceFacet's fallback path — the primary tests above exercise
// the new `source_facet` key; these confirm the legacy `canonical_facet`
// key still routes correctly through the same detection state machine.

describe('whichLayerIsSource — v0.2.286 legacy canonical_facet fallback', () => {
  it('legacy note with only canonical_facet: recipe reads as recipe',
    async () => {
      const d = 'both edited';
      const r = 'recipe edited later';
      const p = 'python matches';
      const dhStored = await computeFacetHash('old desc');
      const rhStored = await computeFacetHash('old recipe');
      const ph = await computeFacetHash(p);
      const result = await whichLayerIsSource(
        'body',
        _legacyHelpers(d, r, p, dhStored, rhStored, ph, 'recipe'),
      );
      assert.equal(result, 'recipe');
    });

  it('legacy note with only canonical_facet: description reads as description',
    async () => {
      const d = 'edited';
      const dhStored = await computeFacetHash('orig');
      const rh = await computeFacetHash('r');
      const ph = await computeFacetHash('p');
      const result = await whichLayerIsSource(
        'body',
        _legacyHelpers(d, 'r', 'p', dhStored, rh, ph, 'description'),
      );
      assert.equal(result, 'description');
    });

  it('legacy note with only canonical_facet: synced honored', async () => {
    const dh = await computeFacetHash('d');
    const rh = await computeFacetHash('r');
    const ph = await computeFacetHash('p');
    const result = await whichLayerIsSource(
      'body',
      _legacyHelpers('d', 'r', 'p', dh, rh, ph, 'synced'),
    );
    assert.equal(result, 'synced');
  });
});


// ---------- computeSyncState (drain 2026-07-23-1700 Phase 1) -----------
// Note-level rollup persisted to `sync_state` frontmatter. 5 values;
// `authoring` is computed-only (never persisted per Proposal B shipped
// by drain 1700). This suite exercises the 4 persisted values +
// synthetic edge cases.

describe('computeSyncState', () => {
  it('returns "synced" when all stored hashes match current content',
    async () => {
      const d = 'hello';
      const r = 'Return "hi".';
      const p = 'def compute(c): return "hi"';
      const dh = await computeFacetHash(d);
      const rh = await computeFacetHash(r);
      const ph = await computeFacetHash(p);
      const result = await computeSyncState(
        'body',
        _helpers(d, r, p, dh, rh, ph),
      );
      assert.equal(result, 'synced');
    });

  it('returns "stale-recipe" when only Description drifted', async () => {
    const d = 'hello edited';
    const r = 'Return "hi".';
    const p = 'def compute(c): return "hi"';
    const dhStored = await computeFacetHash('hello');
    const rh = await computeFacetHash(r);
    const ph = await computeFacetHash(p);
    const result = await computeSyncState(
      'body',
      _helpers(d, r, p, dhStored, rh, ph),
    );
    assert.equal(result, 'stale-recipe');
  });

  it('returns "stale-python" when only Recipe drifted', async () => {
    const d = 'hello';
    const r = 'Return "EDITED".';
    const p = 'def compute(c): return "hi"';
    const dh = await computeFacetHash(d);
    const rhStored = await computeFacetHash('Return "hi".');
    const ph = await computeFacetHash(p);
    const result = await computeSyncState(
      'body',
      _helpers(d, r, p, dh, rhStored, ph),
    );
    assert.equal(result, 'stale-python');
  });

  it('returns "stale-python" when only Python drifted', async () => {
    const d = 'hello';
    const r = 'Return "hi".';
    const p = 'def compute(c): return "EDITED"';
    const dh = await computeFacetHash(d);
    const rh = await computeFacetHash(r);
    const phStored = await computeFacetHash('def compute(c): return "hi"');
    const result = await computeSyncState(
      'body',
      _helpers(d, r, p, dh, rh, phStored),
    );
    assert.equal(result, 'stale-python');
  });

  it('returns "stale-both" when Description AND Recipe both drifted',
    async () => {
      const d = 'hello edited';
      const r = 'Return "EDITED".';
      const p = 'def compute(c): return "hi"';
      const dhStored = await computeFacetHash('hello');
      const rhStored = await computeFacetHash('Return "hi".');
      const ph = await computeFacetHash(p);
      const result = await computeSyncState(
        'body',
        _helpers(d, r, p, dhStored, rhStored, ph),
      );
      assert.equal(result, 'stale-both');
    });

  it('returns "stale-python" when Recipe AND Python both drifted (recipe wins over python transitively)',
    async () => {
      // Rule 3 in the spec: !descMismatch && recipeMismatch, regardless
      // of pythonMismatch → stale-python. sync_state observes note-level
      // freshness; the per-facet lineage story lives in FacetState.
      const d = 'hello';
      const r = 'Return "EDITED".';
      const p = 'def compute(c): return "ALSO_EDITED"';
      const dh = await computeFacetHash(d);
      const rhStored = await computeFacetHash('Return "hi".');
      const phStored = await computeFacetHash('def compute(c): return "hi"');
      const result = await computeSyncState(
        'body',
        _helpers(d, r, p, dh, rhStored, phStored),
      );
      assert.equal(result, 'stale-python');
    });

  it('treats absent stored hashes as "no drift" (fresh unpopulated note → synced)',
    async () => {
      // Fresh V2 note that hasn't been forged yet — no <facet>_hash
      // frontmatter fields set. Matches whichLayerIsSource's "absent
      // counts as matches" pattern (facet-hash-core.ts L121-124).
      const d = 'fresh description';
      const r = 'Return "fresh".';
      const p = 'def compute(c): return "fresh"';
      const result = await computeSyncState(
        'body',
        _helpers(d, r, p, null, null, null),
      );
      assert.equal(result, 'synced');
    });

  it('is deterministic across repeated invocations on the same input',
    async () => {
      const d = 'hello edited';
      const r = 'Return "hi".';
      const p = 'def compute(c): return "hi"';
      const dhStored = await computeFacetHash('hello');
      const rh = await computeFacetHash(r);
      const ph = await computeFacetHash(p);
      const h = _helpers(d, r, p, dhStored, rh, ph);
      const first = await computeSyncState('body', h);
      const second = await computeSyncState('body', h);
      assert.equal(first, second);
      assert.equal(first, 'stale-recipe');
    });
});
