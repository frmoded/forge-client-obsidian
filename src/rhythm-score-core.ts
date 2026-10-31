// Beat-as-data Phase 6 (drain 2026-10-07-1600) — the Score view's decisions, with the engine and the renderer injected.
//
//   produceScore          saved note text -> validated rhythm data -> engine compute -> a tagged MusicXML payload | refusal | error.
//                         It always reads the SAVED note (never a widget's in-memory state) and never writes anything.
//   createScoreScheduler  re-render freshness: debounce external modify events, one render in flight, the latest request queued.

import { readRhythmNote, validateRhythmData, type RhythmData } from './rhythm-edit-core.ts';

export const SCORE_DEBOUNCE_MS = 250;

export interface ScoreDeps {
  /** The note's CURRENT text from the vault (read fresh on every call). */
  readNote(): Promise<string>;
  /** Engine: `rhythm_data_to_stream(data)` serialized as a tagged MusicXML payload. */
  compute(data: RhythmData, title: string): Promise<unknown>;
}

export type ScoreOutcome =
  | { kind: 'score'; payload: Record<string, unknown> }
  | { kind: 'refusal'; message: string }
  | { kind: 'error'; message: string };

function isMusicXmlPayload(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.type === 'musicxml' && typeof r.content === 'string' && r.content.length > 0;
}

/** Engine call + payload check, shared by the note-based score (above) and the playground's data-based one (Phase 8) — ONE pipeline. */
export async function computeScore(compute: ScoreDeps['compute'], data: RhythmData, title: string): Promise<ScoreOutcome> {
  let result: unknown;
  try {
    result = await compute(data, title);
  } catch (e) {
    return { kind: 'error', message: `Score: the engine could not build the score (${(e as Error)?.message ?? e})` };
  }
  if (!isMusicXmlPayload(result)) return { kind: 'error', message: 'Score: the engine returned no score for this note.' };
  return { kind: 'score', payload: result };
}

export async function produceScore(deps: ScoreDeps, title: string): Promise<ScoreOutcome> {
  let text: string;
  try {
    text = await deps.readNote();
  } catch (e) {
    return { kind: 'error', message: `Score: could not read the note (${(e as Error)?.message ?? e})` };
  }
  const note = readRhythmNote(text);
  if (note.ok === false) return { kind: 'refusal', message: `Score: ${note.message}` };
  return computeScore(deps.compute, note.value.data, title);
}

/** Phase 8: the score of rhythm data that is NOT (necessarily) in a note — a playground's current, unsaved state. Validated exactly as a
 *  note's data is; reads no note; writes nothing. */
export async function produceScoreFromData(compute: ScoreDeps['compute'], data: unknown, title: string): Promise<ScoreOutcome> {
  const valid = validateRhythmData(data);
  if (valid.ok === false) return { kind: 'refusal', message: `Score: ${valid.message}` };
  return computeScore(compute, valid.value, title);
}

export interface ScoreSchedulerDeps {
  debounceMs?: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  render(): Promise<void>;
}

export interface ScoreScheduler {
  /** A modify event arrived: (re)start the debounce. */
  request(): void;
  /** Render right now (the first render of a view, a manual refresh): cancels the debounce. */
  renderNow(): void;
  /** 2026-10-31-1110: forget a render that is waiting for its debounce (a render already running is not touched). */
  cancel(): void;
  dispose(): void;
}

export function createScoreScheduler(deps: ScoreSchedulerDeps): ScoreScheduler {
  const debounceMs = deps.debounceMs ?? SCORE_DEBOUNCE_MS;
  let timer: unknown = null;
  let running = false;
  let rerun = false;
  let disposed = false;

  const clear = () => { if (timer !== null) { deps.clearTimer(timer); timer = null; } };

  async function run(): Promise<void> {
    if (disposed) return;
    if (running) { rerun = true; return; }
    running = true;
    try {
      await deps.render();
    } catch (e) {
      console.warn('[forge] rhythm-score: render failed:', e);
    } finally {
      running = false;
    }
    if (rerun && !disposed) { rerun = false; void run(); }
  }

  return {
    request() {
      if (disposed) return;
      clear();
      timer = deps.setTimer(() => { timer = null; void run(); }, debounceMs);
    },
    renderNow() {
      if (disposed) return;
      clear();
      void run();
    },
    cancel() { clear(); },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
