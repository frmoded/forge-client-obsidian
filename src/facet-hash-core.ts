// v0.2.196 — 3-layer facet hash compute + stale-detection state machine.
//
// V2 notes have three editable facets:
//   - # Description    free-English prose; hash `description_hash`
//   - # Recipe         Recipe dialect body; hash `recipe_hash`
//   - # Python         compiled Python; hash `python_hash`
//
// The IMPLICIT locking model (replaces v0.2.182's explicit
// `lock: recipe-source` toggle):
//
//   Whichever facet's content hash does NOT match its stored hash is
//   the SOURCE layer (it was most recently hand-edited). All facets
//   downstream of source are "stale" (will be overwritten on the
//   next regenerate from source).
//
//   When source == "synced" (all hashes match), the note is in
//   steady-state — Forge-click runs from the cached Python; /generate
//   refreshes Recipe + Python from Description; etc.
//
// Source is STORED as a frontmatter field `source_facet` as of
// v0.2.286 (previously `canonical_facet`, v0.2.256 through v0.2.285;
// see drain 2026-07-09-1600 for the rename). Hash-mismatch inference
// remains as a fallback for pre-1200 notes not yet backfilled + as an
// external-edit escape hatch. Upstream-wins tiebreak is retained for
// those fallback paths per driver Choice 3.
//
// Legacy notes with only `canonical_facet` still work: `getSourceFacet`
// reads either field (new name preferred). The write path always writes
// `source_facet` and deletes `canonical_facet` — so legacy notes migrate
// lazily on their next facet-write.
//
// Prior versions used hash-mismatch inference as the primary path.
// v0.2.252 (drain 1000) flipped from downstream-wins to upstream-wins
// tiebreak; v0.2.256 made the whole thing driver-controlled via
// stored field.
//
// Pure-core (no `obsidian` import). All helpers operate on the full
// note body markdown string.

import { computeDescriptionHash } from './description-hash-core.ts';

/** The source-layer label produced by `whichLayerIsSource`.
 *
 *  `synced` means all three facets' content hashes match the stored
 *  frontmatter hashes — steady-state, post-/generate or post-Forge.
 *
 *  `description` / `recipe` / `python` mean that facet was last
 *  hand-edited and its downstream facets are stale.
 */
export type SourceLayer = 'description' | 'recipe' | 'python' | 'synced';

/** v0.2.286 back-compat alias — `SourceLayer` was named `CanonicalLayer`
 *  before the S9 field rename (drain 2026-07-09-1600). External callers
 *  can continue to import the old name for one release cycle.
 *  TODO: delete in v0.2.290. */
export type CanonicalLayer = SourceLayer;


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


/** Set of valid source-facet frontmatter values. Used for validation
 *  when reading the stored field. */
const VALID_SOURCE_VALUES = new Set<SourceLayer>([
  'description', 'recipe', 'python', 'synced',
]);


/** Read the stored source-facet frontmatter value. Prefers `source_facet`
 *  (v0.2.286+); falls back to legacy `canonical_facet` if only that is
 *  present. Returns null if neither is set or the value is invalid.
 *
 *  This is the READ-side of the migration path (drain 2026-07-09-1600):
 *  legacy notes are read-tolerant; the next write flushes the old name.
 */
export function getSourceFacet(
  body: string,
  getFrontmatterField: (body: string, key: string) => string | null,
): SourceLayer | null {
  const stored = getFrontmatterField(body, 'source_facet')
    ?? getFrontmatterField(body, 'canonical_facet');
  if (stored === null) return null;
  return VALID_SOURCE_VALUES.has(stored as SourceLayer)
    ? (stored as SourceLayer)
    : null;
}


/** Read the source-layer label.
 *
 *  v0.2.286 (drain 2026-07-09-1600) — renamed from `whichLayerIsCanonical`.
 *  The stored field was renamed `canonical_facet` → `source_facet`.
 *  Legacy `canonical_facet` values are still honored via `getSourceFacet`.
 *
 *  v0.2.256 (drain 2026-07-03-1200) — source is STORED as a frontmatter
 *  field, not inferred from hash-mismatch comparison. The plugin
 *  writes the field on hand-edit events; programmatic writes don't
 *  touch it. Constitution V2a v11.5 §S9 amendment codifies the shift.
 *
 *  Resolution order:
 *   1. Stored source (`source_facet` or legacy `canonical_facet`) present
 *      and valid → return it.
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
 *  freshly minted notes without hashes aren't reported as source
 *  in any one facet. The /generate flow stamps all three at synced
 *  baseline; from then on edits drive the state machine.
 */
export async function whichLayerIsSource(
  body: string,
  helpers: {
    extractDescription: (body: string) => string;
    extractRecipeSection: (body: string) => string | null;
    extractPythonSection: (body: string) => string | null;
    getFrontmatterField: (body: string, key: string) => string | null;
  },
): Promise<SourceLayer> {
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

  // v0.2.256 drain 1200 primary path — read stored source facet
  // (either `source_facet` or legacy `canonical_facet`).
  const storedSource = getSourceFacet(body, helpers.getFrontmatterField);
  if (storedSource !== null) {
    // External multi-facet edit detection: if the stored value points
    // at a facet with no drift, but ANOTHER facet has drift, flip to
    // the drifted facet. Preserves the observable "editing a facet
    // body makes that facet the source" invariant even when the edit
    // came from outside the plugin's write path.
    const storedIsSynced = storedSource === 'synced';
    const storedFacetHasDrift =
      (storedSource === 'description' && descMismatch) ||
      (storedSource === 'recipe' && recipeMismatch) ||
      (storedSource === 'python' && pythonMismatch);
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
    return storedSource;
  }

  // Fallback path — no stored source-facet field. Applies to pre-1200
  // notes not yet backfilled. Upstream-wins tiebreak (drain 1000).
  // Backfill will seed the field on first open per session.
  if (descMismatch) return 'description';
  if (recipeMismatch) return 'recipe';
  if (pythonMismatch) return 'python';
  return 'synced';
}


/** v0.2.286 back-compat alias — `whichLayerIsSource` was named
 *  `whichLayerIsCanonical` before the S9 field rename (drain
 *  2026-07-09-1600). External callers can continue to import the old
 *  name for one release cycle.
 *  TODO: delete in v0.2.290. */
export const whichLayerIsCanonical = whichLayerIsSource;


/** Detect each facet that is currently stale (non-source).
 *
 *  Returns a set of facet names that should be marked "reference /
 *  documentation only" (per S9 v11.3). The source facet itself
 *  is NEVER in the returned set; it's the authoritative source.
 *  Facets without a stored hash are not stale (they're considered
 *  "absent / fresh" rather than out-of-sync).
 *
 *  v0.2.242 drain 2026-07-03-0100 — Constitution V2a v11.3 S9 spec
 *  reads "non-source facets" (plural). All facets except the
 *  source one are stale, regardless of upstream/downstream:
 *  - description source → recipe + python stale
 *  - recipe source      → description + python stale
 *  - python source      → description + recipe stale
 *  - synced             → empty set
 *
 *  Rationale: the suffix communicates SOURCE-OF-TRUTH, not
 *  auto-regeneration. Cohort scanning the note sees "no suffix
 *  = currently driving runtime." Upstream Description under a
 *  Recipe-source state may or may not still be accurate; the
 *  hint tells cohort to VERIFY.
 *
 *  Prior implementation (v0.2.239-v0.2.241) marked only downstream
 *  facets — Recipe-source marked Python only, missing Description.
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
  const source = await whichLayerIsSource(body, helpers);
  if (source === 'synced') return new Set();
  const all: Array<'description' | 'recipe' | 'python'> = [
    'description', 'recipe', 'python',
  ];
  return new Set(all.filter(f => f !== source));
}
