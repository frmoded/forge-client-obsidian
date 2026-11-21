// 2026-11-20-1005 (F9) - the controller's side of "the description follows the rename" (music-composer code, behind the list-model seam; lean never carries it). A renamed note of ours (a phrase, an arrangement, a composition, a bar that is still a
// `bar_NNN`) whose generated frontmatter `description:` still starts with the OLD name gets the new name there, in ONE write; a person's own words, a note that is not ours, and a rename that changed nothing are not written. The words are
// rename-description-core.ts.
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_RENAME_FOLLOW_CORE = 'forge-list-model-core:rename-follow-core';
import { followRenamedName } from './rename-description-core.ts';
import { familyOfPath } from './note-family-core.ts';
import { isBarPath } from './phrase-core.ts';

export interface RenamedFile { path: string; extension: string; basename: string }
export interface RenameFollowPorts<F extends RenamedFile> {
  read(f: F): Promise<string>;
  /** ONE atomic read-modify-write of the note (returning the same text writes nothing). */
  process(f: F, fn: (current: string) => string): Promise<unknown>;
  onError(f: F, e: unknown): void;
}
export async function followRenamedDescription<F extends RenamedFile>(f: F, oldPath: string, ports: RenameFollowPorts<F>): Promise<void> {
  if (f.extension !== 'md' || f.path === oldPath || (familyOfPath(f.path) === null && !isBarPath(f.path))) return;
  const oldName = oldPath.replace(/^.*\//, '').replace(/\.md$/, ''), newName = f.basename;
  try {
    if (followRenamedName(await ports.read(f), oldName, newName) === null) return;
    await ports.process(f, (cur) => followRenamedName(cur, oldName, newName) ?? cur);
  } catch (e) { ports.onError(f, e); }
}
