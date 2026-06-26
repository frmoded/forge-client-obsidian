// v0.2.202 — V2.1 Slot resolution Phase 3: CM6 yellow-highlight for
// unresolved `{{...}}` slots in the # Recipe facet. Cohort sees their
// LLM blanks at a glance; the highlight is the visual signal that a
// Forge-click will trigger an LLM resolution (or a cache hit if it's
// been resolved before).
//
// Per CM6 HARD RULE: integration test against `createIntegrationHarness()`
// in slot-highlight-view-plugin.integration.test.ts.
//
// Scope (Phase 3):
// - Match `{{...}}` (single-line, non-greedy) inside `# Recipe`.
// - Apply Decoration.mark with class `forge-slot-unresolved`.
// - CSS in styles.css yellows the background + sets a tooltip via
//   `title` attribute.
//
// Out of scope (Phase 3.5):
// - Distinguishing resolved vs unresolved slots. Resolution lives in
//   the `slot_cache` frontmatter keyed by sha256(slot_text, snippet_id,
//   surrounding_context); reversing the hash to match an in-doc slot
//   would need async crypto.subtle. ViewPlugin updates run sync, so a
//   meaningful resolved/unresolved differentiation needs a pre-pass
//   that pre-computes the hash table off the main update loop. For
//   Phase 3 we highlight ALL `{{...}}` matches — cohort still sees the
//   visual signal that this text is "an LLM blank, will resolve on
//   Forge-click." The narrative cost: a resolved slot stays yellow
//   until /generate or Forge-click re-fires. Acceptable for Phase 3.
//
// Out of scope (Phase 3 deliberate):
// - Multi-line `{{ ... \n ... }}` blocks. The Phase 1 parser rejects
//   them; we mirror that so the highlight matches the parse contract.

import { ViewPlugin, type ViewUpdate, type EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

/** Single-line `{{...}}` matcher. Mirrors the Phase 1 parser regex so
 *  highlight + parse agree on what's a slot. Non-greedy so adjacent
 *  slots in the same line don't collapse into one decoration. */
const SLOT_PATTERN = /\{\{[^}\n]+\}\}/g;

/** The Decoration.mark applied to each unresolved-slot range. CSS
 *  class lives in styles.css; tooltip text appears via the native
 *  `title` attribute (Obsidian doesn't strip it on cm-content). */
const UNRESOLVED_SLOT_MARK = Decoration.mark({
  class: 'forge-slot-unresolved',
  attributes: {
    title: 'LLM blank — resolved on Forge-click',
  },
});

/** Find the byte offset of the `# Recipe` heading line in `body`.
 *  Returns -1 when absent. Looks for an H1 (`# Recipe`) anchored at a
 *  line start, optionally followed by whitespace and a newline. */
export function findRecipeHeadingOffset(body: string): number {
  const m = body.match(/^# Recipe[ \t]*$/m);
  if (!m || m.index === undefined) return -1;
  return m.index;
}

/** Find the byte offset of the next H1 heading (`# Something`) after
 *  `fromOffset`. Returns `body.length` when no next heading exists —
 *  the body simply runs to EOF. */
export function findNextH1OffsetAfter(body: string, fromOffset: number): number {
  const searchFrom = fromOffset + 1;
  const tail = body.slice(searchFrom);
  const m = tail.match(/^# /m);
  if (!m || m.index === undefined) return body.length;
  return searchFrom + m.index;
}

/** Build the [start, end) byte range of the # Recipe section body
 *  (from the line AFTER the heading to the next H1 or EOF). Returns
 *  null when there is no # Recipe section. Pure helper exported for
 *  testing. */
export function recipeSectionRange(body: string): { from: number; to: number } | null {
  const headingOffset = findRecipeHeadingOffset(body);
  if (headingOffset === -1) return null;
  // Move past the heading line itself.
  const lineEnd = body.indexOf('\n', headingOffset);
  const contentStart = lineEnd === -1 ? body.length : lineEnd + 1;
  const nextH1 = findNextH1OffsetAfter(body, headingOffset);
  return { from: contentStart, to: nextH1 };
}

/** Compute the DecorationSet for the given doc text. Pure-ish helper
 *  (returns a CM RangeSet but reads only the doc string) so the
 *  integration test can call `view.state.facet(... ranges ...)` or
 *  inspect the DOM after a mount.
 *
 *  Marks every `{{...}}` match inside the # Recipe section. Matches
 *  outside the section (e.g. inside # Description prose) are ignored;
 *  free-English `{{...}}` mentions in cohort-authored Description
 *  shouldn't get the LLM-blank styling. */
export function buildSlotHighlightDecorations(body: string): DecorationSet {
  const range = recipeSectionRange(body);
  if (range === null) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  SLOT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLOT_PATTERN.exec(body)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (from < range.from || to > range.to) continue;
    builder.add(from, to, UNRESOLVED_SLOT_MARK);
  }
  return builder.finish();
}

/** The CM6 ViewPlugin: rebuilds decorations on every doc change. The
 *  per-update cost is one regex scan + one bounds check per match;
 *  negligible for typical Recipe sizes. */
export const slotHighlightViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildSlotHighlightDecorations(
        view.state.doc.toString(),
      );
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSlotHighlightDecorations(
          update.view.state.doc.toString(),
        );
      }
    }
  },
  { decorations: v => v.decorations },
);
