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
import { extractSlotCacheKeys } from './slot-resolved-state-core.ts';
import { computeSlotCacheKey } from './slot-resolver-factory-core.ts';

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

/** v0.2.210 Phase 3.5: Decoration.mark for resolved slots. The hash
 *  matches the slot triple against the frontmatter slot_cache; if it's
 *  in cache, cohort already paid the LLM call and the slot has a known
 *  expression. Different visual: muted green + italic. */
const RESOLVED_SLOT_MARK = Decoration.mark({
  class: 'forge-slot-resolved',
  attributes: {
    title: 'LLM blank — already resolved (cached). Forge-click reads from cache.',
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

/** Find every `{{...}}` match inside the # Recipe section and return
 *  their offset ranges + the slot-text. Pure helper exported for
 *  testing + reuse by the Phase 3.5 async pass.
 */
export function findRecipeSlots(body: string): Array<{from: number; to: number; slotText: string}> {
  const range = recipeSectionRange(body);
  const out: Array<{from: number; to: number; slotText: string}> = [];
  if (range === null) return out;
  SLOT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLOT_PATTERN.exec(body)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (from < range.from || to > range.to) continue;
    // Strip `{{` and `}}` for the slot text.
    const slotText = match[0].slice(2, -2).trim();
    out.push({from, to, slotText});
  }
  return out;
}

/** Compute the unresolved-only DecorationSet for the given doc text.
 *  Phase 3 behavior preserved: all `{{...}}` matches inside # Recipe
 *  get the unresolved class. Phase 3.5's async pass overlays a
 *  resolved-classed range when the slot's hash is in the cache;
 *  the overlay is applied via dispatch in the ViewPlugin below. */
export function buildSlotHighlightDecorations(body: string): DecorationSet {
  const slots = findRecipeSlots(body);
  if (slots.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of slots) builder.add(s.from, s.to, UNRESOLVED_SLOT_MARK);
  return builder.finish();
}

/** Build the Phase 3.5 differentiated DecorationSet given the doc and
 *  the resolved-key set. Each slot's hex hash is keyed against the
 *  set; in-cache → RESOLVED_SLOT_MARK, otherwise → UNRESOLVED_SLOT_MARK.
 *
 *  The snippet_id parameter must match the runtime snippet_id used to
 *  hash slots at resolve time — otherwise the keys won't match the
 *  ones in slot_cache. Empty snippet_id (no active file or rename
 *  in-flight) falls back to all-unresolved.
 */
export async function buildDifferentiatedDecorations(
  body: string,
  snippetId: string,
  cacheKeys: ReadonlySet<string>,
): Promise<DecorationSet> {
  const slots = findRecipeSlots(body);
  if (slots.length === 0) return Decoration.none;
  if (!snippetId || cacheKeys.size === 0) {
    return buildSlotHighlightDecorations(body);
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of slots) {
    const key = await computeSlotCacheKey(s.slotText, snippetId, '');
    const mark = cacheKeys.has(key) ? RESOLVED_SLOT_MARK : UNRESOLVED_SLOT_MARK;
    builder.add(s.from, s.to, mark);
  }
  return builder.finish();
}

/** The CM6 ViewPlugin: rebuilds decorations on every doc change. The
 *  per-update sync pass paints all slots as unresolved (cheap); the
 *  async Phase 3.5 pass overlays resolved-classed marks once the
 *  hash + cache lookup settles. The async work runs in the
 *  background; dispatch is empty-noop to nudge re-paint.
 *
 *  snippetId + cacheKeys are read from the doc body. snippetId comes
 *  from a `snippet_id:` frontmatter field if present (engine stamps
 *  this; not present on fresh-from-template notes). When absent, the
 *  ViewPlugin can't compute hash keys and falls back to all-unresolved
 *  (no regression from Phase 3 behavior). */
export const slotHighlightViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private view: EditorView;
    private pendingDoc: string | null = null;

    constructor(view: EditorView) {
      this.view = view;
      this.decorations = buildSlotHighlightDecorations(
        view.state.doc.toString(),
      );
      void this.refreshAsync(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        const body = update.view.state.doc.toString();
        this.decorations = buildSlotHighlightDecorations(body);
        void this.refreshAsync(body);
      }
    }

    private async refreshAsync(body: string): Promise<void> {
      // Coalesce concurrent updates; only the latest body matters.
      this.pendingDoc = body;
      const snippetId = extractSnippetIdFromFrontmatter(body);
      if (!snippetId) return;  // can't hash without a stable id
      const cacheKeys = extractSlotCacheKeys(body);
      let decos: DecorationSet;
      try {
        decos = await buildDifferentiatedDecorations(
          body, snippetId, cacheKeys);
      } catch (e) {
        console.error('slotHighlightViewPlugin: differentiated decorate failed', e);
        return;
      }
      if (this.pendingDoc !== body) return;
      this.decorations = decos;
      try {
        this.view.dispatch({});
      } catch (e) {
        console.error('slotHighlightViewPlugin: dispatch failed', e);
      }
    }
  },
  { decorations: v => v.decorations },
);

/** Read `snippet_id:` from a YAML frontmatter block. Engine stamps
 *  this on resolved notes; absent on fresh-from-template. */
export function extractSnippetIdFromFrontmatter(body: string): string {
  if (!body.startsWith('---')) return '';
  const close = body.indexOf('\n---', 4);
  if (close === -1) return '';
  const fm = body.slice(4, close);
  const m = fm.match(/^snippet_id:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  return m ? m[1].trim() : '';
}
