// v0.2.270 (drain 2026-07-06-1700) — CW-1700 fix: computeFacetStates
// accepts computed current-body hashes for the freshness comparison
// instead of reading stored `<facet>_hash` frontmatter fields.
//
// Root cause of CW-1700 (found in drain 1500 re-rehearsal): stored
// hashes only rewrite at forge/backfill time (drain 1200 "stored =
// last-forged snapshot" invariant, load-bearing for I5's hash cache).
// Hand-edits do NOT update stored hashes. So comparing
// `recipe_derived_from_description_hash === fm.description_hash`
// always passed post-hand-edit (both point at last-forged snapshot),
// rendering "in sync" even though the actual Description body drifted.
//
// Option B fix: ViewPlugin computes current-body SHA-256 hashes at
// render time and passes them to computeFacetStates. Stored
// frontmatter hashes still drive canonical detection + I5 hash cache
// + backfill; ONLY the freshness comparison uses current-body hashes.
//
// v0.2.264 (drain 2026-07-03-1500) — original v11.6 hexa-state impl.
// v11.6 S9 semantics unchanged; only the implementation surface changes.

import type { SourceLayer } from './facet-hash-core.ts';

export type FacetName = 'description' | 'recipe' | 'python';

export const FacetState = {
  Source: 'source',
  DerivedFromDescription: 'derived_from_description',
  DerivedFromRecipe: 'derived_from_recipe',
  DerivedFromDescriptionOutOfDate: 'derived_from_description_out_of_date',
  DerivedFromRecipeOutOfDate: 'derived_from_recipe_out_of_date',
  Ignored: 'ignored',
} as const;
export type FacetState = typeof FacetState[keyof typeof FacetState];

export const CHAIN_POSITION: Record<FacetName, number> = {
  description: 0,
  recipe: 1,
  python: 2,
};

export const ALL_FACETS: readonly FacetName[] = ['description', 'recipe', 'python'];

export interface FacetStateFrontmatterReader {
  getFrontmatterField(key: string): string | null;
}

/** CW-1700 (drain 1700) — computed current-body SHA-256 hashes for each
 *  facet. ViewPlugin computes these at render time from the actual
 *  body content on disk. Passed to computeFacetStates for freshness
 *  comparison. Stored `<facet>_hash` frontmatter fields are NOT used
 *  for freshness after this drain — they remain "last-forged snapshot"
 *  per the drain 1200 invariant.
 */
export interface CurrentBodyHashes {
  description: string;
  recipe: string;
  python: string;
}

/** Read the parent-hash field for a facet with fallback to legacy
 *  `_source_hash` field (v11.4/v11.5 transition). Returns null when
 *  both are absent. */
function readParentHash(
  fm: FacetStateFrontmatterReader,
  facet: 'recipe' | 'python',
): string | null {
  if (facet === 'recipe') {
    const v11_6 = fm.getFrontmatterField('recipe_derived_from_description_hash');
    if (v11_6 !== null) return v11_6;
    return fm.getFrontmatterField('recipe_derived_from_source_hash');
  }
  const v11_6 = fm.getFrontmatterField('python_derived_from_recipe_hash');
  if (v11_6 !== null) return v11_6;
  return fm.getFrontmatterField('python_derived_from_source_hash');
}

/** Compute per-facet lineage state given the canonical + a
 *  frontmatter reader + computed current-body hashes.
 *
 *  CW-1700 semantic (drain 1700): freshness comparison uses
 *  `currentBodyHashes.description` / `.recipe` (computed from actual
 *  disk content) rather than stored `<facet>_hash` frontmatter fields.
 *  Fires correctly immediately after hand-edit.
 *
 *  Rules (v11.6 §S9):
 *  - `facet === canonical` → Source.
 *  - `facet` upstream of canonical → Ignored.
 *  - `facet` downstream of canonical:
 *    - Recipe: check `recipe_derived_from_description_hash === currentBodyHashes.description`.
 *      Match → DerivedFromDescription; mismatch or absent → out-of-date.
 *    - Python: check both Recipe's state (transitive) and Python's local match against currentBodyHashes.recipe.
 *  - `canonical === 'synced'` → delegate to 'description' (v11.4.1 preserved).
 */
export function computeFacetStates(
  canonical: SourceLayer,
  fm: FacetStateFrontmatterReader,
  currentBodyHashes: CurrentBodyHashes,
): Record<FacetName, FacetState> {
  if (canonical === 'synced') {
    return computeFacetStates('description', fm, currentBodyHashes);
  }

  const out: Record<FacetName, FacetState> = {
    description: FacetState.Ignored,
    recipe: FacetState.Ignored,
    python: FacetState.Ignored,
  };

  // Description
  if (canonical === 'description') {
    out.description = FacetState.Source;
  }

  // Recipe
  if (canonical === 'recipe') {
    out.recipe = FacetState.Source;
  } else if (canonical === 'python') {
    out.recipe = FacetState.Ignored;
  } else {
    // canonical === 'description' — Recipe is downstream.
    // CW-1700: compare parent-hash stamp against CURRENT-body description hash.
    const recipeParent = readParentHash(fm, 'recipe');
    if (recipeParent !== null && recipeParent === currentBodyHashes.description) {
      out.recipe = FacetState.DerivedFromDescription;
    } else {
      out.recipe = FacetState.DerivedFromDescriptionOutOfDate;
    }
  }

  // Python
  if (canonical === 'python') {
    out.python = FacetState.Source;
  } else if (canonical === 'recipe') {
    // One-hop downstream — check python_derived_from_recipe_hash === current recipe body hash.
    // CW-1700: compare against CURRENT-body recipe hash.
    const pythonParent = readParentHash(fm, 'python');
    if (pythonParent !== null && pythonParent === currentBodyHashes.recipe) {
      out.python = FacetState.DerivedFromRecipe;
    } else {
      out.python = FacetState.DerivedFromRecipeOutOfDate;
    }
  } else {
    // canonical === 'description' — Python is two hops downstream.
    // Transitive out-of-date: if Recipe is out of date, Python is out
    // of date regardless of local match (Q3 hexa-state).
    const recipeState = out.recipe;
    if (recipeState === FacetState.DerivedFromDescriptionOutOfDate) {
      out.python = FacetState.DerivedFromRecipeOutOfDate;
    } else {
      // Recipe in sync with Description. Check Python's local match
      // against CURRENT-body recipe hash (CW-1700).
      const pythonParentField = fm.getFrontmatterField('python_derived_from_recipe_hash');
      if (pythonParentField !== null) {
        if (pythonParentField === currentBodyHashes.recipe) {
          out.python = FacetState.DerivedFromRecipe;
        } else {
          out.python = FacetState.DerivedFromRecipeOutOfDate;
        }
      } else {
        // v11.6 parent hash absent — fall back to legacy
        // python_derived_from_source_hash. CW-1500-B safe default:
        // treat absent v11.6 field as out of date; the safe default
        // renders `— derived from Recipe, out of date` until cohort re-forges.
        const legacy = fm.getFrontmatterField('python_derived_from_source_hash');
        if (legacy !== null && legacy === currentBodyHashes.recipe) {
          out.python = FacetState.DerivedFromRecipe;
        } else {
          out.python = FacetState.DerivedFromRecipeOutOfDate;
        }
      }
    }
  }

  return out;
}

/** Helper for widget rendering: returns the suffix text for a given
 *  facet state per v11.6 §2.2 table. View-only; on-disk headings
 *  remain unadorned. */
export function suffixTextForState(state: FacetState): string {
  switch (state) {
    case FacetState.Source:
      return '— source';
    case FacetState.DerivedFromDescription:
      return '— derived from Description';
    case FacetState.DerivedFromRecipe:
      return '— derived from Recipe';
    case FacetState.DerivedFromDescriptionOutOfDate:
      return '— derived from Description, out of date';
    case FacetState.DerivedFromRecipeOutOfDate:
      return '— derived from Recipe, out of date';
    case FacetState.Ignored:
      return '— ignored';
  }
}
