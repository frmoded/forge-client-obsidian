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
  python_derived_from_recipe_hash: string;
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
  return {
    description_hash: input.currentDescriptionHash,
    recipe_hash: input.currentRecipeHash,
    python_hash: input.currentPythonHash,
    recipe_derived_from_description_hash: input.currentDescriptionHash,
    python_derived_from_recipe_hash: input.currentRecipeHash,
    recipe_derived_from_source_hash: input.currentDescriptionHash,
    python_derived_from_source_hash: input.currentDescriptionHash,
  };
}
