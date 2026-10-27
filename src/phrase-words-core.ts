// 2026-10-27-1030 (M14 slice 1): the words a bar range, a selection and a transform op read in. Shared by the notes (phrase-notes-core.ts: Description, Recipe), the notebook's chips and cells, and phrase-core.ts, which re-exports them.
// A leaf: types only from phrase-core.ts (phrase-core imports phrase-notes-core, which imports this).
import type { TransformOp } from './phrase-core.ts';

export const TRANSFORM_DEFAULT_GRID = 16;

/** "bar 4" / "bars 3 to 5": a 1-based inclusive range of bars, in words. */
export function rangeWords(first: number, last: number): string {
  return first === last ? `bar ${first}` : `bars ${first} to ${last}`;
}
/** What a selection is called on its chip and in a cell: "bars 3 to 5, kick row" (no row = every row). */
export function selectionWords(first: number, last: number, row?: string): string {
  return `${rangeWords(first, last)}${row !== undefined && row !== '' ? `, ${row} row` : ''}`;
}
/** One transform op as a sentence (the Recipe step and the cell's line): what it does to which bars. */
export function transformOpWords(o: TransformOp): string {
  const where = selectionWords(o.first, o.last, o.row);
  if (o.op === 'double_up') return `double up ${where}: every hit gets a second one a step later${o.grid !== TRANSFORM_DEFAULT_GRID ? ` (grid ${o.grid})` : ''}`;
  const amount = o.amount === 1 ? 'remove all the hits' : o.amount === 0 ? 'remove none of the hits' : o.amount === 0.5 ? 'remove half of the hits' : `remove ${Math.round(o.amount * 100)} % of the hits`;
  return `thin out ${where}: ${amount}, ${o.keep === 'seeded' ? `chosen by seed ${o.seed ?? 0}` : 'keeping the strongest beats'}`;
}

/** An op in a few words for a chip: "thin out bars 3 to 5, kick row". */
export function transformOpShort(o: TransformOp): string {
  return `${o.op === 'double_up' ? 'double up' : 'thin out'} ${selectionWords(o.first, o.last, o.row)}`;
}
