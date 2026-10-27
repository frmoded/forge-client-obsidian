// score_first M5 — the ONE place the plugin asks the engine for a phrase's Score: `computePhraseScore` on the Pyodide host (plugin-side Python composing extend_rhythm, rhythm_bars_to_stream and
// serialize_result). The sibling of rhythm-score-engine.ts, which does the same for a single bar.
import type { RhythmData } from './rhythm-edit-core.ts';
import type { MixBars, PhraseParams, TransformInput } from './phrase-core.ts';
import { getPyodideHost } from './pyodide-host.ts';

export async function computePhraseScoreViaEngine(data: RhythmData | MixBars | TransformInput, params: PhraseParams, title: string): Promise<unknown> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).computePhraseScore(data, params, title);
}

/** 2026-10-25-1000: how many single-hit changes lie between two bars, asked of the engine (`morph_rhythm_info`), for "Turn this mix into a morph". Throws when the engine is not available or refuses the pair. */
export async function morphChangesViaEngine(a: RhythmData, b: RhythmData, order: string, seed: number): Promise<number> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).morphChanges(a, b, order, seed);
}
