// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; 11d.6) - what the Beat Box TAB needs from the plugin to write a bar through the list: `controller.appendLine`, and the controller's undo and redo. The tab (rhythm-edit-view.ts) does not own the description controller
// (score-first.ts builds it, only in a score-first vault: P3), so score-first registers these HERE once and the tab asks (the same pattern as the Score's selection bus). A tab with no host (a lean edition, any other vault, a test) has none: it writes through its own
// autosave, byte for byte as before. Pure: no obsidian, no DOM.
import type { RhythmData } from './rhythm-edit-core.ts';

export interface BarListHost {
  /** ONE gesture (one or more canonical sentences) APPENDED to the bar's list at `path`: one `process`, one write, undoable. `data` is the bar the note says now; `reason: 'unlistable'` = this bar cannot be put in a list (the tab then uses its own save). */
  appendLine(path: string, sentence: string, opts?: { gesture?: string }): Promise<{ ok: boolean; message: string; data?: RhythmData; reason?: string }>;
  undoLast(path: string): Promise<{ ok: boolean; message: string }>;
  redoLast(path: string): Promise<{ ok: boolean; message: string }>;
}
let host: BarListHost | null = null;
/** Register the host; the returned function takes it away again (only if it is still this one). */
export function registerBarListHost(h: BarListHost): () => void {
  host = h;
  return () => { if (host === h) host = null; };
}
export const barListHost = (): BarListHost | null => host;
