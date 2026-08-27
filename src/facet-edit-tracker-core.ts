// v0.2.260 drain 2026-07-03-1400 §Option A — per-file hash cache to
// identify the "just edited" facet independent of stored-hash residual
// drift.
//
// Why: drain 1400's initial semantic (facet-edit-canonical-flip-core)
// used stored_hash mismatches to detect drift. When a note has
// residual drift across multiple facets (stale hashes accumulated
// across sessions), the mismatches don't tell us WHICH facet was
// just edited. The driver's slow_burn.md rehearsal surfaced this:
// 3-way drift + Description edit produced source=recipe because
// downstream-wins picked the wrong "fresh" candidate.
//
// Fix: track last-known body hashes per file in an in-memory cache.
// On each modify event, compare CURRENT hashes to CACHED (not to
// stored_hash). The facet whose current hash differs from cached IS
// the freshly-edited one — regardless of stored_hash state.
//
// Bootstrap: cache is populated on plugin load (onLayoutReady iterates
// open files) and on file-open events. First modify on a fresh entry
// updates cache without writing source (no baseline to compare
// against).

import type { SourceLayer } from './facet-hash-core.ts';

/** Snapshot of the three facet body hashes for a single file. */
export interface FacetHashes {
  desc: string;
  recipe: string;
  python: string;
}

/** Determine which facet was just edited given current vs cached hashes.
 *
 *  Returns:
 *    - `null` when cached is null (no baseline) or nothing changed.
 *    - The facet name when exactly one facet's hash differs.
 *    - Upstream-most CHANGED facet when multiple differ. The common
 *      cause is not a human paste spanning facets but an EXTERNAL
 *      REWRITE — `git restore`, `cp`, a sync tool — replacing the file
 *      under the plugin. See the tiebreak comment in the body for what
 *      that does and does not guarantee; in short, it cannot resolve
 *      to 'python', but it does not always resolve to 'description'.
 *
 *  This function does NOT read stored_hash. It only considers what
 *  changed since we last observed the file body.
 */
export function identifyEditedFacet(
  current: FacetHashes,
  cached: FacetHashes | null,
): 'description' | 'recipe' | 'python' | null {
  if (cached === null) return null;
  const changed: Array<'description' | 'recipe' | 'python'> = [];
  if (current.desc !== cached.desc) changed.push('description');
  if (current.recipe !== cached.recipe) changed.push('recipe');
  if (current.python !== cached.python) changed.push('python');
  if (changed.length === 0) return null;
  // CW-1800 (2026-07-06 driver call) — upstream-wins tiebreak on
  // multi-facet change. External file rewrites (cp / git checkout /
  // sync tools) change all three facets simultaneously; pre-CW-1800
  // downstream-wins wrongly attributed them to a Python edit and
  // flipped source_facet: python. Description + Recipe subsequently
  // rendered `— ignored` and L45 short-circuited through the Python
  // facet even when cohort didn't Python-edit. Single-facet cases are
  // unaffected — `changed[0]` equals `changed[length-1]` when only one
  // facet moved.
  //
  // WHAT THIS ACTUALLY GUARANTEES (drain 2026-08-25-1000, correcting
  // an overstatement that stood here). This is upstream-most CHANGED,
  // not upstream-most. The old wording — "Description-authored intent
  // survives external rewrites" — is true only when the rewrite also
  // touched the Description. When a rewrite moves Recipe and Python
  // but leaves Description alone, this returns 'recipe' and the note's
  // `source_facet` flips description → recipe.
  //
  // That is not hypothetical: it is exactly what a `git restore` of a
  // note carrying machine write-back does, and it happened to
  // forge-tutorial's cheer.md during drain 0130. Reproduced against
  // these functions in `source-facet-external-rewrite.test.ts`.
  //
  // The guarantee that DOES hold, and the one CW-1800 was really
  // bought for: **a multi-facet change can never resolve to 'python'**,
  // because Description and Recipe both precede it in `changed`. That
  // matters more since drain 0110, which made the ENGINE route on
  // `source_facet` — so 'python' is the one value an unprompted flip
  // could use to change which code executes. It is unreachable here
  // unless Python is the sole facet that moved, i.e. a real, targeted
  // Python edit.
  return changed[0];
}

/** Compute the source_facet value to write given the edit-tracker's
 *  determination + the currently-stored source value.
 *
 *  When editedFacet is null (no cached baseline OR no change), keep
 *  storedSource as-is. Return null to signal "no write needed."
 *
 *  When editedFacet matches storedSource, no write is needed
 *  (idempotent).
 *
 *  When editedFacet differs from storedSource, return the new
 *  value.
 */
export function decideSourceWrite(
  editedFacet: 'description' | 'recipe' | 'python' | null,
  storedSource: SourceLayer | null,
): SourceLayer | null {
  if (editedFacet === null) return null;
  if (editedFacet === storedSource) return null;
  return editedFacet;
}

/** v0.2.286 back-compat alias — `decideSourceWrite` was named
 *  `decideCanonicalWrite` before the S9 field rename (drain
 *  2026-07-09-1600). External callers can continue to import the old
 *  name for one release cycle.
 *  TODO: delete in v0.2.290. */
export const decideCanonicalWrite = decideSourceWrite;

/** Which facets moved since the last observation. Extracted at drain
 *  2026-08-25-1060 so the decision layer can see the whole change set,
 *  not just its upstream-most member. */
export function changedFacets(
  current: FacetHashes,
  cached: FacetHashes | null,
): Array<'description' | 'recipe' | 'python'> {
  if (cached === null) return [];
  const changed: Array<'description' | 'recipe' | 'python'> = [];
  if (current.desc !== cached.desc) changed.push('description');
  if (current.recipe !== cached.recipe) changed.push('recipe');
  if (current.python !== cached.python) changed.push('python');
  return changed;
}

/** Decide the `source_facet` write from the full change set.
 *
 *  Drain 2026-08-25-1060 §1 — CW-1800 REFINEMENT, driver adopted.
 *
 *  THE CARVE-OUT: when SEVERAL facets moved and the stored
 *  `source_facet` names one that did NOT move, keep the stored value.
 *  A rewrite that never touched the facet a note points at is not
 *  evidence about where that note's truth lives.
 *
 *  Concretely: a `git restore` of a note carrying machine write-back
 *  moves Recipe and Python and leaves Description alone. Before this,
 *  upstream-wins read that as "the Recipe was just edited" and flipped
 *  `description` -> `recipe`. Drain 1000 reproduced exactly that on
 *  forge-tutorial's cheer.md.
 *
 *  THE TRADE, accepted on the record: a genuine hand edit spanning
 *  Recipe AND Python on a Description-sourced note now also keeps
 *  `description`. CW-1800's own comment calls multi-facet human edits
 *  rare and external rewrites the common case; that is the reasoning.
 *
 *  Single-facet changes are untouched — editing the Recipe of a
 *  Description-sourced note still makes the Recipe the source.
 *
 *  THE GUARANTEE CW-1800 WAS REALLY BOUGHT FOR STILL HOLDS: a
 *  multi-facet change can never resolve to 'python'. Description and
 *  Recipe both precede it, so `changed[0]` is one of them whenever
 *  either moved. That matters because drain 0110 made the ENGINE route
 *  on `source_facet`, making 'python' the one value an unprompted flip
 *  could use to change which code executes. Pinned by a test.
 */
export function decideSourceWriteFromChange(
  changed: ReadonlyArray<'description' | 'recipe' | 'python'>,
  storedSource: SourceLayer | null,
  pythonLineageIsCurrent: boolean = false,
): SourceLayer | null {
  if (changed.length === 0) return null;
  if (
    changed.length > 1
    && storedSource !== null
    && !changed.includes(storedSource as 'description' | 'recipe' | 'python')
  ) {
    return null;
  }
  const target = decideSourceWrite(changed[0], storedSource);

  // GATE M (drain 2026-08-27-1320) — the machine-derived carve-out.
  //
  // Four times this session a drain regenerated a `# Python` facet BY
  // TRANSPILE from the note's own Recipe -- mood, function_inputs,
  // greeting, describe_it -- and this function read it as a targeted
  // hand-edit, flipped `source_facet` to 'python' and dropped the
  // lineage. Every one had to be repaired by hand afterwards.
  //
  // THE SIGNAL: a writer that sets `python_derived_from_recipe_hash`
  // equal to the note's CURRENT `recipe_hash` is asserting "this Python
  // was derived from this Recipe". A person hand-editing Python does not
  // produce that state -- their edit leaves the stamp pointing at
  // whatever it pointed at before, which no longer matches.
  //
  // SCOPE: only when the flip would be to 'python'. A Recipe or
  // Description edit is unaffected, so CW-1800's guarantee is untouched:
  // a multi-facet change still cannot resolve to 'python' at all.
  //
  // THIS IS PURE LINEAGE-HASH MATCHING, not a check that the content is
  // what transpile would actually produce. Verifying that would mean
  // running the transpiler inside a decision module that deliberately has
  // no engine access. A writer that stamps the lineage falsely is telling
  // a lie about provenance, which is a different defect from this one and
  // is not this function's to catch.
  if (target === 'python' && pythonLineageIsCurrent) return null;

  return target;
}
