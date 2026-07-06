// v0.2.264 drain 2026-07-03-1500 — L49 executable translation of I6
// (Facet suffix tells cohort both the parent and the freshness).
//
// I6 asserts that any non-source facet's rendered suffix reveals:
//   (a) which facet it derives from (parent in D → R → P chain), AND
//   (b) whether that derivation is current or out of date.
//
// Test: for every hexa-state variant, the suffix string must contain
// either "source", "derived from Description", "derived from Recipe",
// or "ignored" — verifying cohort can trace parent from suffix alone.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FacetState,
  suffixTextForState,
} from './facet-state-core.ts';

test('I6: every non-source suffix names its parent OR marks itself as ignored', () => {
  // Recipe's non-source states must all mention "Description" (parent).
  const recipeStates = [
    FacetState.DerivedFromDescription,
    FacetState.DerivedFromDescriptionOutOfDate,
  ];
  for (const state of recipeStates) {
    const suffix = suffixTextForState(state);
    assert.ok(
      suffix.includes('Description'),
      `Recipe state ${state} suffix must name parent "Description"; got: ${suffix}`,
    );
  }

  // Python's non-source states must all mention "Recipe" (parent).
  const pythonStates = [
    FacetState.DerivedFromRecipe,
    FacetState.DerivedFromRecipeOutOfDate,
  ];
  for (const state of pythonStates) {
    const suffix = suffixTextForState(state);
    assert.ok(
      suffix.includes('Recipe'),
      `Python state ${state} suffix must name parent "Recipe"; got: ${suffix}`,
    );
  }

  // Ignored is its own explicit signal.
  assert.equal(suffixTextForState(FacetState.Ignored), '— ignored');

  // Source shows no parent (top of derivation chain within the note).
  assert.equal(suffixTextForState(FacetState.Source), '— source');
});

test('I6: out-of-date states carry the "out of date" phrase', () => {
  // Freshness signal MUST be in the suffix, not hidden in tooltip.
  const outOfDateStates = [
    FacetState.DerivedFromDescriptionOutOfDate,
    FacetState.DerivedFromRecipeOutOfDate,
  ];
  for (const state of outOfDateStates) {
    const suffix = suffixTextForState(state);
    assert.ok(
      suffix.includes('out of date'),
      `Out-of-date state ${state} must carry "out of date"; got: ${suffix}`,
    );
  }

  // In-sync derived states MUST NOT carry "out of date".
  const inSyncStates = [
    FacetState.DerivedFromDescription,
    FacetState.DerivedFromRecipe,
  ];
  for (const state of inSyncStates) {
    const suffix = suffixTextForState(state);
    assert.ok(
      !suffix.includes('out of date'),
      `In-sync state ${state} must NOT carry "out of date"; got: ${suffix}`,
    );
  }
});

test('I6: ignored is distinct from out-of-date (no lineage vs broken lineage)', () => {
  // Cohort must be able to distinguish "no derivation relationship"
  // (ignored) from "was derived, source moved" (out of date). Two
  // separate strings, not the same fallback.
  const ignored = suffixTextForState(FacetState.Ignored);
  const outOfDate = suffixTextForState(FacetState.DerivedFromRecipeOutOfDate);
  assert.notEqual(ignored, outOfDate);
  assert.ok(!ignored.includes('out of date'));
  assert.ok(!ignored.includes('derived from'));
});
