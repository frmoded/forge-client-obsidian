// Drain 2026-10-18-1800 §2 — auto-height, the WIDGET half. The Rhythm Box measures its own content and posts `{type: "resize", height}`
// so the host can size the iframe to fit (no inner scrollbar, no dead space). It only does so when the host asks (`autoHeight: true` on the load
// message — an embed with an explicit `height:` never asks), never standalone, and never in a feedback loop (it measures the content, which does not
// depend on the iframe's height; one post per animation frame; sub-pixel changes are not posted).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, ROCK, skip, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
const sizes = (h: Harness) => h.posted.filter((m) => m && m.type === 'resize').map((m) => m.height);
const load = (extra: object = {}) => ({ type: 'forge-rhythm-load', data: ROCK, noteName: 'rhythm_pattern_test', ...extra });
const tick = () => new Promise((r) => setTimeout(r, 40));

/** A page whose content height the test controls, with a ResizeObserver it can fire. */
async function page(opts: { host?: boolean } = {}) {
  const h = await loadWidget(opts.host !== false);
  let contentHeight = 500;
  h.doc.body.getBoundingClientRect = () => ({ x: 0, y: 0, width: 600, height: contentHeight, top: 0, left: 0, right: 600, bottom: contentHeight });
  const observers: Array<{ cb: () => void; observed: unknown[]; disconnected: boolean }> = [];
  h.win.ResizeObserver = class {
    rec: { cb: () => void; observed: unknown[]; disconnected: boolean };
    constructor(cb: () => void) { this.rec = { cb, observed: [], disconnected: false }; observers.push(this.rec); }
    observe(el: unknown) { this.rec.observed.push(el); }
    disconnect() { this.rec.disconnected = true; }
    unobserve() {}
  };
  return {
    h, observers,
    setHeight: (px: number) => { contentHeight = px; },
    fire: async () => { for (const o of observers.filter((x) => !x.disconnected)) o.cb(); await tick(); },
  };
}

test('pure autoHeightPlan: whole pixels rounded UP, nothing for junk or for a change of one pixel or less', { skip }, () => {
  const { autoHeightPlan } = pureCore();
  assert.equal(autoHeightPlan(500, null), 500);
  assert.equal(autoHeightPlan(500.2, null), 501, 'rounded up: never cut the last pixel');
  assert.equal(autoHeightPlan(500, 500), null);
  assert.equal(autoHeightPlan(500.6, 500), null, 'rounds to 501: one pixel from what was last posted is wobble, not a change');
  assert.equal(autoHeightPlan(502, 500), 502);
  assert.equal(autoHeightPlan(450, 500), 450, 'shrinks too');
  for (const bad of [0, -5, NaN, Infinity, undefined, null, '300']) assert.equal(autoHeightPlan(bad as number, null), null, String(bad));
});

test('asked by the host (autoHeight: true) the widget measures its content and posts the resize', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true }));
  await tick();
  assert.deepEqual(sizes(p.h), [500], 'the first measurement is posted without waiting for a change');
  assert.ok(p.observers.length >= 1 && p.observers[0].observed.includes(p.h.doc.body), 'it observes the body (the content), not the iframe');
});

test('growing and shrinking content is followed; a one-pixel wobble is not posted', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true })); await tick();
  p.setHeight(620); await p.fire();
  p.setHeight(621); await p.fire();
  p.setHeight(380); await p.fire();
  p.setHeight(380.4); await p.fire();
  assert.deepEqual(sizes(p.h), [500, 620, 380]);
});

test('a burst of observer callbacks inside one frame posts once (the latest measurement)', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true })); await tick();
  let frames = 0;
  const realRaf = p.h.win.requestAnimationFrame.bind(p.h.win);
  p.h.win.requestAnimationFrame = (f: () => void) => { frames++; return realRaf(f); };
  p.setHeight(700); for (const o of p.observers) { o.cb(); o.cb(); o.cb(); }
  p.setHeight(710); for (const o of p.observers) o.cb();
  await tick();
  assert.deepEqual(sizes(p.h), [500, 710]);
  assert.equal(frames, 1, 'four observer callbacks inside one frame scheduled ONE measurement');
});

test('NOT asked (no autoHeight, or anything but the exact true): nothing is measured and nothing is posted', { skip }, async () => {
  for (const extra of [{}, { autoHeight: false }, { autoHeight: 'true' }, { autoHeight: 1 }, { autoHeight: null }]) {
    const p = await page();
    await p.h.send(load(extra)); await tick();
    p.setHeight(900); await p.fire();
    assert.deepEqual(sizes(p.h), [], JSON.stringify(extra));
    assert.equal(p.observers.length, 0, `no observer created for ${JSON.stringify(extra)}`);
  }
});

test('standalone (no host window) never posts a resize, even with a load message', { skip }, async () => {
  const p = await page({ host: false });
  await p.h.send(load({ autoHeight: true }), null); await tick();
  p.setHeight(900); await p.fire();
  assert.deepEqual(sizes(p.h), []);
  assert.equal(p.observers.length, 0, 'and it did not even start measuring: nobody is listening');
});

test('a later load without autoHeight turns it off again (the observer is disconnected)', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true })); await tick();
  await p.h.send(load({})); await tick();
  assert.ok(p.observers.every((o) => o.disconnected), 'disconnected');
  p.setHeight(900); await p.fire();
  assert.deepEqual(sizes(p.h), [500]);
});

test('re-enabling does not stack observers (one live observer after many loads)', { skip }, async () => {
  const p = await page();
  for (let i = 0; i < 4; i++) { await p.h.send(load({ autoHeight: true })); await tick(); }
  assert.equal(p.observers.filter((o) => !o.disconnected).length, 1);
});

test('switching grid <-> circle changes the content height and the new height is posted', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true })); await tick();
  p.setHeight(820);
  p.h.el('bViewCircle').click(); await p.fire();
  assert.deepEqual(sizes(p.h), [500, 820]);
});

test('a REFUSED note (the error line changes the layout) is measured too', { skip }, async () => {
  const p = await page();
  await p.h.send({ type: 'forge-rhythm-load', data: { nonsense: true }, noteName: 'x', autoHeight: true }); await tick();
  assert.deepEqual(sizes(p.h), [500]);
  assert.match(p.h.el('loadMsg').textContent, /Could not load/);
});

test('without ResizeObserver the widget still posts the initial height (and does not throw)', { skip }, async () => {
  const h = await loadWidget(true);
  h.doc.body.getBoundingClientRect = () => ({ height: 444 });
  (h.win as any).ResizeObserver = undefined;
  await h.send(load({ autoHeight: true })); await tick();
  assert.deepEqual(sizes(h), [444]);
});

test('the shape of the message: only {type, height}; the host-bar elements and note data are not in it', { skip }, async () => {
  const p = await page();
  await p.h.send(load({ autoHeight: true })); await tick();
  const m = p.h.posted.find((x) => x && x.type === 'resize');
  assert.deepEqual(Object.keys(m).sort(), ['height', 'type']);
});

test('mechanism pin: the resize path goes through autoHeightPlan, measures the BODY, and is switched by msg.autoHeight === true', { skip }, () => {
  assert.match(widgetScript, /function autoHeightPlan\(/);
  assert.match(widgetScript, /msg\.autoHeight === true/, 'only the exact true enables it');
  assert.match(widgetScript, /new ResizeObserver\(/);
  assert.match(widgetScript, /\.observe\(document\.body\)/, 'it observes the content (body), not the viewport');
  assert.match(widgetScript, /autoHeightPlan\(document\.body\.getBoundingClientRect\(\)\.height,/);
  assert.match(widgetScript, /type: "resize"/);
});
