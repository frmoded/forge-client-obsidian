// v0.2.243 — tests for the tri-state visibility pure-core (drain
// 2026-07-03-0200 V2a v11.4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FacetState,
  computeFacetStates,
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

test('description-canonical + forged → description source, recipe + python derived', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_source_hash: 'D1',
    python_derived_from_source_hash: 'D1',
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.Derived);
  assert.equal(states.python, FacetState.Derived);
});

test('description-canonical + description edited (not forged) → recipe + python stale', () => {
  // Description was edited, so its hash is now 'D2'. Downstream
  // facets' derived_from_source_hash still points at 'D1' → mismatch.
  const fm = fakeFm({
    description_hash: 'D2',
    recipe_hash: 'R1',
    python_hash: 'P1',
    recipe_derived_from_source_hash: 'D1',
    python_derived_from_source_hash: 'D1',
  });
  const states = computeFacetStates('description', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.Stale);
  assert.equal(states.python, FacetState.Stale);
});

test('recipe-canonical + forged → description stale, python derived', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    python_derived_from_source_hash: 'R1',
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.description, FacetState.Stale);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.Derived);
});

test('recipe-canonical + recipe edited (not forged) → python stale', () => {
  // Recipe canonical is 'R2' (new edit). Python's
  // derived_from_source_hash still points at 'R1' (old recipe).
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R2',
    python_hash: 'P1',
    python_derived_from_source_hash: 'R1',
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.description, FacetState.Stale);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.Stale);
});

test('python-canonical → description + recipe stale (upstream never regenerates)', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('python', fm);
  assert.equal(states.description, FacetState.Stale);
  assert.equal(states.recipe, FacetState.Stale);
  assert.equal(states.python, FacetState.Source);
});

test('downstream derived_from_source_hash absent → stale (not derived)', () => {
  // Recipe canonical, python_derived_from_source_hash is undefined.
  // Python should be stale, not derived.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
    // no python_derived_from_source_hash
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.python, FacetState.Stale);
});

test('upstream is inherently stale even if some derived_from field is set', () => {
  // Recipe canonical. Description is upstream — always stale
  // regardless of any hash field.
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_derived_from_source_hash: 'R1',
  });
  const states = computeFacetStates('recipe', fm);
  assert.equal(states.description, FacetState.Stale);
});

test('synced canonical → all three facets source (post-backfill / freshly aligned)', () => {
  const fm = fakeFm({
    description_hash: 'D1',
    recipe_hash: 'R1',
    python_hash: 'P1',
  });
  const states = computeFacetStates('synced', fm);
  assert.equal(states.description, FacetState.Source);
  assert.equal(states.recipe, FacetState.Source);
  assert.equal(states.python, FacetState.Source);
});

test('chain position constants match D→R→P generation direction', () => {
  assert.equal(CHAIN_POSITION.description, 0);
  assert.equal(CHAIN_POSITION.recipe, 1);
  assert.equal(CHAIN_POSITION.python, 2);
  assert.deepEqual([...ALL_FACETS], ['description', 'recipe', 'python']);
});
