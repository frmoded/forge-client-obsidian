// v0.2.277 CW-2000 Option A — pure-core for Description → Recipe auto-forge.
//
// Flow: forgeSnippet detects Description-canonical drift → this pure-core
// handles the LLM-generated Recipe body:
//   1. Extract [[wikilinks]] from the Recipe body.
//   2. Resolve each against the vault's snippet registry.
//   3. Golden path (all resolve): return { ok: true } with the frontmatter
//      stamps that assert `Recipe derived from Description` semantic.
//   4. Failure path (any unresolved): return { ok: false, unresolved } —
//      caller preserves prior Recipe body, surfaces friendly Notice, and
//      SKIPS Description-derived stamp writes (Sub-1 policy).
//
// Q3 adjudicated stamp policy on closure failure: skip
// recipe_derived_from_description_hash + legacy _source_hash stamps
// (both Recipe and Python). Description-body stamp `description_hash`
// stays at the prior forge's baseline so hexa-state renders Description
// `— out of date` per CW-1700 freshness. Recipe transitively also
// renders out-of-date; Python renders out-of-date transitively via
// Recipe. Cohort sees clear "did not succeed" signal.
//
// Wikilink shape matches the vault convention: `[[target]]`,
// `[[target#heading]]`, `[[target|alias]]`, `[[target#heading|alias]]`.
// This module strips heading + alias down to bare target before
// closure check.

import { bareWikilinkTarget } from './python-builtins-core.ts';

/** Matches `[[...]]` blocks. Content inside brackets may include
 *  `#heading` or `|alias` — normalized via bareWikilinkTarget. Non-
 *  greedy match to handle multiple wikilinks on the same line. Does
 *  NOT match `\[\[` (escaped) — Forge Recipe syntax doesn't use
 *  escaped brackets. */
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

/** Extract the bare snippet-ID targets from every `[[wikilink]]` in the
 *  recipe body. Dedup'd + preserving insertion order (first occurrence
 *  wins). Empty targets (e.g. `[[]]` — cohort typo) are dropped, not
 *  reported. */
export function extractWikilinkTargets(recipeBody: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_REGEX.source, 'g');
  while ((match = re.exec(recipeBody)) !== null) {
    const bare = bareWikilinkTarget(match[1]);
    if (!bare || seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
  }
  return out;
}

/** Result of the closure check. `ok: true` means every wikilink in the
 *  Recipe body resolves against the vault registry — safe to write.
 *  `ok: false` carries the specific unresolved targets so caller can
 *  render an actionable Notice (`— [[foo]] isn't in your vault`). */
export type ClosureCheckResult =
  | { ok: true; wikilinks: string[] }
  | { ok: false; wikilinks: string[]; unresolved: string[] };

/** Check whether every `[[wikilink]]` in the Recipe body resolves to a
 *  known snippet. `known(bareId)` is the caller-supplied predicate; the
 *  plugin wires it to a Set flattened from the Pyodide-hosted registry
 *  (per-vault `list_snippets()` × bare IDs).
 *
 *  Python builtins (e.g. `print`, `abs`) are NOT wikilinks in Forge V2
 *  Recipes — they're callable statements without brackets. Any
 *  `[[print]]` is genuinely a wikilink pointing at a note named `print`,
 *  not a builtin reference. So `known()` should reject builtin names
 *  unless a note by that name exists.
 *
 *  Empty Recipe body → `ok: true, wikilinks: []`. Trivially closed. */
export function checkRecipeClosure(
  recipeBody: string,
  known: (bareId: string) => boolean,
): ClosureCheckResult {
  const wikilinks = extractWikilinkTargets(recipeBody);
  const unresolved = wikilinks.filter((w) => !known(w));
  if (unresolved.length === 0) {
    return { ok: true, wikilinks };
  }
  return { ok: false, wikilinks, unresolved };
}

/** Frontmatter stamps to write into the note when the LLM Recipe body
 *  successfully lands (closure-check passed). All four fields re-baseline
 *  to CURRENT body SHAs, asserting "Recipe IS derived from Description at
 *  this snapshot." Under Q3 stamp policy, Python's derived-from stamps
 *  are NOT set here — writeCanonicalPythonBack handles them once the
 *  transpile completes. */
export interface DescriptionDerivedRecipeStamps {
  description_hash: string;
  recipe_hash: string;
  recipe_derived_from_description_hash: string;
  /** v11.4 legacy field. Kept for transition per CW-1500-A backfill
   *  contract; drops in a followup drain once cohort has fully migrated
   *  to v11.6. */
  recipe_derived_from_source_hash: string;
}

/** Compute the Description-derived Recipe stamps for the auto-forge
 *  SUCCESS path.
 *
 *  Semantic: /generate produced a valid Recipe from Description; closure
 *  check passed. Post-forge:
 *  - description_hash re-baselined to current Description SHA (cohort's
 *    edit is now the last-forged snapshot).
 *  - recipe_hash re-baselined to the LLM Recipe's SHA (about to be
 *    written to disk).
 *  - recipe_derived_from_description_hash = current Description SHA —
 *    Recipe reflects THIS Description snapshot per LLM view.
 *  - Legacy _source_hash: kept aligned with Description SHA (Recipe's
 *    two-hop root is Description under v11.4 semantic).
 *
 *  On closure FAILURE, the caller does NOT invoke this function; the
 *  prior stored stamps stay in place, ensuring CW-1700 freshness
 *  renders Recipe `— derived from Description, out of date` and Python
 *  transitively out-of-date via Recipe. Cohort sees clear signal that
 *  the Description edit didn't reach the pipeline.
 */
export function computeDescriptionDerivedRecipeStamps(
  currentDescriptionHash: string,
  newRecipeHash: string,
): DescriptionDerivedRecipeStamps {
  return {
    description_hash: currentDescriptionHash,
    recipe_hash: newRecipeHash,
    recipe_derived_from_description_hash: currentDescriptionHash,
    recipe_derived_from_source_hash: currentDescriptionHash,
  };
}
