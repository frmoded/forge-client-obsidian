// score_first M6 (drain 2026-10-22-1950, rider) — Verovio's pageWidth for a host that has not been laid out (the driver's console: `Parameter value 80 for 'pageWidth' out of bounds`, host measured 16 px).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PAGE_WIDTH, MIN_HOST_WIDTH_PX, VEROVIO_MIN_PAGE_WIDTH, pageWidthFor, waitForWidth } from './host-width-core.ts';

test('THE REPORTED CASE: a 16 px host asks for the default page, never 80 (Verovio\'s minimum is 100)', () => {
  assert.equal(pageWidthFor(16), DEFAULT_PAGE_WIDTH);
  assert.ok(pageWidthFor(16) >= VEROVIO_MIN_PAGE_WIDTH);
  assert.equal(pageWidthFor(0), DEFAULT_PAGE_WIDTH);
});

test('a host with a real width gets 5x it (as before); the edge is exactly the minimum host width', () => {
  assert.equal(pageWidthFor(700), 3500);
  assert.equal(pageWidthFor(MIN_HOST_WIDTH_PX), 100);
  assert.equal(pageWidthFor(MIN_HOST_WIDTH_PX - 0.5), DEFAULT_PAGE_WIDTH);
  assert.equal(pageWidthFor(MIN_HOST_WIDTH_PX * 5 / 5), VEROVIO_MIN_PAGE_WIDTH);
});

test('nothing usable is the default page: undefined, NaN, negative, Infinity', () => {
  for (const w of [undefined, Number.NaN, -40, Number.NEGATIVE_INFINITY]) assert.equal(pageWidthFor(w as number | undefined), DEFAULT_PAGE_WIDTH, String(w));
  assert.equal(pageWidthFor(Number.POSITIVE_INFINITY), DEFAULT_PAGE_WIDTH, 'an infinite width is not a width');
});

function host(width: number) {
  const observers: Array<{ cb: () => void; observed: unknown; disconnected: boolean }> = [];
  class RO { o = { cb: () => {}, observed: null as unknown, disconnected: false }; constructor(cb: () => void) { this.o.cb = cb; observers.push(this.o); } observe(el: unknown) { this.o.observed = el; } disconnect() { this.o.disconnected = true; } }
  const h: any = { clientWidth: width, ownerDocument: { defaultView: { ResizeObserver: RO } } };
  return { h, observers };
}
const fakeTimers = () => { const pending: Array<{ fn: () => void; ms: number; cleared: boolean }> = []; return { pending, t: { set: (fn: () => void, ms: number) => { const p = { fn, ms, cleared: false }; pending.push(p); return p; }, clear: (h: unknown) => { (h as { cleared: boolean }).cleared = true; } } }; };

test('waitForWidth: a host that already has a width resolves at once and observes nothing', async () => {
  const { h, observers } = host(700);
  assert.equal(await waitForWidth(h), 700);
  assert.equal(observers.length, 0);
});

test('waitForWidth: a 16 px host waits for the observer to report a real width, then resolves with it and lets go', async () => {
  const { h, observers } = host(16); const { t, pending } = fakeTimers();
  const p = waitForWidth(h, MIN_HOST_WIDTH_PX, 1500, t);
  assert.equal(observers.length, 1); assert.equal(observers[0].observed, h);
  observers[0].cb();                                       // still 16: keeps waiting
  h.clientWidth = 640; observers[0].cb();
  assert.equal(await p, 640);
  assert.equal(observers[0].disconnected, true); assert.equal(pending[0].cleared, true, 'the timeout is cancelled');
});

test('waitForWidth: a host that never gets a width resolves after the timeout with what it has (the caller falls back through pageWidthFor), and only once', async () => {
  const { h, observers } = host(16); const { t, pending } = fakeTimers();
  const p = waitForWidth(h, MIN_HOST_WIDTH_PX, 1500, t);
  assert.equal(pending[0].ms, 1500);
  pending[0].fn(); pending[0].fn();
  assert.equal(await p, 16);
  assert.equal(pageWidthFor(await p), DEFAULT_PAGE_WIDTH);
  assert.equal(observers[0].disconnected, true);
});

test('waitForWidth without a ResizeObserver still ends, by the timeout', async () => {
  const h: any = { clientWidth: 10, ownerDocument: { defaultView: {} } }; const { t, pending } = fakeTimers();
  const p = waitForWidth(h, MIN_HOST_WIDTH_PX, 500, t);
  pending[0].fn();
  assert.equal(await p, 10);
});
