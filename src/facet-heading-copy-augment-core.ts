// Facet-heading copy augmentation — pure core. Drain 2026-07-23-1100
// (attempt 2; attempt 1 held per the drain's §7 and adjudicated back
// into the queue 2026-08-05).
//
// THE BUG: Obsidian's Live Preview copy serializes the RENDERED
// content, and the renderer turns `# Description` source lines into H1
// widgets whose `#` markers are not in the DOM selection stream — so
// native Cmd-C on a V2a note drops the facet heading lines.
//
// THE FIX'S SHAPE: instead of patching Obsidian's rendered-copy output,
// the copy handler (facet-copy-view-extension.ts) replaces it with the
// SOURCE slice of the selection. The source always contains everything,
// so the stripping problem vanishes wholesale. What remains is the
// drain §4.4 adjacency rule — when the cohort selects only a facet's
// BODY, the facet's heading line is outside the selected range, and
// they still expect the section title to travel. That prepending
// decision is this module.
//
// PREPEND RULE (per drain §4.4, resolved to one predicate):
// a facet heading is prepended to a range's slice iff
//   (a) the range overlaps that facet's BODY (text strictly after the
//       heading line, before the next H1), AND
//   (b) the heading line is NOT already fully contained in the range —
//       if it is, the source slice carries it and prepending would
//       duplicate it.
// Consequences pinned by tests: Cmd-A prepends nothing (byte-exact
// round-trip); a body-only selection gains exactly its own facet's
// heading; a selection spanning two facets gains the first facet's
// heading while the second's arrives inside the slice.
//
// NO OBSIDIAN OR CM6 IMPORTS — ranges arrive as plain {from, to} so
// every selection shape is testable against strings.

import { isV2Shape } from './v2-note-core.ts';

/** One selection range, in source-string offsets. CM6's
 *  `SelectionRange.from/to` satisfy this shape directly. */
export interface CopyRange {
  from: number;
  to: number;
}

/** The three facet headings this feature augments. `## Inputs` and
 *  every other H2 are deliberately absent (drain §4.3): H2s survive
 *  Obsidian's rendered copy, and since this handler writes the source
 *  slice they survive here too, unmodified. */
const FACET_HEADING_RE = /^# (Description|Recipe|Python)[ \t]*$/gm;

/** Any H1 terminates the previous facet's body. */
const ANY_H1_RE = /^# .*$/gm;

export interface FacetHeadingPos {
  /** 'Description' | 'Recipe' | 'Python' */
  name: string;
  /** Offset of the `#` that starts the heading line. */
  from: number;
  /** Offset just past the heading text (end of line, before the \n). */
  to: number;
  /** Offset where the facet's body ends: the start of the next H1
   *  line, or body.length. */
  bodyEnd: number;
}

/** Locate the facet heading lines and their body extents. */
export function findFacetHeadings(body: string): FacetHeadingPos[] {
  const h1Starts: number[] = [];
  for (const m of body.matchAll(ANY_H1_RE)) h1Starts.push(m.index ?? 0);

  const out: FacetHeadingPos[] = [];
  for (const m of body.matchAll(FACET_HEADING_RE)) {
    const from = m.index ?? 0;
    const to = from + m[0].length;
    const nextH1 = h1Starts.find(s => s > from);
    out.push({
      name: m[0].replace(/^#\s+/, '').trim(),
      from,
      to,
      bodyEnd: nextH1 ?? body.length,
    });
  }
  return out;
}

/**
 * The augmented copy string for a selection over a V2a note body.
 *
 * Returns:
 * - `null`   — body is not V2a-shaped; the caller falls through to the
 *              default copy untouched (drain §5 case 5).
 * - `''`     — every range is empty; caller falls through (§4.2 / §5
 *              case 4).
 * - a string — the copy payload: for each non-empty range, applicable
 *              facet headings (per the prepend rule above) followed by
 *              the SOURCE slice of the range; multiple ranges joined
 *              with '\n', matching CM6's own multi-range copy join.
 */
export function augmentFacetHeadingCopy(
  body: string,
  ranges: CopyRange[],
): string | null {
  if (!isV2Shape(body)) return null;

  const nonEmpty = ranges.filter(r => r.to > r.from);
  if (nonEmpty.length === 0) return '';

  const headings = findFacetHeadings(body);

  const pieces = nonEmpty.map(r => {
    const slice = body.slice(r.from, r.to);
    const prefixes = headings
      .filter(h => {
        const fullyContained = r.from <= h.from && r.to >= h.to;
        if (fullyContained) return false;
        // Overlap with the facet BODY (strictly after the heading
        // line). A selection that touches only the heading line — or
        // only a fragment of it — gets no prepend: the slice already
        // shows exactly what was selected, source-faithfully.
        return r.from < h.bodyEnd && r.to > h.to;
      })
      .map(h => `# ${h.name}\n\n`)
      .join('');
    return prefixes + slice;
  });

  return pieces.join('\n');
}
