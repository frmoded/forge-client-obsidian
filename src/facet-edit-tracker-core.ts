// v0.2.260 drain 2026-07-03-1400 §Option A — per-file hash cache to
// identify the "just edited" facet independent of stored-hash residual
// drift.
//
// Why: drain 1400's initial semantic (facet-edit-canonical-flip-core)
// used stored_hash mismatches to detect drift. When a note has
// residual drift across multiple facets (stale hashes accumulated
// across sessions), the mismatches don't tell us WHICH facet was
// just edited. The driver's slow_burn.md rehearsal surfaced this:
// 3-way drift + Description edit produced canonical=recipe because
// downstream-wins picked the wrong "fresh" candidate.
//
// Fix: track last-known body hashes per file in an in-memory cache.
// On each modify event, compare CURRENT hashes to CACHED (not to
// stored_hash). The facet whose current hash differs from cached IS
// the freshly-edited one — regardless of stored_hash state.
//
// Bootstrap: cache is populated on plugin load (onLayoutReady iterates
// open files) and on file-open events. First modify on a fresh entry
// updates cache without writing canonical (no baseline to compare
// against).

import type { CanonicalLayer } from './facet-hash-core.ts';

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
 *    - Downstream-most changed facet when multiple differ (rare —
 *      multi-facet edits between two modify events, e.g., a paste
 *      that spans facets). Downstream matches the "typical user
 *      just hand-tuned Python after propagating from Description"
 *      intent.
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
  // flipped canonical_facet: python. Description + Recipe subsequently
  // rendered `— ignored` and L45 short-circuited through the Python
  // facet even when cohort didn't Python-edit. Upstream-wins
  // ('description') is the safer default: Description-authored intent
  // survives external rewrites unless single-facet evidence proves
  // otherwise. Single-facet cases unaffected — `changed[0]` equals
  // `changed[length-1]` when only one facet moved.
  return changed[0];
}

/** Compute the canonical_facet to write given the edit-tracker's
 *  determination + the currently-stored canonical value.
 *
 *  When editedFacet is null (no cached baseline OR no change), keep
 *  storedCanonical as-is. Return null to signal "no write needed."
 *
 *  When editedFacet matches storedCanonical, no write is needed
 *  (idempotent).
 *
 *  When editedFacet differs from storedCanonical, return the new
 *  value.
 */
export function decideCanonicalWrite(
  editedFacet: 'description' | 'recipe' | 'python' | null,
  storedCanonical: CanonicalLayer | null,
): CanonicalLayer | null {
  if (editedFacet === null) return null;
  if (editedFacet === storedCanonical) return null;
  return editedFacet;
}
