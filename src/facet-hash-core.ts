// v0.2.196 — 3-layer facet hash compute + stale-detection state machine.
//
// V2 notes have three editable facets:
//   - # Description    free-English prose; hash `description_hash`
//   - # Recipe         Recipe dialect body; hash `recipe_hash`
//   - # Python         compiled Python; hash `python_hash`
//
// The IMPLICIT locking model (replaces v0.2.182's explicit
// `lock: recipe-canonical` toggle):
//
//   Whichever facet's content hash does NOT match its stored hash is
//   the CANONICAL layer (it was most recently hand-edited). All facets
//   downstream of canonical are "stale" (will be overwritten on the
//   next regenerate from canonical).
//
//   When canonical == "synced" (all hashes match), the note is in
//   steady-state — Forge-click runs from the cached Python; /generate
//   refreshes Recipe + Python from Description; etc.
//
// Canonical priority (downstream-wins): Python > Recipe > Description.
//   - python edit  → python canonical → Recipe + Description stale
//   - recipe edit  → recipe canonical → Python stale; Description fine
//                    (Description doesn't propagate down from Recipe)
//   - desc edit    → description canonical → Recipe + Python stale
//
// Pure-core (no `obsidian` import). All helpers operate on the full
// note body markdown string.

import { computeDescriptionHash } from './description-hash-core.ts';

/** The canonical-layer label produced by `whichLayerIsCanonical`.
 *
 *  `synced` means all three facets' content hashes match the stored
 *  frontmatter hashes — steady-state, post-/generate or post-Forge.
 *
 *  `description` / `recipe` / `python` mean that facet was last
 *  hand-edited and its downstream facets are stale.
 */
export type CanonicalLayer = 'description' | 'recipe' | 'python' | 'synced';


/** Compute the stable hash for a single facet body. Same normalization
 *  as `computeDescriptionHash` (trim trailing per-line whitespace,
 *  strip top/bottom blank lines). The three facets share one
 *  normalization shape so we can compare apples to apples. */
export async function computeFacetHash(
  text: string | null | undefined,
): Promise<string> {
  // Reuse description hash — same normalization for all three facets.
  return computeDescriptionHash(text ?? '');
}


/** Read the canonical-layer label by comparing each facet's current
 *  content hash to its stored frontmatter hash.
 *
 *  Resolves to:
 *  - `synced`     — all stored hashes present and match
 *  - `python`     — python_hash mismatch (highest priority — downstream)
 *  - `recipe`     — recipe_hash mismatch
 *  - `description`— description_hash mismatch
 *
 *  An absent stored hash counts as "matches" (no mismatch surfaced) so
 *  freshly minted notes without hashes yet aren't reported as canonical
 *  in any one facet. The /generate flow stamps all three at synced
 *  baseline; from then on edits drive the state machine.
 */
export async function whichLayerIsCanonical(
  body: string,
  helpers: {
    extractDescription: (body: string) => string;
    extractRecipeSection: (body: string) => string | null;
    extractPythonSection: (body: string) => string | null;
    getFrontmatterField: (body: string, key: string) => string | null;
  },
): Promise<CanonicalLayer> {
  const descText = helpers.extractDescription(body);
  const recipeText = helpers.extractRecipeSection(body) ?? '';
  const pythonText = helpers.extractPythonSection(body) ?? '';

  const storedDesc = helpers.getFrontmatterField(body, 'description_hash');
  const storedRecipe = helpers.getFrontmatterField(body, 'recipe_hash');
  const storedPython = helpers.getFrontmatterField(body, 'python_hash');

  const currentDesc = await computeFacetHash(descText);
  const currentRecipe = await computeFacetHash(recipeText);
  const currentPython = await computeFacetHash(pythonText);

  const pythonMismatch = storedPython !== null && storedPython !== currentPython;
  const recipeMismatch = storedRecipe !== null && storedRecipe !== currentRecipe;
  const descMismatch = storedDesc !== null && storedDesc !== currentDesc;

  // Downstream priority — closer to execution wins. A user editing
  // Python on top of a stale Recipe is in "Python canonical" mode;
  // Recipe-canonical only applies when Python matches its hash.
  if (pythonMismatch) return 'python';
  if (recipeMismatch) return 'recipe';
  if (descMismatch) return 'description';
  return 'synced';
}


/** Detect each facet that is currently stale (downstream of canonical).
 *
 *  Returns a set of facet names that should be visually grayed.
 *  The canonical facet itself is NEVER in the returned set; it's the
 *  authoritative source. Facets without a stored hash are not stale
 *  (they're considered "absent / fresh" rather than out-of-sync).
 *
 *  Stale-set rules per canonical:
 *  - description canonical → recipe + python stale
 *  - recipe canonical      → python stale (description is upstream;
 *                            unaffected by Recipe edits)
 *  - python canonical      → description + recipe both stale
 *                            (Python is downstream of both)
 *  - synced                → empty set
 */
export async function detectStaleFacets(
  body: string,
  helpers: {
    extractDescription: (body: string) => string;
    extractRecipeSection: (body: string) => string | null;
    extractPythonSection: (body: string) => string | null;
    getFrontmatterField: (body: string, key: string) => string | null;
  },
): Promise<Set<'description' | 'recipe' | 'python'>> {
  const canonical = await whichLayerIsCanonical(body, helpers);
  if (canonical === 'synced') return new Set();
  if (canonical === 'description') return new Set(['recipe', 'python']);
  if (canonical === 'recipe') return new Set(['python']);
  // python canonical
  return new Set(['description', 'recipe']);
}
