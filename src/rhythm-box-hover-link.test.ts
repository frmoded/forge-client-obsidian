// score_first M3 (drain 2026-10-21-1230) — the Beat Box widget's hover-link, the WIDGET half. It is inert unless the host's load message says `hoverLink: true`
// (only the score-first Beat Box tab does): without the flag the widget posts nothing on hover, ignores a highlight message and its DOM is unchanged (principle P3).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, ROCK, skip, type Harness } from './test-support/rhythm-widget-harness.ts';

const load = (extra: object = {}) => ({ type: 'forge-rhythm-load', data: ROCK, noteName: 'rhythm_pattern_test', ...extra });
const hovers = (h: Harness) => h.posted.filter((m) => m && m.type === 'forge-rhythm-hover');
const hot = (h: Harness) => [...h.doc.querySelectorAll('.link-hot')].map((e: any) => `${e.getAttribute('data-channel')}:${e.getAttribute('data-step')}`).sort();
const over = (h: Harness, el: any, related: any = null) => el.dispatchEvent(new h.win.MouseEvent('mouseover', { bubbles: true, relatedTarget: related }));
const out = (h: Harness, el: any, related: any = null) => el.dispatchEvent(new h.win.MouseEvent('mouseout', { bubbles: true, relatedTarget: related }));
const html = (h: Harness) => h.doc.body.innerHTML;

test('without hoverLink: hovering posts nothing, a highlight message changes nothing, and the page is byte-for-byte what it was', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load());
  const before = html(h);
  over(h, h.cell('kick', 0)); out(h, h.cell('kick', 0));
  await h.send({ type: 'forge-rhythm-highlight', channel: 'kick', step: 0 });
  assert.deepEqual(hovers(h), []);
  assert.deepEqual(hot(h), []);
  assert.equal(html(h), before);
  const falsy = await loadWidget(true);
  await falsy.send(load({ hoverLink: 'yes' }));
  over(falsy, falsy.cell('kick', 0)); assert.deepEqual(hovers(falsy), [], 'only the exact true switches it on');
});

test('with hoverLink: hovering a grid step posts {channel, step}; moving to another posts again; leaving posts nulls; the same step twice posts once', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ hoverLink: true }));
  over(h, h.cell('kick', 0)); over(h, h.cell('kick', 0));
  over(h, h.cell('snare', 4), h.cell('kick', 0));
  out(h, h.cell('snare', 4), null);
  assert.deepEqual(hovers(h).map((m) => [m.channel, m.step]), [['kick', 0], ['snare', 4], [null, null]]);
});

test('with hoverLink: a highlight message outlines that step (class only, one at a time), {channel: null} or junk clears, and nothing is saved', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ hoverLink: true }));
  const before = h.posted.length;
  await h.send({ type: 'forge-rhythm-highlight', channel: 'snare', step: 4 });
  assert.deepEqual(hot(h), ['snare:4']);
  await h.send({ type: 'forge-rhythm-highlight', channel: 'kick', step: 8 });
  assert.deepEqual(hot(h), ['kick:8'], 'one at a time');
  await h.send({ type: 'forge-rhythm-highlight', channel: null, step: null });
  assert.deepEqual(hot(h), []);
  await h.send({ type: 'forge-rhythm-highlight', channel: 'kick', step: 'x' });
  assert.deepEqual(hot(h), [], 'junk clears, never throws');
  assert.equal(h.posted.slice(before).filter((m) => m.type === 'forge-rhythm-save').length, 0, 'a highlight is not an edit');
});

test('with hoverLink in the circle view: ring cells report and light too', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send({ ...load({ hoverLink: true, mode: 'playground' }), view: 'circle' });
  const cell: any = h.doc.querySelector('#circle .cell[data-channel][data-step]');
  assert.ok(cell, 'the ring has cells');
  const ch = cell.getAttribute('data-channel'), st = Number(cell.getAttribute('data-step'));
  over(h, cell);
  assert.deepEqual(hovers(h).map((m) => [m.channel, m.step]), [[ch, st]]);
  await h.send({ type: 'forge-rhythm-highlight', channel: ch, step: st });
  assert.ok(cell.classList.contains('link-hot'));
});

test('a later load WITHOUT the flag switches the link off and clears any outline (a reload for another host or note)', { skip }, async () => {
  const h = await loadWidget(true);
  await h.send(load({ hoverLink: true }));
  await h.send({ type: 'forge-rhythm-highlight', channel: 'kick', step: 0 });
  assert.deepEqual(hot(h), ['kick:0']);
  await h.send(load());
  assert.deepEqual(hot(h), []);
  const n = hovers(h).length;
  over(h, h.cell('snare', 4)); assert.equal(hovers(h).length, n, 'no hover posts any more');
  await h.send({ type: 'forge-rhythm-highlight', channel: 'kick', step: 0 });
  assert.deepEqual(hot(h), []);
});

test('standalone (no host): the widget never posts a hover (there is nobody to tell)', { skip }, async () => {
  const h = await loadWidget(false);
  await h.send(load({ hoverLink: true }), null);
  over(h, h.cell('kick', 0));
  assert.deepEqual(hovers(h), []);
});
