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
  whichLayerIsCanonical,
} from './facet-hash-core.ts';
import {
  computeFacetStates,
  FacetState,
  ALL_FACETS,
  type FacetName,
} from './facet-state-core.ts';
import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField,
} from './v2-note-core.ts';

/** v0.2.243 — Constitution V2a v11.4 tri-state visibility. Body marks
 *  for derived + stale (source facets get NO body decoration — they
 *  render at full color). */
const DERIVED_MARK = Decoration.mark({
  class: 'forge-facet-derived',
  attributes: {
    title:
      'Derived facet — auto-produced from the current source. '
      + 'Reflects the source at time of forge.',
  },
});

const STALE_MARK = Decoration.mark({
  class: 'forge-facet-stale',
  attributes: {
    title:
      'Stale facet — content does not reflect current source. '
      + 'Forge-click or /generate to refresh.',
  },
});

/** v0.2.243 — Constitution V2a v11.4 tri-state visibility. Widget
 *  appended after each H1 heading with " — source", " — derived",
 *  or " — stale" reflecting FacetState. Supersedes v11.3's binary
 *  " — reference" suffix. View-only decoration; does NOT persist to
 *  the on-disk markdown. */
class FacetStateSuffixWidget extends WidgetType {
  readonly state: FacetState;
  constructor(state: FacetState) {
    super();
    this.state = state;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.textContent = ` — ${this.state}`;
    el.className = `forge-facet-suffix forge-facet-suffix-${this.state}`;
    el.title = TITLE_BY_STATE[this.state];
    return el;
  }
  eq(other: WidgetType): boolean {
    return other instanceof FacetStateSuffixWidget && other.state === this.state;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

const TITLE_BY_STATE: Record<FacetState, string> = {
  [FacetState.Source]:
    'Source facet — this content drives runtime; edit to change behavior.',
  [FacetState.Derived]:
    'Derived facet — auto-produced from the current source at time of forge.',
  [FacetState.Stale]:
    'Stale facet — does not reflect current source. Forge-click or /generate to refresh.',
};

const SUFFIX_DECOS: Record<FacetState, Decoration> = {
  [FacetState.Source]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.Source),
    side: 1,
  }),
  [FacetState.Derived]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.Derived),
    side: 1,
  }),
  [FacetState.Stale]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.Stale),
    side: 1,
  }),
};

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
export function buildFacetStateDecorations(
  body: string,
  states: Record<FacetName, FacetState>,
): DecorationSet {
  // v0.2.243 — Constitution V2a v11.4 tri-state. Emits suffix widget
  // for every facet + body mark for derived/stale (source facets get
  // no body decoration; they're full color). Ordered by (from, side)
  // per RangeSetBuilder invariant.
  const HEADING_BY_FACET: Record<FacetName, 'Description' | 'Recipe' | 'Python'> = {
    description: 'Description',
    recipe: 'Recipe',
    python: 'Python',
  };
  const items: Array<{ from: number; to: number; side: number; deco: Decoration }> = [];
  for (const facet of ALL_FACETS) {
    const state = states[facet];
    const heading = HEADING_BY_FACET[facet];
    const headingEnd = findH1HeadingEndOffset(body, heading);
    if (headingEnd !== -1) {
      items.push({ from: headingEnd, to: headingEnd, side: 1, deco: SUFFIX_DECOS[state] });
    }
    if (state === FacetState.Derived || state === FacetState.Stale) {
      const r = h1SectionRange(body, heading);
      if (r && r.to > r.from) {
        const mark = state === FacetState.Derived ? DERIVED_MARK : STALE_MARK;
        items.push({ from: r.from, to: r.to, side: 0, deco: mark });
      }
    }
  }
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
      // whichLayerIsCanonical's helper signature is
      // (body: string, key: string) → string | null. The tri-state
      // fmReader has (key: string) → string | null (body is captured).
      // Keep them as two distinct adapters so we don't accidentally
      // pass a body-string as a key.
      const twoArgReader = (b: string, k: string): string | null => {
        const v = getFrontmatterField(b, k);
        return typeof v === 'string' ? v : null;
      };
      const oneArgReader = {
        getFrontmatterField: (k: string): string | null => {
          const v = getFrontmatterField(body, k);
          return typeof v === 'string' ? v : null;
        },
      };
      let canonical: Awaited<ReturnType<typeof whichLayerIsCanonical>>;
      try {
        canonical = await whichLayerIsCanonical(body, {
          extractDescription,
          extractRecipeSection,
          extractPythonSection,
          getFrontmatterField: twoArgReader,
        });
      } catch (e) {
        console.error('facetStateViewPlugin: whichLayerIsCanonical failed', e);
        return;
      }
      if (this.pendingDoc !== body) {
        // A newer update has superseded this run; drop.
        return;
      }
      const states = computeFacetStates(canonical, oneArgReader);
      this.decorations = buildFacetStateDecorations(body, states);
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
