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

import { ViewPlugin, type ViewUpdate, type EditorView, Decoration, type DecorationSet, WidgetType } from '@codemirror/view';
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

/** v0.2.239 — Constitution V2a v11.3 S9 uniform-visibility contract.
 *  Widget appended after non-canonical H1 headings to render
 *  " — reference" so cohort sees at-a-glance which facet(s) are
 *  documentation only (not driving compute). The widget is a view-
 *  only decoration — it does NOT appear in the on-disk markdown.
 *  Grayscale dimming on the body stays for defense-in-depth. */
class ReferenceSuffixWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.textContent = ' — reference';
    el.className = 'forge-facet-reference-suffix';
    el.title =
      'This facet is stale — the canonical facet (most recently edited) '
      + 'is what drives compute. Edit this one to make it canonical.';
    return el;
  }
  eq(other: WidgetType): boolean {
    return other instanceof ReferenceSuffixWidget;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

const REFERENCE_SUFFIX_DECO = Decoration.widget({
  widget: new ReferenceSuffixWidget(),
  side: 1,
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

/** v0.2.239 — Byte offset at the END of the H1 heading line for
 *  `name` (position just BEFORE the newline). This is where the
 *  `— reference` widget is mounted so it renders inline with the
 *  heading text. Returns -1 when the heading is absent. */
export function findH1HeadingEndOffset(body: string, name: string): number {
  const headingOffset = findH1HeadingOffset(body, name);
  if (headingOffset === -1) return -1;
  const lineEnd = body.indexOf('\n', headingOffset);
  return lineEnd === -1 ? body.length : lineEnd;
}

/** Build the DecorationSet for a given doc + stale-facet set. Pure
 *  helper exported for testing.
 *
 *  v0.2.239 — Emits TWO decorations per stale facet: the body mark
 *  (grayscale dimming) and a widget after the heading with
 *  " — reference" (S9 v11.3 title suffix contract). Decorations are
 *  ordered by (from, side) since RangeSetBuilder demands sorted input.
 *
 *  The widget is a view-only decoration. It does NOT get persisted to
 *  the on-disk markdown; opening the note in a raw text editor still
 *  shows plain `# Description` / `# Recipe` / `# Python`. */
export function buildStaleFacetDecorations(
  body: string,
  stale: Set<'description' | 'recipe' | 'python'>,
): DecorationSet {
  if (stale.size === 0) return Decoration.none;
  // Collect (from, side, deco) triples; sort; feed to builder.
  const items: Array<{ from: number; to: number; side: number; deco: Decoration }> = [];
  const collectFacet = (
    key: 'description' | 'recipe' | 'python',
    heading: 'Description' | 'Recipe' | 'Python',
  ): void => {
    if (!stale.has(key)) return;
    // Suffix widget at end of heading line.
    const headingEnd = findH1HeadingEndOffset(body, heading);
    if (headingEnd !== -1) {
      items.push({ from: headingEnd, to: headingEnd, side: 1, deco: REFERENCE_SUFFIX_DECO });
    }
    // Grayscale mark on the body range.
    const r = h1SectionRange(body, heading);
    if (r && r.to > r.from) {
      items.push({ from: r.from, to: r.to, side: 0, deco: STALE_MARK });
    }
  };
  collectFacet('description', 'Description');
  collectFacet('recipe', 'Recipe');
  collectFacet('python', 'Python');
  // RangeSetBuilder demands sorted; widgets at same position ordered
  // by their `side` attribute already, but tie-break in the sort too.
  items.sort((a, b) => (a.from - b.from) || (a.side - b.side));
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of items) {
    builder.add(from, to, deco);
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
