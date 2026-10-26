// score_first M13 (drain 2026-10-26-1270, DEMO profile) — the structure strip's DOM on its own (happy-dom): the tokens of structure-strip-core become buttons and arrows in the order the golden text pins, hover / focus / click are
// told to the owner, emphasis follows a note, an empty strip is hidden, a redraw keeps nothing of the old chips.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { chipsFor } from './structure-strip-core.ts';
import { mountStructureStrip, STRIP_CHIP_ON_CLASS } from './structure-strip-dom.ts';
import type { Chip } from './structure-strip-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const MORPH = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 } as const;

function rig() {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const events: string[] = [];
  const h = mountStructureStrip(parent, { onHover: (c) => events.push(`hover ${c ? c.text : 'none'}`), onClick: (c) => events.push(`click ${c.noteId}`) });
  return { parent, h, events, buttons: () => [...h.el.querySelectorAll('button')] as any[] };
}

test('a morph strip: bar_007 → phrase_004 morph, 17 bars → bar_008, as buttons joined by arrows; accessible names say what a click opens', () => {
  const r = rig();
  r.h.set(chipsFor('phrase_004', MORPH));
  assert.deepEqual([...r.h.el.children].map((c: any) => c.textContent), ['bar_007', '→', 'phrase_004 morph, 17 bars', '→', 'bar_008']);
  assert.deepEqual(r.buttons().map((b) => b.getAttribute('aria-label')), ['Open bar_007', 'Open phrase_004', 'Open bar_008']);
  assert.equal(r.h.el.style.display, '');
});

test('hover, focus, blur and click are told to the owner with the chip', () => {
  const r = rig();
  r.h.set(chipsFor('phrase_004', MORPH));
  const [a, , b] = r.buttons();
  a.dispatchEvent(new win.MouseEvent('mouseenter')); a.dispatchEvent(new win.MouseEvent('mouseleave'));
  b.dispatchEvent(new win.Event('focus')); b.dispatchEvent(new win.Event('blur'));
  b.click();
  assert.deepEqual(r.events, ['hover bar_007', 'hover none', 'hover bar_008', 'hover none', 'click bars/bar_008']);
});

test('emphasis marks the chip of that note (and survives a redraw of the same chips); null clears; an unknown note marks nothing', () => {
  const r = rig();
  r.h.set(chipsFor('phrase_004', MORPH));
  r.h.emphasise('bars/bar_008');
  const on = () => r.buttons().filter((b) => b.classList.contains(STRIP_CHIP_ON_CLASS)).map((b) => b.dataset.note);
  assert.deepEqual(on(), ['bars/bar_008']);
  r.h.set(chipsFor('phrase_004', { ...MORPH, bars: 5 }));
  assert.deepEqual(on(), ['bars/bar_008']);
  r.h.emphasise('bars/bar_999'); assert.deepEqual(on(), []);
  r.h.emphasise(null); assert.deepEqual(on(), []);
});

test('no chips = hidden; a redraw replaces the old chips; dispose removes the strip; a bar tab\'s strip is "used by:" and the phrases', () => {
  const r = rig();
  r.h.set([]);
  assert.equal(r.h.el.style.display, 'none');
  const used: Chip[] = [{ text: 'phrase_001', noteId: 'phrases/phrase_001', kind: 'phrase' }, { text: 'phrase_003', noteId: 'phrases/phrase_003', kind: 'phrase' }];
  r.h.set(used);
  assert.deepEqual([...r.h.el.children].map((c: any) => c.textContent), ['used by:', 'phrase_001', 'phrase_003']);
  r.h.set(chipsFor('phrase_004', MORPH)); assert.equal(r.buttons().length, 3);
  r.h.dispose(); assert.equal(r.parent.querySelector('.forge-structure-strip'), null);
});

test('the strip goes before a given sibling (above the Score), else last', () => {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const score = win.document.createElement('div'); parent.appendChild(score);
  const h = mountStructureStrip(parent, { onHover() {}, onClick() {} }, score);
  assert.equal(parent.firstElementChild, h.el);
});
