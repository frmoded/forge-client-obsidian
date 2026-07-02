// v0.2.243 — Constitution V2a v11.4 tri-state visibility. Drain
// 2026-07-03-0200 supersedes v11.3's binary source/reference
// distinction with source/derived/stale.
//
// State semantics (from v11.4 S9):
// - Source: this facet drives runtime; content is authoritative
//   (matches canonical detection from facet-hash-core).
// - Derived: this facet was auto-produced from current source and
//   its stored `<facet>_derived_from_source_hash` matches the
//   canonical's current hash.
// - Stale: this facet's content does not reflect current source.
//   Either upstream of canonical in the D→R→P chain (upstream is
//   inherently stale — never auto-regenerated), OR downstream with
//   a derived_from_source_hash that no longer matches current
//   canonical hash.
//
// Canonical detection is unchanged from v11.3 (facet-hash-core.ts).
// This module only computes the tri-state on top of a known
// canonical.

import type { CanonicalLayer } from './facet-hash-core.ts';

export type FacetName = 'description' | 'recipe' | 'python';

// `enum` syntax isn't supported in strip-only TS runners (node --test),
// so use a const object + literal-union type instead. Same call sites:
// FacetState.Source, FacetState.Derived, FacetState.Stale.
export const FacetState = {
  Source: 'source',
  Derived: 'derived',
  Stale: 'stale',
} as const;
export type FacetState = typeof FacetState[keyof typeof FacetState];

/** Facet chain position — Description upstream, Python downstream.
 *  Position numbers used for upstream/downstream test only; the
 *  D→R→P generation direction is a constitutional invariant
 *  (v11.4 §3.3). */
export const CHAIN_POSITION: Record<FacetName, number> = {
  description: 0,
  recipe: 1,
  python: 2,
};

/** Every FacetName in chain order. Exported for iterators + view
 *  plugin widget mounting. */
export const ALL_FACETS: readonly FacetName[] = ['description', 'recipe', 'python'];

/** Frontmatter reader shape — the tri-state computation only needs
 *  to read stored hashes + derived-from-source-hashes. Caller
 *  supplies the reader so this stays testable without an Obsidian
 *  runtime.
 *
 *  For any missing field, return null (v11.4 treats absent hashes
 *  the same as v11.3 did — the state machine short-circuits on
 *  null). */
export interface FacetStateFrontmatterReader {
  getFrontmatterField(key: string): string | null;
}

/** Compute per-facet state given a known canonical + a frontmatter
 *  reader. Pure; deterministic; no I/O.
 *
 *  Rules (v11.4 §3.3):
 *  - `facet === canonical` → Source.
 *  - `facet` upstream of canonical → Stale (upstream never
 *    regenerates automatically).
 *  - `facet` downstream of canonical:
 *    - if stored `<facet>_derived_from_source_hash` === canonical's
 *      current hash → Derived (recently forged).
 *    - else → Stale (either the field is absent, or its stored
 *      value points at a prior source hash).
 *  - `canonical === 'synced'` → all three facets return Source
 *    (rare; occurs post-backfill when no drift has happened yet).
 */
export function computeFacetStates(
  canonical: CanonicalLayer,
  fm: FacetStateFrontmatterReader,
): Record<FacetName, FacetState> {
  if (canonical === 'synced') {
    // No drift → nothing is stale/derived. Treat all as source
    // (v11.4 §3.3 default — cohort sees no `— reference` cruft on
    // freshly-forged aligned notes).
    return {
      description: FacetState.Source,
      recipe: FacetState.Source,
      python: FacetState.Source,
    };
  }
  const canonicalPos = CHAIN_POSITION[canonical];
  const canonicalHash = fm.getFrontmatterField(`${canonical}_hash`);

  const out: Record<FacetName, FacetState> = {
    description: FacetState.Stale,
    recipe: FacetState.Stale,
    python: FacetState.Stale,
  };

  for (const facet of ALL_FACETS) {
    if (facet === canonical) {
      out[facet] = FacetState.Source;
      continue;
    }
    if (CHAIN_POSITION[facet] < canonicalPos) {
      out[facet] = FacetState.Stale;
      continue;
    }
    // Downstream — check derived_from_source_hash.
    const derivedFrom = fm.getFrontmatterField(`${facet}_derived_from_source_hash`);
    if (derivedFrom !== null && canonicalHash !== null && derivedFrom === canonicalHash) {
      out[facet] = FacetState.Derived;
    } else {
      out[facet] = FacetState.Stale;
    }
  }
  return out;
}
