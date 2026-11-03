// The REAL engine behind a tiny local HTTP route, for the views that import src/phrase-engine.ts directly (ArrangementView, CompositionView, PhraseView): the measurement script runs the bundled Pyodide engine in Node and
// answers `/phrase` with the tagged MusicXML payload (the same route entry-phrase.ts's compute port uses). The five exports are the ones phrase-engine.ts has.
async function viaRoute(data: unknown, params: unknown, title: string): Promise<unknown> {
  const r = await fetch('/phrase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, params, title }) });
  const out = await r.json();
  if (out.__error) throw new Error(out.__error);
  return out.payload;
}
export const computePhraseScoreViaEngine = (data: unknown, params: unknown, title: string) => viaRoute(data, params, title);
export const computeArrangementScoreViaEngine = (data: unknown, title: string) => viaRoute(data, { kind: 'arrangement' }, title);
export const computeCompositionScoreViaEngine = (data: unknown, title: string) => viaRoute(data, { kind: 'composition' }, title);
export async function morphChangesViaEngine(): Promise<number> { throw new Error('the harness has no morph route'); }
export async function runCustomPythonViaEngine(): Promise<never> { throw new Error('the harness has no custom-python route'); }
