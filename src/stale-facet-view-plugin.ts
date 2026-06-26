// v0.2.205 — Implicit locking Phase 2.5 §2.1: CM6 stale-facet
// visual indicator. Marks the body of each stale facet (Description /
// Recipe / Python H1 section) with `.forge-stale-facet`; CSS in
// styles.css fades opacity + italicizes so cohort sees at-a-glance
// which facets are out of sync with their stored hashes.
//
// Per CM6 HARD RULE: integration test against createIntegrationHarness
// in stale-facet-view-plugin.integration.test.ts.
//
// Design choice: the ViewPlugin reads the body each update and calls
// detectStaleFacets synchronously via the same hash helpers used by
// whichLayerIsCanonical. The hash calls are async (crypto.subtle), so
// we compute decorations in a fire-and-forget pattern: kick off the
// async stale-detection, store the result in a per-plugin field, and
// dispatch a CM transaction when the result lands. The ViewPlugin
// re-paints on every doc change so a stale flash during the async gap
// is acceptable.

import { ViewPlugin, type ViewUpdate, type EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

import {
  detectStaleFacets,
} from './facet-hash-core.ts';
import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField,
} from './v2-note-core.ts';

/** The Decoration.mark applied to each stale facet's content range. */
const STALE_MARK = Decoration.mark({
  class: 'forge-stale-facet',
  attributes: {
    title:
      'Stale facet — content has drifted from its stored hash. '
      + 'Forge-click or /generate to refresh.',
  },
});

/** Find the byte offset of the H1 heading line for `name` (e.g.
 *  "Description"). Returns -1 when absent. */
export function findH1HeadingOffset(body: string, name: string): number {
  const re = new RegExp('^# ' + name + '[ \\t]*$', 'm');
  const m = body.match(re);
  if (!m || m.index === undefined) return -1;
  return m.index;
}

/** Find the byte offset of the next H1 heading after `fromOffset`.
 *  Returns body.length when no next H1 exists. */
export function findNextH1OffsetAfter(body: string, fromOffset: number): number {
  const searchFrom = fromOffset + 1;
  const tail = body.slice(searchFrom);
  const m = tail.match(/^# /m);
  if (!m || m.index === undefined) return body.length;
  return searchFrom + m.index;
}

/** Build the [start, end) byte range of an H1 section's content
 *  body (from the line AFTER the heading to the next H1 or EOF).
 *  Returns null when the heading is absent. */
export function h1SectionRange(
  body: string,
  name: 'Description' | 'Recipe' | 'Python',
): { from: number; to: number } | null {
  const headingOffset = findH1HeadingOffset(body, name);
  if (headingOffset === -1) return null;
  const lineEnd = body.indexOf('\n', headingOffset);
  const contentStart = lineEnd === -1 ? body.length : lineEnd + 1;
  const nextH1 = findNextH1OffsetAfter(body, headingOffset);
  return { from: contentStart, to: nextH1 };
}

/** Build the DecorationSet for a given doc + stale-facet set. Pure
 *  helper exported for testing. */
export function buildStaleFacetDecorations(
  body: string,
  stale: Set<'description' | 'recipe' | 'python'>,
): DecorationSet {
  if (stale.size === 0) return Decoration.none;
  const ranges: Array<[number, number]> = [];
  if (stale.has('description')) {
    const r = h1SectionRange(body, 'Description');
    if (r && r.to > r.from) ranges.push([r.from, r.to]);
  }
  if (stale.has('recipe')) {
    const r = h1SectionRange(body, 'Recipe');
    if (r && r.to > r.from) ranges.push([r.from, r.to]);
  }
  if (stale.has('python')) {
    const r = h1SectionRange(body, 'Python');
    if (r && r.to > r.from) ranges.push([r.from, r.to]);
  }
  // RangeSetBuilder demands sorted, non-overlapping ranges.
  ranges.sort((a, b) => a[0] - b[0]);
  const builder = new RangeSetBuilder<Decoration>();
  for (const [from, to] of ranges) {
    builder.add(from, to, STALE_MARK);
  }
  return builder.finish();
}

/** The CM6 ViewPlugin. Async detectStaleFacets means we recompute the
 *  decoration set off the update cycle and dispatch a no-op
 *  transaction to trigger a re-paint when the result lands. */
export const staleFacetViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    private pendingDoc: string | null = null;
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.refresh(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.refresh(update.view.state.doc.toString());
      }
    }

    private async refresh(body: string) {
      // Coalesce: if multiple updates fire while we await crypto,
      // only the most recent body matters. Store it; check on
      // completion that we're still computing for it.
      this.pendingDoc = body;
      let stale: Set<'description' | 'recipe' | 'python'>;
      try {
        stale = await detectStaleFacets(body, {
          extractDescription,
          extractRecipeSection,
          extractPythonSection,
          getFrontmatterField: (b, k) => {
            const v = getFrontmatterField(b, k);
            return typeof v === 'string' ? v : null;
          },
        });
      } catch (e) {
        console.error('staleFacetViewPlugin: detectStaleFacets failed', e);
        return;
      }
      if (this.pendingDoc !== body) {
        // A newer update has superseded this run; drop.
        return;
      }
      this.decorations = buildStaleFacetDecorations(body, stale);
      // Dispatch a no-op effect to nudge CodeMirror into re-painting
      // with the new decorations. The decorations facet reads from
      // `v.decorations` on the next paint; a doc change triggers
      // that, but an async result without a doc change needs an
      // explicit nudge.
      try {
        this.view.dispatch({});
      } catch (e) {
        console.error('staleFacetViewPlugin: dispatch failed', e);
      }
    }
  },
  { decorations: v => v.decorations },
);
