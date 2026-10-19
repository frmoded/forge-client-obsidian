// Drain 2026-10-19-1500 §3 — the "Updated from note" label must be SEEN. Iteration 81 showed it for 4 s from the moment the vault event arrived. An
// external change (`git checkout` in a terminal, an editor) is only noticed by Obsidian when its window regains focus — the same moment the 4 s
// began, with the student not yet looking at the embed — and an embed scrolled out of view, or in a background tab, spent its 4 s unseen. So the
// 4 seconds now run only while the label can be seen: the window focused, the page visible, the embed on screen.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createUpdatedLabel, isLabelAttentive } from './updated-label-core.ts';

function rig(over: { attentive?: boolean; ms?: number } = {}) {
  let t = 0;
  let attentive = over.attentive ?? true;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const log: Array<[number, 'show' | 'hide']> = [];
  const label = createUpdatedLabel({
    ms: over.ms ?? 4000,
    isAttentive: () => attentive,
    now: () => t,
    show: () => log.push([t, 'show']),
    hide: () => log.push([t, 'hide']),
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: t + ms, fn, id }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const n = timers[0];
      if (!n || n.at > end) break;
      t = n.at; timers.shift(); n.fn();
    }
    t = end;
  };
  return { label, log, advance, setAttentive: (v: boolean) => { attentive = v; label.attentionChanged(); }, pending: () => timers.length };
}

test('attentive: shown at once, hidden exactly 4000 ms later', () => {
  const r = rig();
  r.label.flash();
  assert.deepEqual(r.log, [[0, 'show']]);
  r.advance(3999); assert.deepEqual(r.log, [[0, 'show']]);
  r.advance(1); assert.deepEqual(r.log, [[0, 'show'], [4000, 'hide']]);
});

test('NOT attentive (window unfocused / embed off screen): shown, but the clock does not run — however long it waits', () => {
  const r = rig({ attentive: false });
  r.label.flash();
  r.advance(60_000);
  assert.deepEqual(r.log, [[0, 'show']], 'still showing after a minute nobody could see it');
  assert.equal(r.pending(), 0, 'no timer was armed');
});

test('when attention arrives, the full 4 s start THEN', () => {
  const r = rig({ attentive: false });
  r.label.flash();
  r.advance(30_000);
  r.setAttentive(true);
  r.advance(3999); assert.equal(r.log.length, 1);
  r.advance(1); assert.deepEqual(r.log.at(-1), [34_000, 'hide']);
});

test('attention lost mid-count pauses the clock; the remaining time is NOT forgotten and not reset (the label gets its full 4 s of being seen)', () => {
  const r = rig();
  r.label.flash();
  r.advance(1500);
  r.setAttentive(false);
  r.advance(20_000);
  assert.equal(r.log.length, 1, 'still showing');
  r.setAttentive(true);
  r.advance(2499); assert.equal(r.log.length, 1);
  r.advance(1); assert.deepEqual(r.log.at(-1), [24_000, 'hide'], '1500 ms seen + 2500 ms seen = 4000 (resumed at 21500)');
});

test('a second flash while showing restarts the full count (the newest change gets its 4 s) and shows once', () => {
  const r = rig();
  r.label.flash();
  r.advance(3000);
  r.label.flash();
  r.advance(3999); assert.equal(r.log.filter(([, k]) => k === 'hide').length, 0);
  r.advance(1); assert.deepEqual(r.log.at(-1), [7000, 'hide']);
  assert.equal(r.log.filter(([, k]) => k === 'show').length, 1, 'no flicker: not re-shown while already showing');
});

test('attentionChanged with nothing showing is a no-op; dispose cancels the timer and hides nothing further', () => {
  const r = rig();
  r.label.attentionChanged();
  assert.deepEqual(r.log, []);
  r.label.flash();
  r.label.dispose();
  r.advance(10_000);
  assert.deepEqual(r.log, [[0, 'show']], 'no hide after dispose, no timer left');
  assert.equal(r.pending(), 0);
  r.label.flash(); r.advance(10_000);
  assert.deepEqual(r.log, [[0, 'show']], 'a disposed label stays inert');
});

test('flicker guard: toggling attention 20 times, the label is hidden after EXACTLY 4000 ms of attention in total — not a ms more or less', () => {
  const r = rig();
  r.label.flash();
  for (let i = 0; i < 20; i++) { r.advance(100); r.setAttentive(false); r.advance(500); r.setAttentive(true); }   // 2000 ms attentive, t = 12000
  r.advance(4000);
  assert.deepEqual(r.log.at(-1), [14_000, 'hide'], '2000 ms seen so far + the remaining 2000');
});

test('isLabelAttentive: true only when the window is focused AND the page visible AND the embed on screen', () => {
  const on = { windowFocused: true, pageVisible: true, onScreen: true };
  assert.equal(isLabelAttentive(on), true);
  for (const k of ['windowFocused', 'pageVisible', 'onScreen'] as const) assert.equal(isLabelAttentive({ ...on, [k]: false }), false, k);
});
