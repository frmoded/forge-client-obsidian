// Drain 2026-10-18-1800 §2 — auto-height widget embeds, the HOST half (pure). A hosted widget measures its own content and posts
// `{type: "resize", height}`; the host sets the iframe's height from it. Everything that keeps that from misbehaving lives here:
// the message is validated, the height is clamped (min, and a hard max of ~1.5 x the pane), sub-pixel wobble is ignored, updates are rate-limited
// and a runaway sequence of them is frozen — so a widget whose own layout depends on the iframe's height cannot drive a feedback loop.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTO_HEIGHT_MAX_PANE_FACTOR, AUTO_HEIGHT_MIN_PX, WIDGET_RESIZE_MESSAGE, clampAutoHeightPx, createAutoHeightController, parseWidgetResize,
} from './widget-auto-height-core.ts';

test('the message type is the one documented for widgets', () => {
  assert.equal(WIDGET_RESIZE_MESSAGE, 'resize');
});

test('parseWidgetResize: a finite non-negative height becomes whole pixels; anything else is null (never a made-up number)', () => {
  assert.equal(parseWidgetResize({ type: WIDGET_RESIZE_MESSAGE, height: 480 }), 480);
  assert.equal(parseWidgetResize({ type: WIDGET_RESIZE_MESSAGE, height: 480.6 }), 481, 'rounded');
  assert.equal(parseWidgetResize({ type: WIDGET_RESIZE_MESSAGE, height: 0 }), 0);
  for (const bad of [
    null, undefined, 'x', 7, [], {}, { type: 'forge-rhythm-save', height: 400 }, { type: WIDGET_RESIZE_MESSAGE },
    { type: WIDGET_RESIZE_MESSAGE, height: '400' }, { type: WIDGET_RESIZE_MESSAGE, height: -1 }, { type: WIDGET_RESIZE_MESSAGE, height: NaN },
    { type: WIDGET_RESIZE_MESSAGE, height: Infinity }, { type: WIDGET_RESIZE_MESSAGE, height: 1e9 }, { type: WIDGET_RESIZE_MESSAGE, height: null },
  ]) assert.equal(parseWidgetResize(bad), null, JSON.stringify(bad));
});

test('clampAutoHeightPx: never below the minimum, never above ~1.5 x the pane (and an absolute ceiling when the pane is unknown)', () => {
  assert.equal(AUTO_HEIGHT_MAX_PANE_FACTOR, 1.5);
  assert.equal(clampAutoHeightPx(10, 800), AUTO_HEIGHT_MIN_PX);
  assert.equal(clampAutoHeightPx(500, 800), 500, 'in range: untouched');
  assert.equal(clampAutoHeightPx(5000, 800), 1200, '1.5 x 800');
  assert.equal(clampAutoHeightPx(1200, 800), 1200, 'the bound itself is allowed');
  assert.equal(clampAutoHeightPx(99999, 0), 4000, 'pane unknown (0): the absolute ceiling');
  assert.equal(clampAutoHeightPx(99999, NaN), 4000);
  assert.equal(clampAutoHeightPx(500, 50), AUTO_HEIGHT_MIN_PX, 'a tiny pane never drives the maximum below the minimum');
});

function harness(over: { pane?: number; initial?: number } = {}) {
  let t = 0;
  const applied: number[] = [];
  const appliedAt: number[] = [];
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const c = createAutoHeightController({
    initial: over.initial ?? 400,
    paneHeight: () => over.pane ?? 800,
    apply: (px) => { applied.push(px); appliedAt.push(t); },
    now: () => t,
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: t + ms, fn, id }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      t = next.at; timers.shift(); next.fn();
    }
    t = end;
  };
  return { c, applied, appliedAt, pendingTimers: () => timers.length, advance, at: () => t, setNow: (x: number) => { t = x; } };
}

test('controller: grows and shrinks with the content; the first request after a quiet period applies at once', () => {
  const h = harness();
  h.c.request(520);
  assert.deepEqual(h.applied, [520]);
  h.advance(200);
  h.c.request(300);
  assert.deepEqual(h.applied, [520, 300], 'shrinks too');
});

test('controller: sub-pixel / one-pixel wobble is ignored (the loop guard\'s first line), a real change is not', () => {
  const h = harness({ initial: 400 });
  h.c.request(400); h.c.request(401);
  assert.deepEqual(h.applied, [], 'within 2 px of the current height: nothing');
  h.c.request(403);
  assert.deepEqual(h.applied, [403]);
  h.advance(200);
  h.c.request(404);
  assert.deepEqual(h.applied, [403], '1 px from the last APPLIED height is still ignored');
});

test('controller: requests inside the rate-limit window are coalesced — the LATEST one wins, applied once when the window ends', () => {
  const h = harness();
  h.c.request(500);                         // applied
  h.advance(10);
  h.c.request(600); h.c.request(650); h.c.request(700);
  assert.deepEqual(h.applied, [500], 'nothing yet: too soon');
  h.advance(100);
  assert.deepEqual(h.applied, [500, 700], 'one trailing update, the latest value');
});

test('controller: out-of-range heights are clamped to [min, 1.5 x pane] before they are applied', () => {
  const h = harness({ pane: 600 });
  h.c.request(20); assert.deepEqual(h.applied, [AUTO_HEIGHT_MIN_PX]);
  h.advance(200);
  h.c.request(5000); assert.deepEqual(h.applied, [AUTO_HEIGHT_MIN_PX, 900]);
  h.advance(200);
  h.c.request(5000); assert.deepEqual(h.applied, [AUTO_HEIGHT_MIN_PX, 900], 'asking for the same clamped height again is a no-op');
});

test('controller: a FEEDBACK LOOP is frozen — a widget that answers every resize with another one cannot make the host thrash', () => {
  const h = harness({ initial: 300 });
  let grow = 320;
  for (let i = 0; i < 200; i++) {                  // a runaway: each call asks for 20 px more, every 25 ms, for five seconds
    h.c.request(grow); grow += 20;
    h.advance(25);
  }
  assert.ok(h.applied.length <= 60, `5 s of runaway produced ${h.applied.length} applies (it would be 200 unguarded)`);
  assert.ok(h.applied.length >= 3, 'and it did not simply stop working');
  const last = h.applied.at(-1)!;
  assert.ok(last <= 1200, 'every applied height stayed inside the clamp');
  // quiet again: a calm request after the storm still works
  h.advance(5000);
  h.c.request(500);
  assert.equal(h.applied.at(-1), 500);
});

test('controller: dispose cancels a pending update and ignores later requests', () => {
  const h = harness();
  h.c.request(500); h.advance(10); h.c.request(650);
  h.c.dispose();
  assert.equal(h.pendingTimers(), 0, 'the timer itself is cancelled, not merely ignored when it fires');
  h.advance(1000);
  assert.deepEqual(h.applied, [500]);
  h.c.request(900);
  assert.deepEqual(h.applied, [500]);
});

test('controller: a request equal to what is already pending is not scheduled twice', () => {
  const h = harness();
  h.c.request(500); h.advance(10);
  h.c.request(650); h.c.request(650); h.c.request(650);
  h.advance(200);
  assert.deepEqual(h.applied, [500, 650]);
});

test('controller: never more than 8 applies in ANY one-second window, even for a steady 10 requests a second of ever-growing content', () => {
  const h = harness({ initial: 300, pane: 100000 });     // a huge pane: the clamp cannot be what stops it
  for (let i = 0; i < 100; i++) { h.c.request(400 + i * 10); h.advance(100); }
  h.advance(3000);
  assert.ok(h.applied.length >= 8, `it kept working (${h.applied.length} applies)`);
  for (let i = 0; i < h.appliedAt.length; i++) {
    const inWindow = h.appliedAt.filter((x) => x >= h.appliedAt[i] && x < h.appliedAt[i] + 1000).length;
    assert.ok(inWindow <= 8, `${inWindow} applies within 1 s starting at ${h.appliedAt[i]} ms`);
  }
  assert.equal(h.applied.at(-1), 400 + 99 * 10, 'and it ends on the LAST height asked for, not an intermediate one');
});
