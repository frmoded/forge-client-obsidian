// Beat-as-data Phase 6 (drain 2026-10-07-1600) — the three modes of a rhythm data note's tab: JSON, Beat Box, Score.
//
// Pure core (no obsidian): which modes exist for an edition, which header buttons each mode offers, what a switch does to the per-leaf+file
// "sticky" mark, and what the default-view logic opens next. The Score mode is a NON-DESTRUCTIVE read-only view of the same JSON note and
// exists only in the music edition (the lean build has no Verovio / MIDI player).

import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';

export type EditionId = 'lean' | 'music';
export type RhythmMode = 'json' | 'beatbox' | 'score';
/** What a leaf is marked to stay in: 'markdown' = the JSON text view, 'score' = the Score view. Beat Box is the default, so it has no mark. */
export type ModeMark = 'markdown' | 'score';

export interface ModeAction { mode: RhythmMode; title: string; icon: string }

/** Titles and Lucide icon names. `list-music` (a staff with notes) for Score; the other two are the Phase 5/5b icons. */
export const MODE_ACTIONS: Record<RhythmMode, ModeAction> = {
  json: { mode: 'json', title: 'Open as JSON', icon: 'braces' },
  beatbox: { mode: 'beatbox', title: 'Open as Beat Box', icon: 'music' },
  score: { mode: 'score', title: 'Open as Score', icon: 'list-music' },
};

/** The registered view type each mode lives in (JSON is Obsidian's own markdown view). */
export const RHYTHM_SCORE_VIEW_TYPE = 'forge-rhythm-score';
export const VIEW_TYPE_BY_MODE: Record<RhythmMode, string> = {
  json: 'markdown',
  beatbox: RHYTHM_EDIT_VIEW_TYPE,
  score: RHYTHM_SCORE_VIEW_TYPE,
};

export function availableModes(edition: EditionId): RhythmMode[] {
  return edition === 'music' ? ['json', 'beatbox', 'score'] : ['json', 'beatbox'];
}

/** Rendered left to right, always in this order, skipping the current mode and anything the edition lacks. */
const RENDER_ORDER: readonly RhythmMode[] = ['beatbox', 'score', 'json'];

export function headerActionsFor(current: RhythmMode, edition: EditionId): ModeAction[] {
  const have = availableModes(edition);
  return RENDER_ORDER.filter((m) => m !== current && have.includes(m)).map((m) => MODE_ACTIONS[m]);
}

export type Transition =
  | { ok: true; mode: RhythmMode; mark: ModeMark | null }
  | { ok: false; reason: 'already-there' | 'unavailable' };

/** An explicit switch. The mark it leaves on the leaf: JSON → stay in markdown; Score → stay in Score; Beat Box → none (the default). */
export function transition(edition: EditionId, from: RhythmMode, to: RhythmMode): Transition {
  if (!availableModes(edition).includes(to)) return { ok: false, reason: 'unavailable' };
  if (from === to) return { ok: false, reason: 'already-there' };
  return { ok: true, mode: to, mark: to === 'json' ? 'markdown' : to === 'score' ? 'score' : null };
}

/** Which view the default-view logic should open for a leaf with this mark: null = leave it in the markdown (JSON) view. */
export function defaultTarget(mark: ModeMark | null, edition: EditionId): 'beatbox' | 'score' | null {
  if (mark === 'markdown') return null;
  if (mark === 'score' && edition === 'music') return 'score';
  return 'beatbox';
}

/** Per-leaf marks, scoped to the file the leaf was showing when the mark was set. */
export class ModeMarks<K extends object> {
  private readonly marks = new WeakMap<K, { path: string; mark: ModeMark }>();

  set(leaf: K, path: string, mark: ModeMark): void {
    this.marks.set(leaf, { path, mark });
  }

  clear(leaf: K): void {
    this.marks.delete(leaf);
  }

  /** The mark that applies to `leaf` showing `currentPath`; a mark for another file is dropped. */
  reconcile(leaf: K, currentPath: string | null): ModeMark | null {
    const m = this.marks.get(leaf);
    if (!m) return null;
    if (m.path === currentPath) return m.mark;
    this.marks.delete(leaf);
    return null;
  }
}
