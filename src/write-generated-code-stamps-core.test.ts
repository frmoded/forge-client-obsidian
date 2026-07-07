// v0.2.275 CW-1900 — TDD tests for auto-forge stamp re-baseline.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAutoForgeStamps,
} from './write-generated-code-stamps-core.ts';

test('CW-1900 primary: post-auto-forge stored hashes align with current body SHAs', () => {
  // Cohort edited Description → Description body SHA differs from
  // last-forged stored hash. Auto-forge runs. Under Option B, the
  // stamps re-baseline to CURRENT body SHAs (not stored values).
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D_NEW_AFTER_EDIT',
    currentRecipeHash: 'R_CURRENT',
    currentPythonHash: 'P_JUST_WRITTEN_BY_LLM',
  });
  assert.equal(stamps.description_hash, 'D_NEW_AFTER_EDIT');
  assert.equal(stamps.recipe_hash, 'R_CURRENT');
  assert.equal(stamps.python_hash, 'P_JUST_WRITTEN_BY_LLM');
});

test('CW-1900 derived-from stamps use CURRENT description hash (not stored)', () => {
  // The bug pre-CW-1900: derived-from stamps came from STORED
  // description_hash (which was stale after user edited Description).
  // Post-CW-1900: stamps come from currentDescriptionHash directly.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D_NEW',
    currentRecipeHash: 'R_CURRENT',
    currentPythonHash: 'P_CURRENT',
  });
  assert.equal(stamps.recipe_derived_from_description_hash, 'D_NEW');
  // Legacy field also uses D_NEW (two-hop Description-canonical semantic
  // preserved under CW-1500-A backfill contract).
  assert.equal(stamps.recipe_derived_from_source_hash, 'D_NEW');
  assert.equal(stamps.python_derived_from_source_hash, 'D_NEW');
});

test('CW-1900 python_derived_from_recipe_hash uses current Recipe hash', () => {
  // Python's immediate parent (v11.6 hexa-state) is Recipe. The stamp
  // must reflect the CURRENT Recipe body SHA so CW-1700 freshness
  // renders "— derived from Recipe" (in sync) post-forge.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D',
    currentRecipeHash: 'R_CURRENT',
    currentPythonHash: 'P',
  });
  assert.equal(stamps.python_derived_from_recipe_hash, 'R_CURRENT');
});

test('CW-1900 two-cycle scenario: cycle 1 (fresh) + cycle 2 (post-edit) both re-baseline correctly', () => {
  // Cycle 1: fresh state, description_hash = "D0", recipe_hash = "R0",
  // python_hash = "P_LLM_1" (LLM output).
  const cycle1 = computeAutoForgeStamps({
    currentDescriptionHash: 'D0',
    currentRecipeHash: 'R0',
    currentPythonHash: 'P_LLM_1',
  });
  assert.equal(cycle1.description_hash, 'D0');
  assert.equal(cycle1.recipe_derived_from_description_hash, 'D0');

  // Cycle 2: cohort edited Description to "D1" then clicked Forge.
  // The pipeline runs; LLM produces new Python. Under Option B, all
  // stored + derived-from fields re-baseline to D1 / R0 / P_LLM_2.
  const cycle2 = computeAutoForgeStamps({
    currentDescriptionHash: 'D1',
    currentRecipeHash: 'R0',
    currentPythonHash: 'P_LLM_2',
  });
  assert.equal(cycle2.description_hash, 'D1');
  assert.equal(cycle2.recipe_derived_from_description_hash, 'D1');
  // Post-CW-1700 freshness check: recipe_derived_from_description_hash
  // (D1) === currentBodyHashes.description (D1) → "— derived from
  // Description" (in sync). This is the exact scenario CW-1900 fixes.
  assert.equal(cycle2.recipe_derived_from_description_hash, 'D1');
});

test('CW-1900 idempotent: same input → same output', () => {
  const input = {
    currentDescriptionHash: 'D',
    currentRecipeHash: 'R',
    currentPythonHash: 'P',
  };
  const a = computeAutoForgeStamps(input);
  const b = computeAutoForgeStamps(input);
  assert.deepEqual(a, b);
});

test('CW-1900 no field aliasing: mutating one output field does not affect helpers computed from same input', () => {
  // Defensive: computeAutoForgeStamps returns a fresh object every call.
  const input = { currentDescriptionHash: 'D', currentRecipeHash: 'R', currentPythonHash: 'P' };
  const first = computeAutoForgeStamps(input);
  first.description_hash = 'mutated';
  const second = computeAutoForgeStamps(input);
  assert.equal(second.description_hash, 'D');
});
