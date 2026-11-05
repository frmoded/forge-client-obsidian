// 2026-11-05-1183 (M17c, design 4.13/4.14) - the notebook below a COMPOSITION's Score: its pure core, no `obsidian` import. The notebook is the one component the phrase tabs use (notebook-core.ts / notebook-dom.ts); a composition
// passes it its own SELECTION SOURCE: the bars are the composition's own, numbered 1..N across the whole piece (the bar numbers a transform's ops use), and a chip names them by the SECTION they belong to. A section is a line of the
// composition (a repeat of it is a pass: composition-core.ts, THE count of sections), so a bar belongs to a section by where the Score's shape puts it (`first` and `bars` of each expanded section).
import { selectionChip, selectionRuns, type Selection } from './notebook-core.ts';

/** One expanded section as the Score's shape carries it (composition-core.ts CompositionShape): `index` the section of the json (from 0), `copy` which play of it (from 0), the note it plays, how many bars it fills and the number of its first bar (from 1). */
export interface ShapeSection { index: number; copy: number; source: string; bars: number; first: number }

const base = (noteId: string): string => noteId.split('/').pop() ?? noteId;
const runWords = (runs: ReadonlyArray<readonly [number, number]>): string => runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');

/** The section a bar of the Score belongs to (the expanded section whose bars cover it), or null when the shape does not say. */
export function sectionOfBar(sections: readonly ShapeSection[], bar: number): ShapeSection | null {
  return sections.find((s) => bar >= s.first && bar < s.first + s.bars) ?? null;
}

/**
 * The chip text of a selection on a composition: "bars 3-4 of section 2 ([[arr_001]])", a whole section as "section 2 ([[arr_001]])", a bar of a section played more than once with its pass ("bar 5 of section 2, pass 2 ([[arr_001]])"),
 * a selection across sections one part per section ("bars 2-3 of section 1 ([[phrase_003]]); bars 4-5 of section 2 ([[arr_001]])"), the row after ("... , kick row"). The bar numbers are the composition's own (what a transform's ops take).
 * null = nothing selected. A shape that does not cover a selected bar (no Score yet, a stale one) falls back to the phrase tab's own chip text ("bars 3 to 5"): never wrong, only plainer.
 */
export function compositionSelectionChip(selection: Selection, sections: readonly ShapeSection[]): string | null {
  if (selection.bars.length === 0) return null;
  if (selection.bars.some((n) => sectionOfBar(sections, n) === null)) return selectionChip(selection);
  const parts: string[] = [];
  for (const section of sections) {
    const picked = selection.bars.filter((n) => n >= section.first && n < section.first + section.bars);
    if (picked.length === 0) continue;
    const passes = sections.filter((s) => s.index === section.index).length;
    const where = `section ${section.index + 1}${passes > 1 ? `, pass ${section.copy + 1}` : ''} ([[${base(section.source)}]])`;
    parts.push(picked.length === section.bars ? where : `${picked.length === 1 ? 'bar' : 'bars'} ${runWords(selectionRuns(picked))} of ${where}`);
  }
  return `${parts.join('; ')}${selection.row !== null ? `, ${selection.row} row` : ''}`;
}
