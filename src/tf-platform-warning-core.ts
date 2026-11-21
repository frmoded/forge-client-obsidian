// 2026-11-20-1005 (F6) - `Platform browser has already been set. Overwriting the platform with [object Object].` at start. tfjs-core (2.8.6, a dependency of html-midi-player / @magenta/music) registers a 'browser' platform when IS_BROWSER and a 'node'
// platform when IS_NODE; Obsidian's renderer has both, so the second registration warns. Harmless (the node platform wins; the MIDI player uses no tfjs model) and there is ONE copy of tfjs-core in the bundle, so there is nothing to
// de-duplicate. This swallows that one message, only while the library loads; every other warning passes through, and console.warn is the original again afterwards (even when the load throws or two loads overlap).
const MESSAGE = /^Platform browser has already been set\. Overwriting the platform with /;
type Warn = (...args: unknown[]) => void;
const state = new WeakMap<object, { depth: number; original: Warn }>();

export async function swallowTfPlatformWarning<T>(run: () => Promise<T>, con: { warn: Warn } = console): Promise<T> {
  let s = state.get(con);
  if (s === undefined) {
    const original = con.warn; s = { depth: 0, original }; state.set(con, s);
    con.warn = (...args: unknown[]) => { if (typeof args[0] === 'string' && MESSAGE.test(args[0])) return; original.apply(con, args); };
  }
  s.depth++;
  try { return await run(); }
  finally { s.depth--; if (s.depth === 0) { con.warn = s.original; state.delete(con); } }
}
