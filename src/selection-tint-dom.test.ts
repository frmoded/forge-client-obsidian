// 2026-10-30-1020 - the bars the notebook has selected are tinted ON the Score, so the person sees what Run will use. A tint is a translucent rectangle INSIDE the bar's group (first child, behind the drawing, inline style: the band's
// lesson - a stylesheet-only cue was not visible in the real Obsidian), drawn from the whole selection each time so a redrawn SVG gets it again, idempotent so the inspector's observer does not loop on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { SELECTED_BAR_CLASS, paintSelectionTint } from './selection-tint-dom.ts';

function host(bars = 6, measurable = true) {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  el.innerHTML = '<svg>' + Array.from({ length: bars }, (_, i) => `<g class="measure" id="ph_bar_${i + 1}"><g class="note"></g></g>`).join('') + '</svg>';
  if (measurable) el.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
  const tinted = () => [...el.querySelectorAll(`.${SELECTED_BAR_CLASS}`)].map((r: any) => r.parentNode.id);
  return { win, el, tinted };
}

test('the selected bars, and only they, get a tint rectangle, behind the drawing, that cannot take a click', () => {
  const h = host();
  paintSelectionTint(h.el, ['ph_bar_3', 'ph_bar_4', 'ph_bar_5']);
  assert.deepEqual(h.tinted(), ['ph_bar_3', 'ph_bar_4', 'ph_bar_5']);
  const bar = h.el.querySelector('#ph_bar_4') as any;
  const r = bar.firstElementChild;
  assert.equal(r.getAttribute('class'), SELECTED_BAR_CLASS, 'first child: behind the drawing');
  assert.equal(r.getAttribute('pointer-events'), 'none');
  assert.deepEqual(['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a)), ['300', '0', '90', '50']);
  assert.match(r.getAttribute('style'), /fill: var\(--interactive-accent, #7c5cff\)/, 'the theme colour with a literal fallback');
  assert.match(r.getAttribute('style'), /pointer-events: none/);
  assert.ok(Number(r.getAttribute('fill-opacity')) > 0.1, 'visible');
  assert.equal(bar.querySelector('.note').parentNode, bar, 'the drawing is untouched');
});

test('it follows the selection: a bar that leaves loses its tint, a new one gains it, an empty selection clears every tint', () => {
  const h = host();
  paintSelectionTint(h.el, ['ph_bar_3', 'ph_bar_4']);
  paintSelectionTint(h.el, ['ph_bar_4', 'ph_bar_5']);
  assert.deepEqual(h.tinted(), ['ph_bar_4', 'ph_bar_5']);
  paintSelectionTint(h.el, []);
  assert.deepEqual(h.tinted(), []);
});

test('idempotent: painting the same selection again changes nothing in the DOM (the inspector\'s observer must not loop on it) and says how many edits it made', () => {
  const h = host();
  assert.equal(paintSelectionTint(h.el, ['ph_bar_2', 'ph_bar_3']), 2);
  const mutations: unknown[] = [];
  const obs = new h.win.MutationObserver((m: unknown[]) => mutations.push(...m));
  obs.observe(h.el, { childList: true, subtree: true, attributes: true });
  assert.equal(paintSelectionTint(h.el, ['ph_bar_2', 'ph_bar_3']), 0);
  assert.equal(h.el.querySelectorAll(`.${SELECTED_BAR_CLASS}`).length, 2, 'not two tints on one bar');
  assert.equal(obs.takeRecords().length + mutations.length, 0);
  obs.disconnect();
});

test('a redrawn SVG (new elements with the same ids) gets its tint again from the same call', () => {
  const h = host();
  paintSelectionTint(h.el, ['ph_bar_2']);
  h.el.innerHTML = '<svg><g class="measure" id="ph_bar_1"></g><g class="measure" id="ph_bar_2"></g></svg>';
  h.el.querySelectorAll('g.measure').forEach((g: any) => { g.getBBox = () => ({ x: 0, y: 0, width: 5, height: 5 }); });
  assert.deepEqual(h.tinted(), []);
  paintSelectionTint(h.el, ['ph_bar_2']);
  assert.deepEqual(h.tinted(), ['ph_bar_2']);
});

test('an id that is not on the Score, a bar that cannot be measured, or an empty box draws nothing and throws nothing', () => {
  const h = host(3, false);
  assert.doesNotThrow(() => paintSelectionTint(h.el, ['ph_bar_1', 'ph_bar_99']));
  assert.deepEqual(h.tinted(), []);
  const m = host(2);
  (m.el.querySelector('#ph_bar_1') as any).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  (m.el.querySelector('#ph_bar_2') as any).getBBox = () => { throw new Error('not rendered'); };
  assert.doesNotThrow(() => paintSelectionTint(m.el, ['ph_bar_1', 'ph_bar_2']));
  assert.deepEqual(m.tinted(), []);
});

test('the dark colour is not hard-wired: the tint reads the accent variable first', () => {
  const h = host();
  paintSelectionTint(h.el, ['ph_bar_1']);
  assert.match((h.el.querySelector(`.${SELECTED_BAR_CLASS}`) as any).getAttribute('style'), /var\(--interactive-accent/);
});
