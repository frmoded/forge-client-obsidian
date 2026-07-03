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
// Canonical is STORED as a frontmatter field `canonical_facet` as of
// v0.2.256 (drain 2026-07-03-1200). Hash-mismatch inference remains
// as a fallback for pre-1200 notes not yet backfilled + as an
// external-edit escape hatch. Upstream-wins tiebreak is retained for
// those fallback paths per driver Choice 3.
//
// Prior versions used hash-mismatch inference as the primary path.
// v0.2.252 (drain 1000) flipped from downstream-wins to upstream-wins
// tiebreak; v0.2.256 makes the whole thing driver-controlled via
// stored field.
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


/** Set of valid canonical-facet frontmatter values. Used for validation
 *  when reading the stored field. */
const VALID_CANONICAL_VALUES = new Set<CanonicalLayer>([
  'description', 'recipe', 'python', 'synced',
]);

/** Read the canonical-layer label.
 *
 *  v0.2.256 (drain 2026-07-03-1200) — canonical is now STORED as a
 *  frontmatter field `canonical_facet: description | recipe | python |
 *  synced`, not inferred from hash-mismatch comparison. The plugin
 *  writes the field on hand-edit events; programmatic writes don't
 *  touch it. Constitution V2a v11.5 §S9 amendment codifies the shift.
 *
 *  Resolution order:
 *   1. Stored `canonical_facet` present + valid → return it.
 *      Exception: external multi-facet edit (stored value points at a
 *      facet with no drift, but ANOTHER facet has drift) — flip to the
 *      drifted facet. This catches external tools (git, sed) that
 *      bypassed the plugin's write path.
 *   2. Stored field absent OR invalid → fall back to hash-mismatch
 *      inference (upstream-wins, drain 1000 semantics). Used for
 *      pre-1200 notes not yet backfilled. Once the backfill runs on
 *      first open per session, this path is dormant.
 *
 *  An absent stored hash counts as "matches" (no mismatch surfaced) so
 *  freshly minted notes without hashes aren't reported as canonical
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

  // v0.2.256 drain 1200 primary path — read stored canonical_facet.
  const storedCanonical = helpers.getFrontmatterField(body, 'canonical_facet');
  if (storedCanonical !== null && VALID_CANONICAL_VALUES.has(storedCanonical as CanonicalLayer)) {
    const stored = storedCanonical as CanonicalLayer;
    // External multi-facet edit detection: if the stored value points
    // at a facet with no drift, but ANOTHER facet has drift, flip to
    // the drifted facet. Preserves the observable "editing a facet
    // body makes that facet canonical" invariant even when the edit
    // came from outside the plugin's write path.
    const storedIsSynced = stored === 'synced';
    const storedFacetHasDrift =
      (stored === 'description' && descMismatch) ||
      (stored === 'recipe' && recipeMismatch) ||
      (stored === 'python' && pythonMismatch);
    if (!storedIsSynced && !storedFacetHasDrift) {
      // Stored value stale relative to actual body drift. Fall through
      // to hash inference to find the actual drifted facet.
      if (descMismatch || recipeMismatch || pythonMismatch) {
        // Upstream-wins fallback per driver Choice 3 confirmation.
        if (descMismatch) return 'description';
        if (recipeMismatch) return 'recipe';
        if (pythonMismatch) return 'python';
      }
      // No drift anywhere → note is actually synced; honor that.
      return 'synced';
    }
    return stored;
  }

  // Fallback path — canonical_facet absent or invalid. Applies to
  // pre-1200 notes not yet backfilled. Upstream-wins tiebreak (drain
  // 1000). Backfill will seed the field on first open per session.
  if (descMismatch) return 'description';
  if (recipeMismatch) return 'recipe';
  if (pythonMismatch) return 'python';
  return 'synced';
}


/** Detect each facet that is currently stale (non-canonical).
 *
 *  Returns a set of facet names that should be marked "reference /
 *  documentation only" (per S9 v11.3). The canonical facet itself
 *  is NEVER in the returned set; it's the authoritative source.
 *  Facets without a stored hash are not stale (they're considered
 *  "absent / fresh" rather than out-of-sync).
 *
 *  v0.2.242 drain 2026-07-03-0100 — Constitution V2a v11.3 S9 spec
 *  reads "non-canonical facets" (plural). All facets except the
 *  canonical one are stale, regardless of upstream/downstream:
 *  - description canonical → recipe + python stale
 *  - recipe canonical      → description + python stale
 *  - python canonical      → description + recipe stale
 *  - synced                → empty set
 *
 *  Rationale: the suffix communicates SOURCE-OF-TRUTH, not
 *  auto-regeneration. Cohort scanning the note sees "no suffix
 *  = currently driving runtime." Upstream Description under a
 *  Recipe-canonical state may or may not still be accurate; the
 *  hint tells cohort to VERIFY.
 *
 *  Prior implementation (v0.2.239-v0.2.241) marked only downstream
 *  facets — Recipe-canonical marked Python only, missing Description.
 *  Driver 2026-07-03 flagged the asymmetric UX.
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
  const all: Array<'description' | 'recipe' | 'python'> = [
    'description', 'recipe', 'python',
  ];
  return new Set(all.filter(f => f !== canonical));
}
