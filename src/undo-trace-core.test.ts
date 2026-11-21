// 2026-11-20-1004z (4a) - the undo-trigger TRACE: when stepList / stepBar run, which path called them (key, menu, typed, beforeinput, other) goes into a small in-memory ring buffer (the last 20), readable from the Developer Console as
// `window.__forgeUndoTrace` in the music edition only. Nothing is written to disk and no sentence text is stored: the note's NAME, the way in, undo or redo, and a time. It exists to answer, the next time a `Removed: ...` line appears that
// nobody asked for (1002a), WHAT asked for it. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, UNDO_TRACE_CAP, createUndoTrace } from './undo-trace-core.ts';

test('the sentinel and the cap (20)', () => { assert.equal(LIST_MODEL_SENTINEL_UNDO_TRACE_CORE, 'forge-list-model-core:undo-trace-core'); assert.equal(UNDO_TRACE_CAP, 20); });

test('an entry holds the time, the way in, undo or redo and the NOTE NAME (never the folder, never a sentence); oldest first', () => {
  let clock = Date.parse('2026-11-21T10:00:00.000Z'); const t = createUndoTrace({ now: () => clock++, expose: null });
  t.record('key', 'undo', 'phrases/phrase_001.md'); t.record('menu', 'redo', 'bars/bar_007.md');
  assert.deepEqual(t.entries(), [{ t: '2026-11-21T10:00:00.000Z', via: 'key', which: 'undo', note: 'phrase_001' }, { t: '2026-11-21T10:00:00.001Z', via: 'menu', which: 'redo', note: 'bar_007' }]);
  assert.deepEqual(Object.keys(t.entries()[0]).sort(), ['note', 't', 'via', 'which']);
});

test('the ring keeps the LAST 20: the 21st pushes the first out, order kept; entries() is a copy (changing it changes nothing)', () => {
  const t = createUndoTrace({ now: () => 0, expose: null });
  for (let i = 0; i < 25; i++) t.record(i % 2 === 0 ? 'key' : 'typed', 'undo', `phrases/p${i}.md`);
  const e = t.entries(); assert.equal(e.length, 20); assert.equal(e[0].note, 'p5'); assert.equal(e[19].note, 'p24');
  e.length = 0; e.push({ t: 'x', via: 'other', which: 'undo', note: 'x' }); assert.equal(t.entries().length, 20); assert.equal(t.entries()[0].note, 'p5');
});

test('every way in is accepted; anything else is recorded as `other`; a path with no folder or no .md keeps its name', () => {
  const t = createUndoTrace({ now: () => 0, expose: null });
  for (const via of ['key', 'menu', 'typed', 'beforeinput', 'other'] as const) t.record(via, 'undo', 'a.md'); t.record('bogus' as never, 'undo', 'weird name'); t.record('key', 'undo', 'dir/sub/x.y.md');
  assert.deepEqual(t.entries().map((e) => e.via), ['key', 'menu', 'typed', 'beforeinput', 'other', 'other', 'key']); assert.deepEqual(t.entries().slice(-2).map((e) => e.note), ['weird name', 'x.y']);
});

test('exposed as `__forgeUndoTrace` on the given global (a getter that returns a COPY), redefinable by a second plugin load; with no global nothing is exposed; nothing else is added to it', () => {
  const g: Record<string, unknown> = {}; const a = createUndoTrace({ now: () => 0, expose: g }); a.record('key', 'undo', 'phrases/p.md');
  assert.deepEqual(Object.getOwnPropertyNames(g), ['__forgeUndoTrace']); const view = g.__forgeUndoTrace as Array<{ note: string }>; assert.equal(view[0].note, 'p'); view.length = 0; assert.equal((g.__forgeUndoTrace as unknown[]).length, 1);
  const b = createUndoTrace({ now: () => 0, expose: g }); b.record('menu', 'redo', 'bars/bar_001.md'); assert.deepEqual((g.__forgeUndoTrace as Array<{ via: string }>).map((e) => e.via), ['menu'], 'the newer load owns the name');
  assert.deepEqual(Object.getOwnPropertyDescriptor(g, '__forgeUndoTrace')?.enumerable, false);
});
