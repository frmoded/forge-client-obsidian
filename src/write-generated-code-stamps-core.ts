// v0.2.275 CW-1900 — pure-core stamp helper for writeGeneratedCode.
// Option B: auto-forge re-baselines all three stored `<facet>_hash`
// fields to current body SHAs (drain 1200 "stored = last-forged
// snapshot" invariant applies: auto-forge IS a forge event, so stored
// SHOULD update).
//
// Pre-CW-1900 writeGeneratedCode read STORED description_hash /
// recipe_hash for the derived-from stamps. When cohort edited
// Description body after a prior forge, stored description_hash stayed
// at the last-forged baseline while the current body SHA drifted. The
// stamps pointed at the STALE stored value, and CW-1700 freshness
// (which compares current-body SHA to the stamp) rendered
// `— derived from Description, out of date` even though the pipeline
// had just successfully run.

/** Frontmatter fields to write into the note after generate() produces
 *  new Python. Under Option B, both stored `<facet>_hash` AND
 *  derived-from stamps are set from CURRENT body SHAs (not from stored
 *  frontmatter). This re-baselines the note to a "just-forged" state.
 *
 *  `_source_hash` legacy fields kept during transition (v11.5 → v11.6);
 *  callers can drop them after cohort validation. */
export interface AutoForgeStamps {
  description_hash: string;
  recipe_hash: string;
  python_hash: string;
  recipe_derived_from_description_hash: string;
  /** Drain 2026-08-27-1700 — `null` means DO NOT CLAIM Recipe-derivation
   *  (and remove any stamp a previous, genuine derivation left behind).
   *  /generate never receives the Recipe, so this claim is only ever
   *  honest when the Recipe is itself a product of the same
   *  Description-canonical forge. See the header note. */
  python_derived_from_recipe_hash: string | null;
  // Legacy v11.5 fields — kept for transition per CW-1500-A/B.
  recipe_derived_from_source_hash: string;
  python_derived_from_source_hash: string;
}

export interface AutoForgeStampInput {
  /** SHA-256 of current Description body content. */
  currentDescriptionHash: string;
  /** SHA-256 of current Recipe body content. */
  currentRecipeHash: string;
  /** SHA-256 of current Python body content (post writePythonAndEnglishHash). */
  currentPythonHash: string;
  /** Stored `source_facet` — the note's canonical facet, a STORED fact
   *  since drain 1200 rather than an inference, which is what makes the
   *  question answerable at a write site without re-deriving hashes
   *  (the same property drain 1620's `mayMachineWriteFacet` relies on).
   *  Absent/unknown PERMITS the claim, matching that guard's convention:
   *  a pre-1200 note has no hand-authored Recipe to misrepresent. */
  sourceFacet?: string | null;
}

/** Compute the frontmatter stamps for the auto-forge write.
 *
 *  Option B semantic: /generate is a Description-canonical forge event.
 *  The LLM saw the current Description body and produced Python that
 *  reflects it. Post-forge:
 *
 *  - description_hash re-baselined to current Description SHA.
 *  - recipe_hash re-baselined to current Recipe SHA (Recipe body
 *    unchanged by /generate; the SHA-256 is what backfill would compute
 *    if we opened the note fresh).
 *  - python_hash re-baselined to current Python SHA (the just-written
 *    Python body).
 *  - recipe_derived_from_description_hash = current Description SHA
 *    (Recipe consistent with this Description snapshot per LLM view).
 *  - python_derived_from_recipe_hash = current Recipe SHA
 *    (Python's immediate parent is Recipe).
 *  - Legacy _source_hash: kept aligned with Description SHA (two-hop
 *    Description-canonical semantic per CW-1500-A backfill contract).
 */
export function computeAutoForgeStamps(
  input: AutoForgeStampInput,
): AutoForgeStamps {
  // Drain 2026-08-27-1700 — the recipe-parent claim, gated on truth.
  //
  // generate()'s payload carries description / english / inputs /
  // generation_notes / deps / callables and NO RECIPE, so the Python
  // this writer is stamping was never derived from the Recipe. The
  // claim was an assertion of the canonical Description → Recipe →
  // Python model, not a record of what happened.
  //
  // It survives only where the model actually holds: on a
  // Description-canonical forge, forgeSnippet's sibling
  // _llmGenerateRecipe rebuilt the Recipe from this same Description
  // moments earlier, so "Python is current with the Recipe" is true
  // even though the LLM read the Description. Where the Recipe is the
  // SOURCE — hand-authored, untouched by this forge — the claim is
  // false, and CCQA caught it on real shipped library content.
  const recipeIsProductOfThisForge =
    !input.sourceFacet || input.sourceFacet === 'description';
  return {
    description_hash: input.currentDescriptionHash,
    recipe_hash: input.currentRecipeHash,
    python_hash: input.currentPythonHash,
    recipe_derived_from_description_hash: input.currentDescriptionHash,
    python_derived_from_recipe_hash:
      recipeIsProductOfThisForge ? input.currentRecipeHash : null,
    recipe_derived_from_source_hash: input.currentDescriptionHash,
    python_derived_from_source_hash: input.currentDescriptionHash,
  };
}
