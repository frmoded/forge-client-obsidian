// Beat-as-data Phase 6 (drain 2026-10-07-1600) — the ONE place a rhythm note's tab changes mode. Obsidian-coupled glue over the pure
// transition table (rhythm-mode-core.ts): validates, leaves the per-leaf+file mark, and calls `leaf.setViewState` on the SAME leaf — it
// never opens a tab and never writes a note. The Beat Box view, the Score view and the markdown-view header actions all go through it, so
// there is no second swapper (the automatic default-view swap in rhythm-edit-view.ts has its own popstate/verify/retry path).

import { Notice, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';
import { VIEW_TYPE_BY_MODE, transition, type ModeMark, type RhythmMode } from './rhythm-mode-core.ts';

export interface ModeSwitchHooks {
  /** Record (or clear, with null) the leaf's "stay in this mode" mark for this file. */
  setMark(leaf: WorkspaceLeaf, path: string, mark: ModeMark | null): void;
}

/** Switch `leaf` (the note's own tab) from `from` to `to`. Beat Box and Score check up front that the note really is rhythm data, so the
 *  user gets a Notice naming why instead of an empty pane; JSON needs no check (it is the plain text view). */
export async function switchLeafToMode(
  app: App, leaf: WorkspaceLeaf, file: TFile, from: RhythmMode, to: RhythmMode, hooks: ModeSwitchHooks,
): Promise<void> {
  const t = transition(musicEdition.id, from, to);
  if (t.ok === false) return;
  if (to !== 'json') {
    const note = readRhythmNote(await app.vault.read(file));
    if (note.ok === false) {
      new Notice(`${to === 'score' ? 'Score' : 'Edit rhythm'}: ${note.message}`, 8000);
      return;
    }
  }
  hooks.setMark(leaf, file.path, t.mark);                       // before the switch, so the events the switch fires see it
  await leaf.setViewState({ type: VIEW_TYPE_BY_MODE[to], active: true, state: { file: file.path } });
}
