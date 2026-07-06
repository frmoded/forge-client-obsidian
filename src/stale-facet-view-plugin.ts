// v0.2.264 — Constitution V2a v11.6 hexa-state visibility. Drain
// 2026-07-03-1500 supersedes v11.4 tri-state with six suffix states:
//   — source | — derived from Description | — derived from Recipe |
//   — derived from Description, out of date | — derived from Recipe, out of date | — ignored
//
// Body opacity by state:
//   source: 100% (no body decoration)
//   derived: 60% (.forge-facet-derived, existing)
//   out of date: 50% (.forge-facet-out-of-date, new)
//   ignored: 40% (.forge-facet-ignored, renamed from .forge-facet-stale)
//
// Per CM6 HARD RULE: integration test via stale-facet-view-plugin.integration.test.ts.

import { ViewPlugin, type ViewUpdate, type EditorView, Decoration, type DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

import {
  whichLayerIsCanonical,
} from './facet-hash-core.ts';
import {
  computeFacetStates,
  suffixTextForState,
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

/** v0.2.264 — Body marks per hexa-state. Source facets get no body
 *  decoration (full color). */
const DERIVED_MARK = Decoration.mark({
  class: 'forge-facet-derived',
  attributes: {
    title:
      'Derived facet — auto-produced from the current source. '
      + 'Reflects the source at time of forge.',
  },
});

const OUT_OF_DATE_MARK = Decoration.mark({
  class: 'forge-facet-out-of-date',
  attributes: {
    title:
      'Out of date — this facet\'s lineage points at a prior source '
      + 'state. Forge-click or /generate to refresh.',
  },
});

const IGNORED_MARK = Decoration.mark({
  class: 'forge-facet-ignored',
  attributes: {
    title:
      'Ignored — this facet is upstream of the current canonical in '
      + 'the D → R → P chain. Content preserved but not driving runtime. '
      + 'Edit this facet to reclaim canonical status.',
  },
});

/** Widget appended after each H1 heading rendering the hexa-state
 *  suffix per v11.6 §2.2. View-only decoration; does NOT persist to
 *  the on-disk markdown. */
class FacetStateSuffixWidget extends WidgetType {
  readonly state: FacetState;
  constructor(state: FacetState) {
    super();
    this.state = state;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.textContent = ` ${suffixTextForState(this.state)}`;
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
  [FacetState.DerivedFromDescription]:
    'Derived from Description — reflects current Description via /generate lineage.',
  [FacetState.DerivedFromRecipe]:
    'Derived from Recipe — reflects current Recipe via transpile, and Recipe is in sync with Description.',
  [FacetState.DerivedFromDescriptionOutOfDate]:
    'Out of date — Recipe\'s lineage points at a prior Description state. Regenerating refreshes.',
  [FacetState.DerivedFromRecipeOutOfDate]:
    'Out of date — Python\'s lineage points at a prior Recipe state OR Recipe is transitively out of date from Description.',
  [FacetState.Ignored]:
    'Ignored — upstream of the current canonical in the D → R → P chain. Edit to reclaim canonical status.',
};

const SUFFIX_DECOS: Record<FacetState, Decoration> = {
  [FacetState.Source]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.Source),
    side: 1,
  }),
  [FacetState.DerivedFromDescription]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.DerivedFromDescription),
    side: 1,
  }),
  [FacetState.DerivedFromRecipe]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.DerivedFromRecipe),
    side: 1,
  }),
  [FacetState.DerivedFromDescriptionOutOfDate]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.DerivedFromDescriptionOutOfDate),
    side: 1,
  }),
  [FacetState.DerivedFromRecipeOutOfDate]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.DerivedFromRecipeOutOfDate),
    side: 1,
  }),
  [FacetState.Ignored]: Decoration.widget({
    widget: new FacetStateSuffixWidget(FacetState.Ignored),
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

/** Build the [start, end) byte range of an H1 section's content body. */
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

/** Byte offset at the END of the H1 heading line for `name` (position
 *  just BEFORE the newline). Returns -1 when the heading is absent. */
export function findH1HeadingEndOffset(body: string, name: string): number {
  const headingOffset = findH1HeadingOffset(body, name);
  if (headingOffset === -1) return -1;
  const lineEnd = body.indexOf('\n', headingOffset);
  return lineEnd === -1 ? body.length : lineEnd;
}

/** Return the body-mark decoration for a given hexa-state, or null
 *  when source (no body decoration). */
function bodyMarkForState(state: FacetState): Decoration | null {
  switch (state) {
    case FacetState.Source:
      return null;
    case FacetState.DerivedFromDescription:
    case FacetState.DerivedFromRecipe:
      return DERIVED_MARK;
    case FacetState.DerivedFromDescriptionOutOfDate:
    case FacetState.DerivedFromRecipeOutOfDate:
      return OUT_OF_DATE_MARK;
    case FacetState.Ignored:
      return IGNORED_MARK;
  }
}

/** Build the DecorationSet for a given doc + hexa-state map. */
export function buildFacetStateDecorations(
  body: string,
  states: Record<FacetName, FacetState>,
): DecorationSet {
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
    const bodyMark = bodyMarkForState(state);
    if (bodyMark !== null) {
      const r = h1SectionRange(body, heading);
      if (r && r.to > r.from) {
        items.push({ from: r.from, to: r.to, side: 0, deco: bodyMark });
      }
    }
  }
  // L33: RangeSetBuilder demands strictly sorted (from, side) input.
  items.sort((a, b) => (a.from - b.from) || (a.side - b.side));
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of items) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

/** The CM6 ViewPlugin. Async whichLayerIsCanonical → decoration set. */
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
      this.pendingDoc = body;
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
        return;
      }
      const states = computeFacetStates(canonical, oneArgReader);
      this.decorations = buildFacetStateDecorations(body, states);
      try {
        this.view.dispatch({});
      } catch (e) {
        console.error('staleFacetViewPlugin: dispatch failed', e);
      }
    }
  },
  { decorations: v => v.decorations },
);
