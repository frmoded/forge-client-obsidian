// Drain 2026-08-26-1620 — machinery may never overwrite a SOURCE facet.
//
// THE P1 (CCQA check-3). Hand-edit `# Python`, `source_facet: python`
// stamped, Run → the edit is honoured (drain 0110/2390's routing working
// correctly). The NEXT Run silently served a Recipe-derived body, with
// `source_facet: python` still stamped and
// `python_derived_from_recipe_hash == recipe_hash`.
//
// The chain, probed rather than assumed: run ONE routes to the hand
// Python and executes it correctly, and THEN the post-run refresh
// (`shouldRefreshPythonAfterRun` → `writeSourcePythonBack`, drain 2530)
// re-transpiles the Recipe over the top of it. Run TWO reads the
// overwrite. So the hand edit survives exactly one run — and the
// frontmatter then claims a derivation for a facet the cohort wrote by
// hand. Data loss plus a metadata lie.
//
// 2530's refresh is CORRECT for a recipe-canonical note: `# Python` is
// derived there, and keeping it consistent with what ran is the point.
// It is catastrophic for a python-canonical note, where `# Python` is
// the SOURCE. The refresh never asked which it was.
//
// §3 asked for the property asserted GENERALLY, with one guard: a
// source facet is read-only to machinery, everywhere. That is this
// module. It is deliberately not python-specific — a Description-
// canonical note's Description and a Recipe-canonical note's Recipe are
// protected by the same call.

export type Facet = 'description' | 'recipe' | 'python';

/**
 * May machinery overwrite `facet` on a note whose stored source is
 * `storedSource`?
 *
 * `storedSource` is the note's own `source_facet` frontmatter — a
 * STORED fact since drain 1200, not an inference, which is what makes
 * this answerable at a write site without re-deriving hashes.
 *
 * Unknown or absent source (`null`) permits the write. That is the
 * conservative direction HERE, and it is the opposite of the belts'
 * conservatism, deliberately: a note with no recorded source facet is
 * pre-1200 state, and refusing every write on it would freeze those
 * notes' derived facets forever. The risk it accepts is bounded —
 * without a stored source there is no hand-edit claim to protect.
 */
export function mayMachineWriteFacet(
  facet: Facet,
  storedSource: string | null | undefined,
): boolean {
  if (!storedSource) return true;
  return storedSource !== facet;
}

/** Why a write was refused — for the console, so a skipped refresh is
 *  visible rather than mysterious. */
export function sourceFacetWriteRefusal(facet: Facet, notePath: string): string {
  return (
    `refusing to overwrite ${notePath}'s # ${facet[0].toUpperCase()}${facet.slice(1)} `
    + `— it is this note's source facet, not a derived one. `
    + `(drain 2026-08-26-1620: machinery is read-only against a source facet.)`
  );
}
