// Beat-as-data Phase 6 + 8 — the ONE place the plugin asks the engine for a rhythm score: `computeRhythmScore` on the Pyodide host
// (plugin-side Python composing rhythm_data_to_stream + serialize_result). Shared by the Score view and the `forge-rhythm` embed's
// Score toggle, so neither carries its own copy of "get the host, get the instance, compute".
import type { RhythmData } from './rhythm-edit-core.ts';
import { getPyodideHost } from './pyodide-host.ts';

export async function computeRhythmScoreViaEngine(data: RhythmData, title: string): Promise<unknown> {
  const host = getPyodideHost();
  if (!host) throw new Error('the engine is not available');
  return (await host.getInstance()).computeRhythmScore(data, title);
}
