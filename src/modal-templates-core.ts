// v0.2.77 — pure-core for the snippet-template emitters used by the
// New Snippet modal. Lives separately from modal.ts because modal.ts
// imports from 'obsidian' and uses TypeScript parameter properties,
// neither of which work in node's strip-only-mode TS runner. The
// templates themselves are static, string-only, and have no runtime
// dependencies — extracting them keeps them under test coverage.
//
// modal.ts re-exports these via `export { actionTemplate, ... } from
// './modal-templates-core'` for backward-compat with existing call
// sites that import from modal.ts.

/** Legacy free-English action template. Frontmatter `type: action`
 *  + empty `inputs` + a # English heading + a `# Python` stub with
 *  `def compute(context): pass`. The user authors the English; the
 *  /generate LLM call fills the Python on first Forge-click. */
export function actionTemplate(name: string): string {
  return [
    '---',
    'type: action',
    `description: ${name}`,
    'inputs: []',
    '---',
    '',
    '# English',
    '',
    '',
    '',
    '---',
    '',
    '# Python',
    '',
    'def compute(context):',
    '  pass',
    '',
  ].join('\n');
}

/** v0.2.77 — canonical action template. v0.2.121 — facet_form
 *  field removed from emitted frontmatter (Option C plugin-side
 *  routing; engine always attempts E-- transpile). The body has
 *  no `# Python` stub — E-- transpile produces it on demand via
 *  resolve_action_code per B7.3. The user authors only the English
 *  facet. The seed `Do [[print]]("hello, world").` introduces the
 *  canonical call syntax + a builtin sibling reference in one line. */
export function canonicalActionTemplate(name: string): string {
  return [
    '---',
    'type: action',
    `description: ${name}`,
    'inputs: []',
    '---',
    '',
    '# English',
    '',
    'Do [[print]]("hello, world").',
    '',
  ].join('\n');
}
