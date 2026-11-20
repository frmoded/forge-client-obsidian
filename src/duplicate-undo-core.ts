// 2026-11-19-0992a - TAKING A COPY BACK, the pure part (no obsidian, no DOM). A copy made by `Duplicate [[bar_007]].` is an entry of the note's undo stack (sentence-list-core.ts: an entry that changes no line and carries the copy it made).
// Cmd/Ctrl+Z in the EMPTY composer spends that entry: the copy is moved to the TRASH (a port: the plugin's one that closes the tabs showing the note first, then `vault.trash(file, true)`, the system trash) ONLY when the file's bytes are still
// exactly what the duplicate wrote (a fingerprint compare). A copy that was edited since is LEFT in place and said; so is one that cannot be moved. The entry is spent either way, so the NEXT Cmd/Ctrl+Z reaches the note's own previous sentence.
// Redo of a removed copy is not offered (a trashed note is the person's to restore from the trash). Nothing here writes the phrase.
import { contentFingerprint } from './rhythm-edit-core.ts';
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_DUPLICATE_UNDO_CORE = 'forge-list-model-core:duplicate-undo-core';

/** What the stack keeps of a copy: where it is, its name (for the words), and the fingerprint of the exact text the duplicate wrote. */
export interface CopyMark { path: string; name: string; hash: string }
export const copyMarkOf = (made: { path: string; name: string }, text: string): CopyMark => ({ path: made.path, name: made.name, hash: contentFingerprint(text) });

export interface UndoCopyPorts {
  /** The note's text now; rejects when it cannot be read. */
  read(path: string): Promise<string>;
  /** Is the note in the vault right now? */
  exists(path: string): boolean;
  /** Move the note to the system trash (the plugin's port closes the tabs that show it first). Rejects when it cannot. Never a hard delete. */
  trash(path: string): Promise<void>;
}
export type UndoCopyResult = { state: 'removed' | 'edited' | 'gone' | 'failed'; message: string };

export async function undoCopy(ports: UndoCopyPorts, mark: CopyMark): Promise<UndoCopyResult> {
  const left = (why: string): UndoCopyResult => ({ state: 'failed', message: `${mark.name} was not moved to the trash (${why}), so it was left in place. Delete it in the file list if you want it gone.` });
  if (!ports.exists(mark.path)) return { state: 'gone', message: `${mark.name} is already gone, so there was nothing to remove.` };
  let text: string;
  try { text = await ports.read(mark.path); } catch (e) { console.error('[forge-duplicate] undo: could not read the copy', e); return left(`it could not be read: ${(e as Error)?.message ?? e}`); }
  if (contentFingerprint(text) !== mark.hash) return { state: 'edited', message: `${mark.name} was edited since, so it was left in place. Delete it in the file list if you want it gone.` };
  try { await ports.trash(mark.path); } catch (e) { console.error('[forge-duplicate] undo: the trash failed', e); return left(`${(e as Error)?.message ?? e}`); }
  if (ports.exists(mark.path)) return left('the trash left it there');
  return { state: 'removed', message: `Removed ${mark.name} (moved to the trash).` };
}
