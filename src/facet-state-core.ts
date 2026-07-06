// v0.2.264 — Constitution V2a v11.6 hexa-state visibility. Drain
// 2026-07-03-1500 supersedes v11.4 tri-state (source/derived/stale)
// with six suffix states + immediate-parent lineage semantics.
//
// State semantics (v11.6 S9):
// - Source: this facet drives runtime; content is authoritative.
// - DerivedFromDescription: Recipe reflects current Description
//   (recipe_derived_from_description_hash === description_hash).
// - DerivedFromRecipe: Python reflects current Recipe AND Recipe is
//   itself in sync with Description (transitive freshness).
// - DerivedFromDescriptionOutOfDate: Recipe's lineage points at a
//   prior Description state.
// - DerivedFromRecipeOutOfDate: Python's lineage points at a prior
//   Recipe state OR Recipe is transitively out of date from
//   Description (transitive; drives Python out-of-date regardless of
//   local hash match).
// - Ignored: this facet is upstream of the current canonical in the
//   D → R → P chain — no derivation relationship to the canonical.
//
// Description has no `— derived from X` variants (top of chain).
// Python's parent is Recipe (immediate parent — Q1 hexa-state).

import type { CanonicalLayer } from './facet-hash-core.ts';

export type FacetName = 'description' | 'recipe' | 'python';

// `enum` syntax isn't supported in strip-only TS runners (node --test),
// so use a const object + literal-union type instead.
export const FacetState = {
  Source: 'source',
  DerivedFromDescription: 'derived_from_description',
  DerivedFromRecipe: 'derived_from_recipe',
  DerivedFromDescriptionOutOfDate: 'derived_from_description_out_of_date',
  DerivedFromRecipeOutOfDate: 'derived_from_recipe_out_of_date',
  Ignored: 'ignored',
} as const;
export type FacetState = typeof FacetState[keyof typeof FacetState];

/** Facet chain position — Description upstream, Python downstream. */
export const CHAIN_POSITION: Record<FacetName, number> = {
  description: 0,
  recipe: 1,
  python: 2,
};

/** Every FacetName in chain order. */
export const ALL_FACETS: readonly FacetName[] = ['description', 'recipe', 'python'];

/** Frontmatter reader shape — hexa-state reads stored hashes +
 *  parent-hash fields (v11.6) with fallback to legacy source-hash
 *  fields (v11.4/v11.5 transition period). */
export interface FacetStateFrontmatterReader {
  getFrontmatterField(key: string): string | null;
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
  // Legacy `python_derived_from_source_hash` semantics ambiguous:
  // could be Description hash (two-hop Description-canonical) or
  // Recipe hash (one-hop Recipe-canonical). Caller resolves by
  // comparing against current recipe_hash — done inline in
  // computeFacetStates.
  return fm.getFrontmatterField('python_derived_from_source_hash');
}

/** Compute per-facet lineage state given the canonical + a
 *  frontmatter reader. Pure; deterministic; no I/O.
 *
 *  Rules (v11.6 §S9):
 *  - `facet === canonical` → Source.
 *  - `facet` upstream of canonical → Ignored.
 *  - `facet` downstream of canonical:
 *    - Recipe: check `recipe_derived_from_description_hash === current description_hash`.
 *      Match → DerivedFromDescription; mismatch or absent → out-of-date.
 *    - Python: check both Recipe's state (transitive) and Python's local match.
 *      Truth table per §2.1 of drain 1500 prompt.
 *  - `canonical === 'synced'` → delegate to 'description' (v11.4.1 preserved).
 */
export function computeFacetStates(
  canonical: CanonicalLayer,
  fm: FacetStateFrontmatterReader,
): Record<FacetName, FacetState> {
  if (canonical === 'synced') {
    // v11.4.1 convention preserved under v11.6: synced renders same
    // as description-canonical (Description is source, Recipe and
    // Python are downstream).
    return computeFacetStates('description', fm);
  }

  const out: Record<FacetName, FacetState> = {
    description: FacetState.Ignored,
    recipe: FacetState.Ignored,
    python: FacetState.Ignored,
  };

  const currentDescHash = fm.getFrontmatterField('description_hash');
  const currentRecipeHash = fm.getFrontmatterField('recipe_hash');

  // Description
  if (canonical === 'description') {
    out.description = FacetState.Source;
  } else {
    // Upstream of Recipe or Python canonical → Ignored (initial value stands).
  }

  // Recipe
  if (canonical === 'recipe') {
    out.recipe = FacetState.Source;
  } else if (canonical === 'python') {
    out.recipe = FacetState.Ignored;
  } else {
    // canonical === 'description' — Recipe is downstream.
    const recipeParent = readParentHash(fm, 'recipe');
    if (recipeParent !== null && currentDescHash !== null && recipeParent === currentDescHash) {
      out.recipe = FacetState.DerivedFromDescription;
    } else {
      out.recipe = FacetState.DerivedFromDescriptionOutOfDate;
    }
  }

  // Python
  if (canonical === 'python') {
    out.python = FacetState.Source;
  } else if (canonical === 'recipe') {
    // One-hop downstream — check python_derived_from_recipe_hash === current recipe_hash.
    const pythonParent = readParentHash(fm, 'python');
    if (pythonParent !== null && currentRecipeHash !== null && pythonParent === currentRecipeHash) {
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
      // against current recipe_hash.
      const pythonParentField = fm.getFrontmatterField('python_derived_from_recipe_hash');
      if (pythonParentField !== null) {
        if (currentRecipeHash !== null && pythonParentField === currentRecipeHash) {
          out.python = FacetState.DerivedFromRecipe;
        } else {
          out.python = FacetState.DerivedFromRecipeOutOfDate;
        }
      } else {
        // v11.6 parent hash absent — fall back to legacy
        // python_derived_from_source_hash. In two-hop Description-canonical,
        // legacy field could point at Description hash (v11.4.1+ backfill
        // shape). Per CW-1500-B, treat absent v11.6 field as out of date;
        // the safe default renders `— derived from Recipe, out of date`
        // until cohort re-forges.
        const legacy = fm.getFrontmatterField('python_derived_from_source_hash');
        if (legacy !== null && currentRecipeHash !== null && legacy === currentRecipeHash) {
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
