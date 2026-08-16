// v0.2.239 — pure-core for the snippet-template emitters used by the
// New Snippet modal. Constitution V2a v11.3 S9 uniform-visibility
// contract: all three facets (Description + Recipe + Python) always
// visible + editable. Template seeds Python with a no-op body so
// cohort can Forge-click immediately (the note runs and returns
// None; editing Recipe makes Recipe canonical; editing Python makes
// Python canonical — the canonical-facet state machine at engine
// side handles which drives compute).
//
// Prior versions:
//   v0.2.231 — V2 unified shape: Description + Recipe, no Python
//     (implicit-locking generated Python on Forge-click).
//   v0.2.77 — canonical vs free-English split; both retired in v0.2.231.
//
// modal.ts re-exports `actionTemplate` via the existing import path
// for backward-compat with call sites.

import { computeFacetHash } from './facet-hash-core.ts';
import {
  extractDescription,
  extractPythonSection,
  extractRecipeSection,
} from './v2-note-core.ts';

/** V2 action template. Frontmatter `type: action` only; body has
 *  `# Description`, `# Recipe`, and `# Python` (S9 v11.3 uniform-
 *  visibility contract: all three facets always visible + editable).
 *  Python body is `def compute(context): return None` so the note is
 *  Forge-clickable from the moment it's created. Cohort authoring
 *  Recipe makes Recipe canonical on next Forge-click. */
export async function actionTemplate(name: string): Promise<string> {
  // Drain 2026-08-03-1610. Build the body FIRST, then hash the facets
  // as the extractors actually return them.
  //
  // Hashing hand-written strings instead would mean guessing whether
  // extractPythonSection keeps a trailing newline — and a single byte
  // of disagreement stamps the note as hand-edited the moment it is
  // created, which is the exact failure class this drain removes.
  // Extracting from the real body makes the stamps agree by
  // construction rather than by care.
  const body = [
    '# Description',
    '',
    '',
    '',
    '# Recipe',
    '',
    '',
    '',
    '# Python',
    '',
    'def compute(context):',
    '    return None',
    '',
  ].join('\n');

  const description = extractDescription(body);
  const recipe = extractRecipeSection(body) ?? '';
  const python = extractPythonSection(body) ?? '';

  const [descriptionHash, recipeHash, pythonHash] = await Promise.all([
    computeFacetHash(description),
    computeFacetHash(recipe),
    computeFacetHash(python),
  ]);

  // Description is source at creation: it is the facet the cohort is
  // about to write, and Recipe/Python are derived from it.
  //
  // Drain 2026-08-17-0100 (sync_state Phase 2) — this template used to
  // stamp `sync_state: stale-recipe` here. It no longer stamps anything:
  // the state is derived from the note's hash lineage on read, and a
  // fresh note (Description present, Recipe empty) still derives
  // `stale-recipe` — the same honest opening state, now computed, so it
  // cannot drift from the note it describes.
  return [
    '---',
    'type: action',
    // NOT `inputs: []`. A prior drain retired it from this template as
    // V1 frontmatter (modal.test.ts pins the absence), and drain 1610's
    // target shape re-listed it only because it mirrors
    // create_note_shell. Re-adding it here would silently reverse that
    // decision on the strength of a mirror that step 1 showed is wrong.
    `description: ${name}`,
    // NOT `recipe_version: 0`. CW-forge-mcp-drop-recipe-version-shell-
    // marker (2026-07-29-2305) removed it from the MCP writer
    // deliberately: `recipe_version: 0` is indistinguishable from a
    // missing stamp, because every reader defaults missing to 0.
    // Drain 1610 re-added it here from a target shape that had
    // inherited it, which left the two writers disagreeing on one
    // redundant field. Dropped so they agree. No observable change.
    'source_facet: description',
    `description_hash: ${descriptionHash}`,
    `recipe_hash: ${recipeHash}`,
    `python_hash: ${pythonHash}`,
    `recipe_derived_from_description_hash: ${descriptionHash}`,
    `recipe_derived_from_source_hash: ${descriptionHash}`,
    `python_derived_from_recipe_hash: ${recipeHash}`,
    `python_derived_from_source_hash: ${descriptionHash}`,
    `english_hash: ${recipeHash}`,
    '---',
    '',
    body,
  ].join('\n');
}
