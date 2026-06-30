// v0.2.231 — pure-core for the snippet-template emitters used by the
// New Snippet modal. The V1 free-English template + the canonical
// `# English` template are retired; the V2 unified shape is the only
// option: `# Description` + `# Recipe`, with no `# Python` (let
// implicit-locking generate it on first Forge-click) and no
// `inputs: []` (V2 frontmatter is type-only).
//
// Driver smoke 2026-07-02 Step 5 surfaced that the cohort-facing
// "create new note" template was still V1 after 30+ V2 releases.
// Critical regression-by-omission; undermined the V2 paradigm for
// every new note authored after BRAT update.
//
// modal.ts re-exports `actionTemplate` via the existing import path
// for backward-compat with call sites.

/** V2 action template. Frontmatter `type: action` only; body has
 *  `# Description` (intent-level prose) + `# Recipe` (chip-call
 *  composition, filled by /generate or hand-authored). No `# Python` —
 *  S9 implicit-locking generates it from Recipe on first Forge-click.
 *  No `inputs: []` — V2 frontmatter is type-only. */
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
  ].join('\n');
}
