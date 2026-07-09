// v0.2.260 drain 2026-07-03-1400 — I5 semantic: editing any facet
// body immediately makes THAT facet the source. Pure-core for the
// modify-listener logic in main.ts:maybeUpdateSourceFacet.
//
// v0.2.286 (drain 2026-07-09-1600) — renamed from
// facet-edit-canonical-flip-core alongside the S9 field rename
// (`canonical_facet` → `source_facet`).
//
// Prior semantic (v0.2.257) used upstream-wins hash-inference to pick
// source on modify events. That worked when only one facet drifted.
// It FAILED the driver's I5 case: Description had residual drift from
// prior smoke; user edited Recipe; handler saw {desc, recipe} drift;
// upstream-wins picked 'description'. Recipe edit never registered.
//
// New semantic (v0.2.260): the modify event marks the FRESHLY-edited
// facet. That's the drifted facet NOT already recorded as source.
// Applied:
//   - drifted set = {desc, recipe, python} facets whose body-hash
//     doesn't match its stored <facet>_hash.
//   - "new" drift = drifted facets minus {stored source_facet}.
//   - If any new drift: return the last "new" facet in downstream-wins
//     order (Python > Recipe > Description) as tiebreak for the rare
//     case where multiple facets were edited between two modify events.
//   - If no new drift but stored source is drifted: keep stored.
//   - If nothing drifted: 'synced'.
//
// This satisfies I5 for the common case (one facet edited at a time,
// stored source remembers prior source). Downstream-wins is
// retained only as a tiebreak inside the "new" set — not as a bias
// against the stored source.

import type { SourceLayer } from './facet-hash-core.ts';

/** Compute the source_facet value to write after an edit event.
 *
 *  Inputs are hash-comparison results (each facet: is its body-hash
 *  different from its stored <facet>_hash?) plus the stored
 *  source_facet value (or null if absent).
 *
 *  Return value: the new source_facet to write, OR null when no
 *  write is needed (i.e., the computed value equals the stored one).
 *  Caller checks null to skip a no-op frontmatter mutation.
 *
 *  Absent stored hashes count as "matches" (per facet-hash-core's
 *  convention): freshly-minted notes without stored hashes yet don't
 *  surface any drift.
 */
export function computeSourceFacetAfterEdit(
  input: {
    descMismatch: boolean;
    recipeMismatch: boolean;
    pythonMismatch: boolean;
    /** The stored `source_facet` frontmatter value, or null if absent
     *  or not a valid SourceLayer. */
    storedSource: SourceLayer | null;
  },
): SourceLayer {
  const drifted: SourceLayer[] = [];
  if (input.descMismatch) drifted.push('description');
  if (input.recipeMismatch) drifted.push('recipe');
  if (input.pythonMismatch) drifted.push('python');

  // No drift anywhere → 'synced'.
  if (drifted.length === 0) return 'synced';

  // Drifted facets that are NOT the stored source: these represent
  // FRESH drift (a facet just edited that wasn't already source).
  const freshDrift = drifted.filter(f => f !== input.storedSource);

  // I5 semantic: prefer fresh drift over stored source.
  // DOWNSTREAM-wins tiebreak inside the fresh set (rare case of
  // multiple facets edited between modify events). Downstream matches
  // the typical "user just hand-tuned Python after propagating from
  // Description" scenario: given both fresh, Python is the more-recent
  // intent. Prompt §3.2 case 3 encodes this expectation.
  if (freshDrift.length > 0) return freshDrift[freshDrift.length - 1];

  // No fresh drift but SOMETHING drifted → the only drift is the stored
  // source itself. Keep it (user is still editing the same facet).
  // Guaranteed by drifted.length > 0 && freshDrift.length === 0 →
  // stored source must be in drifted.
  return input.storedSource as SourceLayer;
}

/** v0.2.286 back-compat alias — this function was named
 *  `computeCanonicalFacetAfterEdit` before the S9 field rename (drain
 *  2026-07-09-1600). Adapts the old signature (`storedCanonical`) into
 *  the new one (`storedSource`) so external callers keep working for
 *  one release cycle. TODO: delete in v0.2.290. */
export function computeCanonicalFacetAfterEdit(
  input: {
    descMismatch: boolean;
    recipeMismatch: boolean;
    pythonMismatch: boolean;
    storedCanonical: SourceLayer | null;
  },
): SourceLayer {
  return computeSourceFacetAfterEdit({
    descMismatch: input.descMismatch,
    recipeMismatch: input.recipeMismatch,
    pythonMismatch: input.pythonMismatch,
    storedSource: input.storedCanonical,
  });
}
