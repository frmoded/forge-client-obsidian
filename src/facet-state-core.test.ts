// v0.2.270 — tests for the hexa-state visibility pure-core with CW-1700
// current-body-hash freshness comparison (drain 2026-07-06-1700).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FacetState,
  computeFacetStates,
  suffixTextForState,
  CHAIN_POSITION,
  ALL_FACETS,
  type CurrentBodyHashes,
} from './facet-state-core.ts';

function fakeFm(map: Record<string, string>) {
  return {
    getFrontmatterField(key: string): string | null {
      return key in map ? map[key] : null;
    },
  };
}

/** Helper: aligned CurrentBodyHashes — current body matches stored `<facet>_hash`
 *  values in the fm map. Used where no drift is being tested. */
function alignedBodyHashes(descHash: string, recipeHash: string, pythonHash: string): CurrentBodyHashes {
  return {
    description: descHash,
    recipe: recipeHash,
    python: pythonHash,
  };
}

// -----------------------------------------------------------------------
// canonical=description matrix (§4.1 v11.6 hexa-state)
// -----------------------------------------------------------------------

test('canonical=description + Recipe in sync + Python in sync → source/derived/derived', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('description', fm, alignedBodyHashes('D1', 'R1', 'P1'));
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
  const states = computeFacetStates('description', fm, alignedBodyHashes('D2', 'R1', 'P1'));
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
  const states = computeFacetStates('description', fm, alignedBodyHashes('D1', 'R2', 'P1'));
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
  const states = computeFacetStates('description', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// canonical=recipe matrix
// -----------------------------------------------------------------------

test('canonical=recipe → Description ignored, Recipe source, Python check', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('recipe', fm, alignedBodyHashes('D1', 'R1', 'P1'));
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
  const states = computeFacetStates('recipe', fm, alignedBodyHashes('D1', 'R2', 'P1'));
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
  const states = computeFacetStates('recipe', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// canonical=python matrix
// -----------------------------------------------------------------------

test('canonical=python → Description + Recipe ignored, Python source', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('python', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Ignored);
  assert.equal(states.python, FacetState.Source);
});

// -----------------------------------------------------------------------
// canonical=synced matrix — v11.4.1 convention preserved
// -----------------------------------------------------------------------

test('canonical=synced → same as description (v11.4.1 preserved)', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('synced', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
});

test('canonical=synced + all parent hashes absent → recipe + python out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('synced', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// v11.4 / v11.5 legacy fallback tests
// -----------------------------------------------------------------------

test('legacy recipe_derived_from_source_hash used when v11.6 field absent', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_source_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const states = computeFacetStates('description', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
});

test('CW-1500-B: legacy python_derived_from_source_hash === description_hash → still out-of-date', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_source_hash: 'D1', // legacy two-hop: points at D not R
  });
  const states = computeFacetStates('description', fm, alignedBodyHashes('D1', 'R1', 'P1'));
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

// -----------------------------------------------------------------------
// CW-1700 (drain 1700) — current-body-hash freshness comparison
// -----------------------------------------------------------------------

test('CW-1700 primary: hand-edited Description drifts from stored → Recipe out-of-date immediately', () => {
  // Simulate hand-edit: stored description_hash still points at last
  // forged snapshot ('D1'), but current-body computed hash is 'D_HAND_EDITED'.
  // Under drain 1500 impl (pre-CW-1700): compared stored fields, would render
  // Recipe as `derived from Description` (equal because both stored fields
  // point at D1). Post-CW-1700: compares recipe_derived_from_description_hash
  // ('D1') against currentBodyHashes.description ('D_HAND_EDITED') → mismatch
  // → out-of-date. Cohort sees freshness signal immediately.
  const fm = fakeFm({
    description_hash: 'D1', // STORED — last forged snapshot (unchanged by hand-edit)
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1', // points at last forged D
    python_derived_from_recipe_hash: 'R1',
  });
  const currentBody: CurrentBodyHashes = {
    description: 'D_HAND_EDITED', // ← Description body drifted post-hand-edit
    recipe: 'R1',
    python: 'P1',
  };
  const states = computeFacetStates('description', fm, currentBody);
  assert.equal(states.description, FacetState.Source);
  // The FIX: Recipe renders out-of-date because parent-hash ('D1') !==
  // current body hash ('D_HAND_EDITED').
  assert.equal(states.recipe, FacetState.DerivedFromDescriptionOutOfDate);
  // Python transitively out-of-date per Q3.
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('CW-1700 Recipe-canonical variant: Recipe hand-edit → Python out-of-date immediately', () => {
  // Analogous scenario: Recipe-canonical note, cohort edits Recipe body.
  // Stored recipe_hash stays at last-forged 'R1'; python_derived_from_recipe_hash
  // also 'R1'. Under pre-fix impl: Python renders in sync. Post-fix: Python
  // parent-hash ('R1') vs currentBodyHashes.recipe ('R_HAND_EDITED') → mismatch.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1', // STORED — last forged
    python_hash: 'P1',
    python_derived_from_recipe_hash: 'R1',
  });
  const currentBody: CurrentBodyHashes = {
    description: 'D1',
    recipe: 'R_HAND_EDITED', // ← Recipe body drifted
    python: 'P1',
  };
  const states = computeFacetStates('recipe', fm, currentBody);
  assert.equal(states.description, FacetState.Ignored);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('CW-1700 negative: no drift → freshness holds (regression guard)', () => {
  // Ensures the fix does not break the aligned case: when current-body
  // hashes match stored, freshness comparison behaves same as before.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const currentBody: CurrentBodyHashes = {
    description: 'D1',
    recipe: 'R1',
    python: 'P1',
  };
  const states = computeFacetStates('description', fm, currentBody);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  assert.equal(states.python, FacetState.DerivedFromRecipe);
});

test('CW-1700: currentBodyHashes.recipe drives Python freshness on description-canonical (not stored recipe_hash)', () => {
  // Composite: Description stays aligned. Recipe body hand-edited (drift).
  // Recipe would show out-of-date; Python transitively also.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1', // stored — last forged
    python_hash: 'P1',
    recipe_derived_from_description_hash: 'D1',
    python_derived_from_recipe_hash: 'R1',
  });
  const currentBody: CurrentBodyHashes = {
    description: 'D1',
    recipe: 'R_DRIFTED', // hand-edited but note stays description-canonical (I5 window)
    python: 'P1',
  };
  const states = computeFacetStates('description', fm, currentBody);
  // Recipe compared against currentBodyHashes.description ('D1'): recipe_derived === 'D1' → in-sync.
  // But this is a semantic edge: Recipe body drifted from last-forged Recipe;
  // however Recipe's parent-hash relation is with Description, not with itself.
  // So Recipe renders in-sync from Description perspective.
  assert.equal(states.recipe, FacetState.DerivedFromDescription);
  // Python's parent-hash ('R1') vs currentBodyHashes.recipe ('R_DRIFTED') → mismatch
  // → Python out-of-date.
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
