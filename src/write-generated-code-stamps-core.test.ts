// v0.2.275 CW-1900 — TDD tests for auto-forge stamp re-baseline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

// ---------------------------------------------------------------------
// Drain 2026-08-27-1700 — /generate must not claim Recipe-derivation.
//
// CCQA found `python_derived_from_recipe_hash` stamped equal to the
// note's CURRENT `recipe_hash` on the Recipe-canonical bundled fixture
// `music-theory/exercises/scale_quality_quiz.md`, after a hammer press
// that left the Recipe untouched and regenerated `# Python` from the
// DESCRIPTION. The note then actively claimed its Python was a faithful
// derivation of its Recipe — a hash-integrity LIE, not staleness.
//
// ROOT CAUSE, and it is not Recipe-canonical-specific: generate()'s
// request payload (main.ts, `payload = {...}`) carries description /
// english / inputs / generation_notes / deps / callables. It carries NO
// RECIPE. The service cannot derive Python from a Recipe it was never
// sent, so this writer's recipe-parent claim was never a record of what
// happened — it was an assertion of the canonical Description → Recipe →
// Python model. On a Description-canonical note the model holds (the
// sibling _llmGenerateRecipe path just rebuilt the Recipe from that same
// Description). On a Recipe-canonical note the Recipe is an independent
// hand-authored artifact the generation never read, and the claim is
// flatly false.
//
// The remedy follows the precedent already in this same writer — drain
// 2026-07-29-2230 Option 3, which omits both fields when there is no
// Recipe body because "that fabricated provenance" cost two drains of
// investigation. Absent lineage is honest.

test('1700 THE BUG: a Recipe-canonical note gets no recipe-derivation claim', () => {
  // CCQA's exact shape. Recipe untouched on disk, so currentRecipeHash
  // IS the note's stored recipe_hash; the old code stamped that value
  // and produced `python_derived_from_recipe_hash === recipe_hash`.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D',
    currentRecipeHash: 'R_HAND_CURATED',
    currentPythonHash: 'P_GENERATED_FROM_DESCRIPTION',
    sourceFacet: 'recipe',
  });
  assert.equal(
    stamps.python_derived_from_recipe_hash, null,
    'claimed the Python derives from a Recipe that was never sent to the LLM',
  );
});

test('1700 the claim is refused for EVERY non-Description source facet', () => {
  // Generality: the defect is "which facet did I actually derive from",
  // so the refusal is keyed on the source facet, not on one note shape.
  for (const facet of ['recipe', 'python']) {
    const stamps = computeAutoForgeStamps({
      currentDescriptionHash: 'D',
      currentRecipeHash: 'R',
      currentPythonHash: 'P',
      sourceFacet: facet,
    });
    assert.equal(
      stamps.python_derived_from_recipe_hash, null,
      `source_facet '${facet}': recipe-derivation claimed anyway`,
    );
  }
});

test('1700 NON-VACUITY: a Description-canonical note still gets the claim', () => {
  // CW-1900's whole purpose. On this path the sibling _llmGenerateRecipe
  // rebuilt the Recipe from this same Description in the same gesture,
  // so the transitive claim is coherent — and facet-state-core renders
  // "— derived from Recipe" (in sync) off it. A blanket removal would
  // regress exactly the bug CW-1900 was written to fix.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D',
    currentRecipeHash: 'R_CURRENT',
    currentPythonHash: 'P',
    sourceFacet: 'description',
  });
  assert.equal(stamps.python_derived_from_recipe_hash, 'R_CURRENT');
});

test('1700 NON-VACUITY: a pre-1200 note with no stored source facet still gets the claim', () => {
  // Matches drain 1620's guard convention: an ABSENT stored
  // source_facet PERMITS, on purpose. Such a note has no hand-authored
  // claim to protect, and refusing would freeze its derived facets.
  for (const absent of [null, undefined]) {
    const stamps = computeAutoForgeStamps({
      currentDescriptionHash: 'D',
      currentRecipeHash: 'R_CURRENT',
      currentPythonHash: 'P',
      sourceFacet: absent,
    });
    assert.equal(stamps.python_derived_from_recipe_hash, 'R_CURRENT');
  }
});

test('1700 the OTHER stamps are untouched on a Recipe-canonical note', () => {
  // Scope pin. This drain fixes one false claim; it must not quietly
  // change the re-baselining CW-1900 exists for.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: 'D',
    currentRecipeHash: 'R',
    currentPythonHash: 'P',
    sourceFacet: 'recipe',
  });
  assert.equal(stamps.description_hash, 'D');
  assert.equal(stamps.recipe_hash, 'R');
  assert.equal(stamps.python_hash, 'P');
  assert.equal(stamps.python_derived_from_source_hash, 'D');
});

test('1700 WIRED: writeGeneratedCode passes source_facet and retracts the claim', () => {
  // The half a pure-core assertion cannot see — that the decision
  // reaches production. Drain 1600 §4's lesson: the old I1 hook
  // asserted a pure function's return value while the function had no
  // callers, and would have stayed green through any change to what
  // the hammer actually did.
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const body = main.slice(
    main.indexOf('private async writeGeneratedCode('),
    main.indexOf('private async writeGeneratedCode(') + 8000,
  );
  assert.match(
    body, /sourceFacet: getFmFieldV2\(newContent, 'source_facet'\)/,
    'the stamps helper is not told which facet is the source',
  );
  assert.match(
    body,
    /stamps\.python_derived_from_recipe_hash === null\)\s*\{\s*newContent = removeFmFieldV2\(newContent, 'python_derived_from_recipe_hash'\)/,
    'a refused claim is not RETRACTED — a stale genuine stamp would survive',
  );
});

test('1700 REGRESSION FIXTURE: the shipped Recipe-canonical note CCQA hit', () => {
  // Against the real bundled fixture, read from assets — not a hand-typed
  // frontmatter block, which would only prove I typed what the code does.
  // §4 forbids running the repro against the live library file; reading
  // it is not running it.
  const note = readFileSync(
    new URL('../assets/vaults/music-theory/exercises/scale_quality_quiz.md',
      import.meta.url), 'utf8');
  const fm = (k: string) => {
    const m = new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(note.slice(0, note.indexOf('\n---\n', 4)));
    return m ? m[1].trim() : null;
  };
  assert.equal(fm('source_facet'), 'recipe',
    'fixture is no longer Recipe-canonical — this regression test needs rewriting');
  const storedRecipeHash = fm('recipe_hash');
  assert.ok(storedRecipeHash, 'fixture has no recipe_hash to lie about');

  // /generate leaves the Recipe untouched, so its CURRENT hash IS the
  // stored one. That identity is precisely what turned the old stamp
  // into `python_derived_from_recipe_hash === recipe_hash`.
  const stamps = computeAutoForgeStamps({
    currentDescriptionHash: fm('description_hash')!,
    currentRecipeHash: storedRecipeHash,
    currentPythonHash: 'P_REGENERATED_FROM_THE_DESCRIPTION',
    sourceFacet: fm('source_facet'),
  });
  assert.notEqual(
    stamps.python_derived_from_recipe_hash, storedRecipeHash,
    'still stamps the exact false claim CCQA reported',
  );
  assert.equal(stamps.python_derived_from_recipe_hash, null);
});
