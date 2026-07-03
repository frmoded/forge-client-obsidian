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
// Canonical priority (upstream-wins, v0.2.252): Description > Recipe > Python.
//   - desc edit    → description canonical → Recipe + Python stale
//   - recipe edit  → recipe canonical → Python stale
//   - python edit  → python canonical → Description + Recipe stale
//
// When multiple facets have drifted from their stored hashes, the
// upstream-most drift wins. Semantically, Description is the root
// source-of-truth in the D → R → P forge chain; a Description edit
// is an intent change that supersedes any downstream residue. This
// replaces the pre-v0.2.252 downstream-wins (Python > Recipe >
// Description) precedence — that biased notes toward "run the last
// Python we compiled" and hid Description edits when Recipe (or
// Python) had residual drift from prior smoke iterations.
//
// See drain 2026-07-03-1000 §3.2 for the observed miss: driver
// edited Description; Recipe + Python still had drift from earlier
// smoke; plugin routed Python-canonical and cohort's Description
// edit never registered.
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
 *  - `description`— description_hash mismatch (highest priority — upstream)
 *  - `recipe`     — recipe_hash mismatch
 *  - `python`     — python_hash mismatch (lowest priority — downstream)
 *
 *  Priority is UPSTREAM-WINS as of v0.2.252 (drain 2026-07-03-1000).
 *  When multiple facets have drifted, the source-most edit wins —
 *  Description is the root source-of-truth in D → R → P chain, and
 *  a Description edit represents intent that supersedes downstream
 *  residue from prior smokes. Pre-v0.2.252 was downstream-wins, which
 *  hid Description edits when Recipe/Python still had drift.
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

  // Upstream priority (v0.2.252) — the earliest facet in the D → R → P
  // chain wins. When a cohort edits Description, that intent supersedes
  // any Recipe/Python drift left over from prior smoke iterations.
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
