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

/** V2 action template. Frontmatter `type: action` only; body has
 *  `# Description`, `# Recipe`, and `# Python` (S9 v11.3 uniform-
 *  visibility contract: all three facets always visible + editable).
 *  Python body is `def compute(context): return None` so the note is
 *  Forge-clickable from the moment it's created. Cohort authoring
 *  Recipe makes Recipe canonical on next Forge-click. */
export function actionTemplate(name: string): string {
  return [
    '---',
    'type: action',
    `description: ${name}`,
    '---',
    '',
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
}
