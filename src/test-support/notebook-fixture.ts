// 2026-11-05-1183: a notebook cell note for a wiring test, written by the plugin's own writer (never a hand-typed look-alike).
import { cellNoteContent } from '../notebook-core.ts';

export const newNotebookCellForTest = (source: string, result: string): string =>
  cellNoteContent({ id: 'cell_001', source, result, selection: 'bars 1 to 2', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] });
