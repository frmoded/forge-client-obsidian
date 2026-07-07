// v0.2.277 CW-2000 — TDD tests for Description → Recipe pure-core.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractWikilinkTargets,
  checkRecipeClosure,
  computeDescriptionDerivedRecipeStamps,
} from './write-generated-recipe-core.ts';

test('CW-2000 extractWikilinkTargets: single wikilink, bare target', () => {
  const body = 'Let x = Call [[chorus]].';
  assert.deepEqual(extractWikilinkTargets(body), ['chorus']);
});

test('CW-2000 extractWikilinkTargets: strips heading + alias', () => {
  const body = 'Let x = [[chorus#Verse|Chorus]]. Let y = [[drum_chorus|drums]].';
  assert.deepEqual(extractWikilinkTargets(body), ['chorus', 'drum_chorus']);
});

test('CW-2000 extractWikilinkTargets: dedups repeated targets, preserves first-seen order', () => {
  const body = `Let a = [[voices_list]].
Let b = [[chorus]].
Let c = [[voices_list]] with sections=[a].
Let d = [[sequence_list]] with sections=[b, c].`;
  assert.deepEqual(extractWikilinkTargets(body), ['voices_list', 'chorus', 'sequence_list']);
});

test('CW-2000 extractWikilinkTargets: empty body returns empty list', () => {
  assert.deepEqual(extractWikilinkTargets(''), []);
});

test('CW-2000 extractWikilinkTargets: body without any wikilinks returns empty list', () => {
  const body = 'Let x = 3. Return x.';
  assert.deepEqual(extractWikilinkTargets(body), []);
});

test('CW-2000 extractWikilinkTargets: multiple wikilinks on one line', () => {
  // Realistic V2 syntax: chained Call [[...]] on same line, no nested
  // list-of-wikilinks (real Recipes use sections=[bound_name1, ...]).
  const body = 'Let x = Call [[voices_list]] with sections=[a, b]. Let y = Call [[drums]].';
  const out = extractWikilinkTargets(body);
  assert.deepEqual(out, ['voices_list', 'drums']);
});

test('CW-2000 extractWikilinkTargets: ignores empty brackets', () => {
  const body = 'Let x = [[]]. Let y = [[foo]].';
  assert.deepEqual(extractWikilinkTargets(body), ['foo']);
});

test('CW-2000 checkRecipeClosure: all wikilinks resolve → ok:true', () => {
  const body = 'Let x = Call [[chorus]]. Let y = Call [[drum_chorus]].';
  const known = new Set(['chorus', 'drum_chorus', 'voices_list']);
  const result = checkRecipeClosure(body, (id) => known.has(id));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.wikilinks, ['chorus', 'drum_chorus']);
  }
});

test('CW-2000 checkRecipeClosure: unresolved wikilink → ok:false with unresolved list', () => {
  // Repro of driver's v1 case: LLM produced Recipe with V1-era paths
  // that don't exist in vault.
  const body = 'Let a = [[chorus]]. Let b = [[harmonic_frame]]. Let c = [[verse]].';
  const known = new Set(['chorus', 'drum_chorus']);
  const result = checkRecipeClosure(body, (id) => known.has(id));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.wikilinks, ['chorus', 'harmonic_frame', 'verse']);
    assert.deepEqual(result.unresolved, ['harmonic_frame', 'verse']);
  }
});

test('CW-2000 checkRecipeClosure: empty body → ok:true, trivially closed', () => {
  const result = checkRecipeClosure('', () => false);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.wikilinks, []);
  }
});

test('CW-2000 checkRecipeClosure: all unresolved (worst case) → ok:false', () => {
  const body = 'Let x = [[foo]]. Let y = [[bar]].';
  const result = checkRecipeClosure(body, () => false);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.unresolved, ['foo', 'bar']);
  }
});

test('CW-2000 checkRecipeClosure: no wikilinks + non-empty body → ok:true', () => {
  const body = 'Let x = 42. Return x.';
  const result = checkRecipeClosure(body, () => false);
  assert.equal(result.ok, true);
});

test('CW-2000 computeDescriptionDerivedRecipeStamps: all four fields set from Desc + Recipe SHAs', () => {
  const stamps = computeDescriptionDerivedRecipeStamps('D_NEW', 'R_NEW_LLM');
  assert.equal(stamps.description_hash, 'D_NEW');
  assert.equal(stamps.recipe_hash, 'R_NEW_LLM');
  assert.equal(stamps.recipe_derived_from_description_hash, 'D_NEW');
  assert.equal(stamps.recipe_derived_from_source_hash, 'D_NEW');
});

test('CW-2000 computeDescriptionDerivedRecipeStamps: idempotent', () => {
  const a = computeDescriptionDerivedRecipeStamps('D', 'R');
  const b = computeDescriptionDerivedRecipeStamps('D', 'R');
  assert.deepEqual(a, b);
});

test('CW-2000 two-cycle stamp scenario: cycle a baseline stamps + cycle b post-edit stamps differ on description_hash + recipe_hash', () => {
  // Cycle a: Description D0 stamped as baseline.
  const cycleA = computeDescriptionDerivedRecipeStamps('D0', 'R0_LLM');
  assert.equal(cycleA.description_hash, 'D0');
  assert.equal(cycleA.recipe_derived_from_description_hash, 'D0');

  // Cycle b: cohort edited Description to D1, LLM produced new Recipe.
  // Stamps re-baseline. The DIFFERENCE between cycles = load-bearing:
  // proves Description edits reach the pipeline (contrast with pre-
  // CW-2000 where Recipe body was byte-for-byte identical across
  // cycles, per driver A/B test).
  const cycleB = computeDescriptionDerivedRecipeStamps('D1', 'R1_LLM_NEW');
  assert.equal(cycleB.description_hash, 'D1');
  assert.equal(cycleB.recipe_hash, 'R1_LLM_NEW');
  assert.equal(cycleB.recipe_derived_from_description_hash, 'D1');
  // Assert difference across cycles.
  assert.notEqual(cycleA.description_hash, cycleB.description_hash);
  assert.notEqual(cycleA.recipe_hash, cycleB.recipe_hash);
});
