import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  decideForgeClickAction,
} from './canonical-aware-forge-click-core.ts';

describe('decideForgeClickAction (v0.2.201 Phase 2 §3.1)', () => {
  test('python-canonical → run_python_directly (Path Y closure)', () => {
    // Hand-edited Python facet. The whole point of Phase 2: don't
    // re-transpile; preserve cohort edits. Mirrors V1's
    // `edit_mode: python` workaround but driven by hash mismatch.
    assert.equal(
      decideForgeClickAction('python'),
      'run_python_directly',
    );
  });

  test('description-canonical → abort_recipe_stale', () => {
    // Description hand-edited since last /generate. Recipe is now
    // stale; running Forge would transpile stale Recipe → stale
    // Python. Fail fast with a notice pointing at /generate.
    assert.equal(
      decideForgeClickAction('description'),
      'abort_recipe_stale',
    );
  });

  test('recipe-canonical → standard_transpile', () => {
    // Recipe hand-edited since last Python regen. Standard path:
    // re-transpile Recipe → Python. Phase 1 already does this.
    assert.equal(
      decideForgeClickAction('recipe'),
      'standard_transpile',
    );
  });

  test('synced → standard_transpile', () => {
    // No hand-edits anywhere; all three facets match their stored
    // hashes. Safe to re-transpile (idempotent for a synced note).
    assert.equal(
      decideForgeClickAction('synced'),
      'standard_transpile',
    );
  });

  test('null (probe failed) → standard_transpile (preserves Phase 1 behavior)', () => {
    // If whichLayerIsCanonical threw, fall through to standard
    // transpile. Without this fallback a hash-helper bug could take
    // Forge-click offline for the whole cohort.
    assert.equal(
      decideForgeClickAction(null),
      'standard_transpile',
    );
  });

  test('decision table is exhaustive (one action per layer)', () => {
    // Belt-and-braces: every layer maps to exactly one of the three
    // documented actions. If a future drain adds a new canonical
    // value, the type system catches the missing branch at compile
    // time AND this test ensures the existing four don't drift.
    const layers = ['description', 'recipe', 'python', 'synced'] as const;
    const actions = new Set(layers.map(decideForgeClickAction));
    assert.deepEqual(
      [...actions].sort(),
      ['abort_recipe_stale', 'run_python_directly', 'standard_transpile'].sort(),
    );
  });
});
