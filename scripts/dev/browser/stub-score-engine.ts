// The REAL engine, behind a tiny local HTTP route (the measurement script runs the bundled Pyodide engine in Node): the data goes out, the tagged MusicXML payload comes back.
export async function computeRhythmScoreViaEngine(data: unknown, title: string): Promise<unknown> {
  const t0 = performance.now();
  const r = await fetch('/compute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, title }) });
  const out = await r.json();
  (window as any).__engineRoundTrips = ((window as any).__engineRoundTrips ?? []).concat([{ ms: performance.now() - t0, serverMs: out.__ms }]);
  if (out.__error) throw new Error(out.__error);
  return out.payload;
}
