// 2026-11-20-1004z (4a) - the undo-trigger TRACE (music-composer code, behind the list-model seam; lean has a stub). When stepList / stepBar run, which way in asked for it is kept in a small in-memory ring buffer (the last 20), readable from the
// Developer Console as `window.__forgeUndoTrace`. Nothing is written to disk and no sentence is stored: the note's NAME, the way in, undo or redo, a time. It answers, the next time a `Removed: ...` line appears that nobody asked for (1002a), what asked.
/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_UNDO_TRACE_CORE = 'forge-list-model-core:undo-trace-core';
export const UNDO_TRACE_CAP = 20;
export type UndoVia = 'key' | 'menu' | 'typed' | 'beforeinput' | 'other';
const VIAS: readonly UndoVia[] = ['key', 'menu', 'typed', 'beforeinput', 'other'];
export interface UndoTraceEntry { t: string; via: UndoVia; which: 'undo' | 'redo'; note: string }
export interface UndoTrace { record(via: UndoVia, which: 'undo' | 'redo', path: string): void; entries(): UndoTraceEntry[] }

export function createUndoTrace(o: { now(): number; expose: object | null }): UndoTrace {
  const ring: UndoTraceEntry[] = [];
  const copy = (): UndoTraceEntry[] => ring.map((e) => ({ ...e }));
  if (o.expose !== null) Object.defineProperty(o.expose, '__forgeUndoTrace', { get: copy, configurable: true, enumerable: false });
  return {
    record(via, which, path) {
      ring.push({ t: new Date(o.now()).toISOString(), via: VIAS.includes(via) ? via : 'other', which, note: path.replace(/^.*\//, '').replace(/\.md$/, '') });
      if (ring.length > UNDO_TRACE_CAP) ring.shift();
    },
    entries: copy,
  };
}
