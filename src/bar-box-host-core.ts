// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; 11d.5 and 11d.6) - the Beat Box TAB's side of a bar's list, as a PURE state machine: no obsidian, no DOM, no vault. The widget (rhythm_box.html, a vault file) never reports a "gesture": every edit posts
// the WHOLE bar (`forge-rhythm-save`). This module remembers the bar the widget shows, turns each message into the sentences it says (diffBarData: one atomic kind per message), hands them to `appendLine` (ONE write per message, in the order the
// messages came), and when the note's replay is not the bar the widget holds, tells the tab to redraw the widget from the replay (11d.6: "the grid redraws from the replay").
//   * messages are served ONE AT A TIME, in order (a gesture is never planned against a bar another gesture has not finished writing);
//   * the swing slider posts a message per `input` event: while it moves they are held and the LAST one is written after SWING_QUIET_MS of quiet, or at once when anything else comes (one slider drag = one line = one undo);
//   * a bar that cannot be said in sentences (`unlistable`) keeps the old autosave (`legacySave`): nothing is ever lost;
//   * a message that is not rhythm data is dropped with a warning, never written.
import { diffBarData } from './bar-list-core.ts';
import { rhythmDataEqual, validateRhythmData, type RhythmData } from './rhythm-edit-core.ts';
import type { AutosaveStatus } from './rhythm-autosave-core.ts';

export const SWING_QUIET_MS = 200;

export interface BarBoxPorts {
  /** The list's write (controller.appendLine for this tab's note). */
  appendLine(sentence: string): Promise<{ ok: boolean; message: string; data?: RhythmData; reason?: string }>;
  /** Show this bar in the widget (a load message). */
  load(data: RhythmData): void;
  /** Read the note and show what it says (when the write gave no bar back). */
  reload(): Promise<void>;
  /** The old autosave path, for a bar that cannot be listed. */
  legacySave(payload: unknown): void;
  /** The bar the tab shows is now this one (the Score follows it). */
  shown?(data: RhythmData): void;
  /** The widget's own save indicator ("Saved", or the reason it was not): a list write is a save too. */
  status?(status: AutosaveStatus): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  warn(message: string): void;
}

export interface BarBoxHost {
  /** A `forge-rhythm-save` message from the widget (its whole bar). */
  save(payload: unknown): void;
  /** The widget was given this bar (a load, a reload): it is what it shows now; anything held for the old one is dropped. */
  loaded(data: RhythmData): void;
  /** The bar the widget shows, as far as this tab knows. */
  current(): RhythmData;
  /** A message is waiting, held or being written. */
  busy(): boolean;
  /** Write everything held and wait until nothing is pending. */
  flush(): Promise<void>;
}

const swingOnly = (s: readonly string[]): boolean => s.length === 1 && /^Set the swing to /.test(s[0]);

export function createBarBoxHost(initial: RhythmData, ports: BarBoxPorts): BarBoxHost {
  let shown: RhythmData = JSON.parse(JSON.stringify(initial));
  let held: RhythmData | null = null;
  let timer: unknown = null;
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let epoch = 0;

  const clearHeld = (): void => { held = null; if (timer !== null) { ports.clearTimer(timer); timer = null; } };

  /** Say the difference between what the widget showed and what it shows now, write it, and redraw if the note's replay is not the bar. */
  async function apply(payload: RhythmData): Promise<void> {
    const sentences = diffBarData(shown, payload);
    if (sentences.length === 0) { shown = payload; return; }
    const mine = epoch;
    let r: Awaited<ReturnType<BarBoxPorts['appendLine']>>;
    try { r = await ports.appendLine(sentences.join(' ')); } catch (e) { ports.warn(`[forge] bar list: the write threw: ${(e as Error)?.message ?? e}`); r = { ok: false, message: 'The write failed.' }; }
    if (mine !== epoch) return;                                                              // the widget was reloaded meanwhile: what it shows is the note's, not this message's
    if (r.ok === true) {
      const truth = r.data;
      if (truth !== undefined && !rhythmDataEqual(truth, payload)) { shown = JSON.parse(JSON.stringify(truth)); ports.load(truth); ports.shown?.(truth); return; }       // the replay is not the grid: the grid is redrawn from the replay
      shown = payload; ports.shown?.(payload); ports.status?.({ state: 'saved' });
      return;
    }
    if (r.reason === 'unlistable') { shown = payload; ports.legacySave(payload); ports.shown?.(payload); return; }
    ports.warn(`[forge] bar list: not written: ${r.message}`);
    ports.status?.({ state: 'error', message: r.message });
    await ports.reload();                                                                    // what the note says is what the widget shows again
  }

  const enqueue = (job: () => Promise<void>): void => {
    pending++;
    tail = tail.then(job).catch((e) => { ports.warn(`[forge] bar list: ${(e as Error)?.message ?? e}`); }).then(() => { pending--; });
  };
  const applyHeld = async (): Promise<void> => { const h = held; clearHeld(); if (h !== null) await apply(h); };

  return {
    save(raw) {
      const v = validateRhythmData(raw);
      if (v.ok === false) { ports.warn(`[forge] bar list: dropped a message that is not rhythm data: ${v.message}`); return; }
      const payload = v.value;
      enqueue(async () => {
        if (swingOnly(diffBarData(held ?? shown, payload))) {
          held = payload;
          if (timer !== null) ports.clearTimer(timer);
          timer = ports.setTimer(() => { timer = null; enqueue(applyHeld); }, SWING_QUIET_MS);
          return;
        }
        await applyHeld();
        await apply(payload);
      });
    },
    loaded(data) { epoch++; clearHeld(); shown = JSON.parse(JSON.stringify(data)); },
    current: () => shown,
    busy: () => pending > 0 || held !== null,
    async flush() { if (held !== null) enqueue(applyHeld); await tail; while (pending > 0) await tail; },
  };
}
