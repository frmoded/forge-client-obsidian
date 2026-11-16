// 2026-11-16-1000 - "the note opens with its title selected for renaming": a new phrase made from the Score's selection has the next free name (phrase_NNN, no dialog first); right after it opens, Obsidian's own rename prompt is offered for it
// (`fileManager.promptForFileRename`, which selects the whole title). An Obsidian without that call simply does not offer it. Never throws: a rename that cannot be offered is a console line, not a failure of the new phrase.
export interface RenameHost { fileManager?: { promptForFileRename?: (file: never) => unknown } }
export function offerRename(app: unknown, file: unknown): boolean {
  const fm = (app as RenameHost | null)?.fileManager;
  if (typeof fm?.promptForFileRename !== 'function') return false;
  try { void fm.promptForFileRename(file as never); return true; } catch (e) { console.error('[forge-barsel] offerRename: the rename prompt could not be opened', e); return false; }
}
