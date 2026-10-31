// score_first M5 — the ONE place the plugin asks the engine for a phrase's Score: `computePhraseScore` on the Pyodide host (plugin-side Python composing extend_rhythm, rhythm_bars_to_stream and
// serialize_result). The sibling of rhythm-score-engine.ts, which does the same for a single bar.
import type { RhythmData } from './rhythm-edit-core.ts';
import type { MixBars, PhraseParams, TransformInput } from './phrase-core.ts';
import type { ArrangementInput } from './arrangement-core.ts';
import type { CompositionInput } from './composition-core.ts';
import { getPyodideHost } from './pyodide-host.ts';

export async function computePhraseScoreViaEngine(data: RhythmData | MixBars | TransformInput, params: PhraseParams, title: string): Promise<unknown> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).computePhraseScore(data, params, title);
}

/** 2026-10-29-0820 (M10 slice 1): the Score of an ARRANGEMENT - the tracks (a kit and the bars of the phrase played on it) merged by the engine's combine_tracks and drawn by the same glue as a phrase. */
export async function computeArrangementScoreViaEngine(data: ArrangementInput, title: string): Promise<unknown> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).computePhraseScore(data, { kind: 'arrangement' }, title);
}

/** 2026-10-25-1000: how many single-hit changes lie between two bars, asked of the engine (`morph_rhythm_info`), for "Turn this mix into a morph". Throws when the engine is not available or refuses the pair. */
export async function morphChangesViaEngine(a: RhythmData, b: RhythmData, order: string, seed: number): Promise<number> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).morphChanges(a, b, order, seed);
}

/** 2026-10-31-1100 (M17b): the Score of a COMPOSITION - the sections (the note each came from and the bars it made) repeated or cut to their lengths and joined by the engine's compose_sections, drawn by the same glue as a phrase. */
export async function computeCompositionScoreViaEngine(data: CompositionInput, title: string): Promise<unknown> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).computePhraseScore(data, { kind: 'composition' }, title);
}
