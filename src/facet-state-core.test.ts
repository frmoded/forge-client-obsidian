// v0.2.264 — tests for the hexa-state visibility pure-core (drain
// 2026-07-03-1500 V2a v11.6).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FacetState,
  computeFacetStates,
  suffixTextForState,
  CHAIN_POSITION,
  ALL_FACETS,
} from './facet-state-core.ts';

function fakeFm(map: Record<string, string>) {
  return {
    getFrontmatterField(key: string): string | null {
      return key in map ? map[key] : null;
    },
  };
}

// -----------------------------------------------------------------------
// canonical=description matrix (§4.1)
// -----------------------------------------------------------------------

test('canonical=description + Recipe in sync + Python in sync → source/derived/derived', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
});

test('canonical=description + Recipe out of date → recipe out-of-date + python transitive out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D2',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1', // stale: points at old D
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  // TRANSITIVE per Q3: Python out-of-date even though its local
  // recipe_hash match would be in sync.
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('canonical=description + Recipe in sync + Python local mismatch → python out-of-date only', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R2',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1', // Python's parent points at old R
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('canonical=description + parent-hash fields absent → both out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    // no v11.6 parent hashes, no v11.5 source hashes
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// canonical=recipe matrix (§4.1)
// -----------------------------------------------------------------------

test('canonical=recipe → Description ignored, Recipe source, Python check', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
});

test('canonical=recipe + python_derived mismatch → python out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R2',
    python_hash: 'P1',
    python_derived_from_recipe_hash: 'R1', // stale: points at old R
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('canonical=recipe + python_derived absent → python out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// canonical=python matrix (§4.1)
// -----------------------------------------------------------------------

test('canonical=python → Description + Recipe ignored, Python source', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('python', fm);
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Ignored);
  assert.equal(states.python, FacetState.Source);
});

// -----------------------------------------------------------------------
// canonical=synced matrix (§4.1) — v11.4.1 convention preserved
// -----------------------------------------------------------------------

test('canonical=synced → same as description (v11.4.1 preserved)', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('synced', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
});

test('canonical=synced + all parent hashes absent → recipe + python out-of-date', () => {
  // Fresh V2 note post-v113 backfill: hashes stamped but no v11.6
  // parent-hash fields. Under CW-1500-B safe default, Python renders
  // out-of-date until cohort re-forges.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('synced', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// v11.4 / v11.5 legacy fallback tests
// -----------------------------------------------------------------------

test('legacy recipe_derived_from_source_hash used when v11.6 field absent', () => {
  // v11.5 vintage: only `_source_hash` field present. Fallback path
  // in readParentHash reads the legacy field.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_source_hash: 'D1', // legacy field
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
});

test('CW-1500-B: legacy python_derived_from_source_hash === description_hash → still out-of-date', () => {
  // Two-hop Description-canonical case. Legacy field points at
  // Description hash (v11.4.1+ backfill shape). CW-1500-B safe
  // default: without v11.6 python_derived_from_recipe_hash, render
  // out-of-date until cohort re-forges. Prevents false-positive
  // "in sync" when Recipe body may have drifted.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_source_hash: 'D1', // legacy two-hop: points at D not R
    // NO python_derived_from_recipe_hash → CW-1500-B applies
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  // Python: legacy fallback fires, but 'D1' !== current recipe_hash 'R1' → out of date.
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// Suffix text rendering
// -----------------------------------------------------------------------

test('suffixTextForState returns exact v11.6 §2.2 strings', () => {
  assert.equal(suffixTextForState(FacetState.Source), '— source');
  assert.equal(
    suffixTextForState(FacetState.DerivedFromDescription),
    '— derived from Description',
  );
  assert.equal(
    suffixTextForState(FacetState.DerivedFromRecipe),
    '— derived from Recipe',
  );
  assert.equal(
    suffixTextForState(FacetState.DerivedFromDescriptionOutOfDate),
    '— derived from Description, out of date',
  );
  assert.equal(
    suffixTextForState(FacetState.DerivedFromRecipeOutOfDate),
    '— derived from Recipe, out of date',
  );
  assert.equal(suffixTextForState(FacetState.Ignored), '— ignored');
});

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

test('chain position constants match D→R→P generation direction', () => {
  assert.equal(CHAIN_POSITION.description, 0);
  assert.equal(CHAIN_POSITION.recipe, 1);
  assert.equal(CHAIN_POSITION.python, 2);
  assert.deepEqual([...ALL_FACETS], ['description', 'recipe', 'python']);
});
