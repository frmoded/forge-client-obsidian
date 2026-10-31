// 2026-10-31-1100 (M17b, item 4) - the TREE a composition's structure strip shows: the sections as rows, each with the note it plays as a chip, a source that is itself a composition shown one level below it (v1: at most one level of
// nesting is drawn; deeper ones are still played, just not unfolded). Pure; no `obsidian` import.
import type { CompositionParams, CompositionShape } from './composition-core.ts';

export interface TreeRow {
  /** 0 = a section of this composition, 1 = a section of the composition that section plays. */
  depth: 0 | 1;
  /** The note the chip opens (a lineage id: `phrases/phrase_003`, `arrangements/arr_001`, `compositions/intro`). */
  noteId: string;
  /** The chip's text: the note's name. */
  label: string;
  kind: 'phrase' | 'arrangement' | 'composition';
  /** What the row says after the chip: "8 bars", "all its bars", "played 3 times", "bars 9-16". */
  detail: string;
  /** The section of the json this row is (1-based), `null` for a nested row. */
  section: number | null;
}

const baseName = (id: string): string => id.split('/').pop() ?? id;
const kindOf = (source: string): TreeRow['kind'] => (source.startsWith('arrangements/') ? 'arrangement' : source.startsWith('compositions/') ? 'composition' : 'phrase');
const barsWord = (n: number): string => (n === 1 ? 'bar' : 'bars');

function detailOf(s: CompositionParams['sections'][number], span: { first: number; last: number } | null): string {
  const parts: string[] = [s.length !== undefined ? `${s.length} ${barsWord(s.length)}` : 'all its bars'];
  if (s.repeat !== undefined) parts.push(`played ${s.repeat + 1} times`);
  if (span !== null) parts.push(span.first === span.last ? `bar ${span.first}` : `bars ${span.first}-${span.last}`);
  return parts.join(' · ');
}

/** The rows of the tree. `shape` (what the Score on screen is made of, when it has been drawn) adds the bars each section covers; `inner` holds the composition notes the sections play, by source id, already read (a missing one has no children). */
export function treeRows(p: CompositionParams, shape: CompositionShape | null, inner: Readonly<Record<string, CompositionParams | undefined>>): TreeRow[] {
  const rows: TreeRow[] = [];
  p.sections.forEach((s, i) => {
    let span: { first: number; last: number } | null = null;
    if (shape !== null) {
      const plays = shape.sections.filter((x) => x.index === i);
      if (plays.length > 0) span = { first: plays[0].first, last: plays[plays.length - 1].first + plays[plays.length - 1].bars - 1 };
    }
    rows.push({ depth: 0, noteId: s.source, label: baseName(s.source), kind: kindOf(s.source), detail: detailOf(s, span), section: i + 1 });
    const child = s.source.startsWith('compositions/') ? inner[s.source] : undefined;
    if (child !== undefined) for (const c of child.sections) rows.push({ depth: 1, noteId: c.source, label: baseName(c.source), kind: kindOf(c.source), detail: detailOf(c, null), section: null });
  });
  return rows;
}

/** The tree as plain lines (for the evidence line in the console and for tests): "1  phrase_003  8 bars", children indented. */
export const treeText = (rows: readonly TreeRow[]): string =>
  rows.map((r) => `${'  '.repeat(r.depth)}${r.section === null ? '-' : r.section} ${r.label} (${r.kind}) · ${r.detail}`).join('\n');
