// score_first_experiment M1 (drain 2026-10-21-1100) — the LIVE Score under the Beat Box: the engraved score of the rhythm as it is on screen right now, re-drawn
// (debounced) after each edit. The controller is pure: the engine (`compute`), the drawing (`view`) and the clock are injected, so the whole behaviour — what is shown when,
// what a superseded render draws, what an invalid bar says, how many renders rapid edits cost — is unit-tested without Obsidian, Verovio or Pyodide.
//
// It reuses the Score pipeline that already exists and adds no second one: `produceScoreFromData` (validates exactly as a note's data is validated, calls the engine's
// `rhythm_data_to_stream` through the injected `compute`, checks the MusicXML payload) and `createScoreScheduler` (debounce, ONE render in flight, the latest request queued
// behind it — so rapid edits never queue renders, they collapse into at most one waiting). It READS the widget's current data, never the saved note, and writes nothing.

import { produceScoreFromData, createScoreScheduler, type ScoreOutcome, type ScoreScheduler } from './rhythm-score-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';
import { SCORE_RENDERING_TEXT } from './score-first-core.ts';

/** Longer than the read-only Score view's 250 ms: this one runs while the person is still clicking cells, and every render is an engine round trip plus an engraving. */
export const LIVE_SCORE_DEBOUNCE_MS = 400;

export interface LiveScoreView {
  /** A one-line message above the score area (progress, a refusal, an engine error). '' clears it. */
  status(text: string): void;
  /** Draw a payload. The previous score is replaced only when this one is ready; returns false when the renderer is unavailable (no music edition). */
  draw(payload: Record<string, unknown>): boolean;
  /** Take the current score away (the data it showed is no longer valid). */
  clear(): void;
}

export interface LiveScoreTiming {
  /** The whole pass, from the render starting to the score drawn (or the refusal shown), in ms. */
  totalMs: number;
  /** Engine: validation + `rhythm_data_to_stream` + serialization. */
  engineMs: number;
  outcome: 'score' | 'refusal' | 'error' | 'superseded' | 'no-renderer';
}

export interface LiveScoreDeps {
  /** The engine step for a bar: validated rhythm data in, tagged MusicXML out. Required unless `produce` is given. */
  compute?(data: RhythmData, title: string): Promise<unknown>;
  /** score_first M5: replaces the whole "data -> outcome" step, for a surface whose data is not a bar (a phrase: parameters in, the Score of the extended bar out). The debounce, the ONE render
   *  in flight, the superseding rule and the drawing are exactly the bar's. Absent = `produceScoreFromData(compute, …)`, i.e. the Score of a bar, as before. */
  produce?(data: unknown, title: string): Promise<ScoreOutcome>;
  view: LiveScoreView;
  /** Title of the engraving (the note's name). */
  title: string;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  debounceMs?: number;
  /** A millisecond clock (performance.now in the plugin). Timing is reported only when both `now` and `onTiming` are given. */
  now?: () => number;
  onTiming?(t: LiveScoreTiming): void;
}

export interface LiveScore {
  /** The widget's data changed: remember it and re-draw after the debounce. */
  update(data: unknown): void;
  /** Draw now (the first render of a tab, a reload from the note); cancels the debounce. */
  showNow(data: unknown): void;
  dispose(): void;
}

function safeKey(data: unknown): string | null {
  try { return JSON.stringify(data) ?? null; } catch { return null; }
}

export function createLiveScore(deps: LiveScoreDeps): LiveScore {
  if (typeof deps.produce !== 'function' && typeof deps.compute !== 'function') throw new Error('createLiveScore: needs `compute` (a bar) or `produce` (anything else)');
  const produce: (data: unknown, title: string) => Promise<ScoreOutcome> = deps.produce ?? ((data, title) => produceScoreFromData(deps.compute!, data, title));
  let latest: unknown = undefined;
  let hasData = false;
  let drawn = false;                 // a score is on screen (so "Rendering score…" is only shown for the FIRST draw — an edit keeps the old score until the new one is ready)
  let seq = 0;
  let disposed = false;
  let lastKey: string | null = null;  // the data (as json) of the latest request, so an identical showNow does not engrave the same bar twice
  let failed = false;                 // the last pass ended without a score (a refusal, an engine error): a showNow for the same data tries again
  const timed = typeof deps.now === 'function' && typeof deps.onTiming === 'function';
  const report = (t0: number, engineMs: number, outcome: LiveScoreTiming['outcome']) => {
    if (timed) deps.onTiming!({ totalMs: deps.now!() - t0, engineMs, outcome });
  };

  const scheduler: ScoreScheduler = createScoreScheduler({
    debounceMs: deps.debounceMs ?? LIVE_SCORE_DEBOUNCE_MS,
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
    render: async () => {
      if (disposed || !hasData) return;
      const mine = ++seq;
      const t0 = timed ? deps.now!() : 0;
      if (!drawn) deps.view.status(SCORE_RENDERING_TEXT);
      const e0 = timed ? deps.now!() : 0;
      const outcome = await produce(latest, deps.title);
      const engineMs = timed ? deps.now!() - e0 : 0;
      if (disposed || mine !== seq) { report(t0, engineMs, 'superseded'); return; }   // a newer render started, or the tab moved on: draw nothing
      if (outcome.kind !== 'score') {
        deps.view.clear();
        drawn = false;
        deps.view.status(outcome.message);
        failed = true;
        report(t0, engineMs, outcome.kind);
        return;
      }
      let drew: boolean;
      try {
        drew = deps.view.draw(outcome.payload);
      } catch (e) {
        console.error('createLiveScore: drawing the score failed', e);
        deps.view.status(`Score: could not draw the score (${(e as Error)?.message ?? e})`);
        failed = true;
        report(t0, engineMs, 'error');
        return;
      }
      if (!drew) {
        deps.view.status('The score needs the music edition of the plugin.');
        failed = true;
        report(t0, engineMs, 'no-renderer');
        return;
      }
      drawn = true;
      failed = false;
      deps.view.status('');
      report(t0, engineMs, 'score');
    },
  });

  return {
    update(data) {
      if (disposed) return;
      latest = data;
      lastKey = safeKey(data);
      hasData = true;
      scheduler.request();
    },
    showNow(data) {
      if (disposed) return;
      const key = safeKey(data);
      if (hasData && key !== null && key === lastKey && !failed) return;   // this very bar is already drawn or on its way
      latest = data;
      lastKey = key;
      hasData = true;
      scheduler.renderNow();
    },
    dispose() {
      disposed = true;
      seq++;
      scheduler.dispose();
    },
  };
}
