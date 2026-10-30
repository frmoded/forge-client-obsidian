// score_first M13 (drain 2026-10-26-1270, DEMO profile) — the structure strip's DOM on its own (happy-dom): the tokens of structure-strip-core become buttons and arrows in the order the golden text pins, hover / focus / click are
// told to the owner, emphasis follows a note, an empty strip is hidden, a redraw keeps nothing of the old chips.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { arrangementChips, chipsFor, usedByChips } from './structure-strip-core.ts';
import { mountStructureStrip, STRIP_CHIP_ON_CLASS, STRIP_ROW_CLASS } from './structure-strip-dom.ts';
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

test('S5: the emphasised chip is VISIBLY different (bold + accent outline, inline), and only that one; clearing removes it', () => {
  const r = rig();
  r.h.set(chipsFor('phrase_004', MORPH));
  r.h.emphasise('bars/bar_008');
  const styled = () => r.buttons().filter((b) => b.style.fontWeight === '700' && b.style.outlineStyle === 'solid' && b.style.outlineWidth === '2px').map((b) => b.dataset.note);
  assert.deepEqual(styled(), ['bars/bar_008']);
  r.h.set(chipsFor('phrase_004', { ...MORPH, bars: 5 }));
  assert.deepEqual(styled(), ['bars/bar_008'], 'survives a redraw');
  r.h.emphasise(null);
  assert.deepEqual(styled(), []);
  assert.ok(r.buttons().every((b) => b.style.fontWeight === '' && b.style.outlineStyle === '' && b.style.outlineWidth === ''), 'nothing left behind');
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


// ---- 2026-10-30-1000 (M10 slice 3): rows, and emphasis of several notes -----------------------------------------------------------------------------------------------------------------

const TWO_KITS = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }, { kit: 'brush', phrase: 'phrase_003' }] } as const;

test('chips that carry a row are drawn one block per row, in the order of the chips, each button still a chip (hover, focus and click as ever)', () => {
  const r = rig();
  r.h.set(arrangementChips(TWO_KITS as any));
  const rows = [...r.h.el.children] as any[];
  assert.deepEqual(rows.map((c) => c.className), [STRIP_ROW_CLASS, STRIP_ROW_CLASS, STRIP_ROW_CLASS]);
  assert.deepEqual(rows.map((row) => [...row.children].map((c: any) => c.textContent)), [['phrase_003', 'rock kit'], ['phrase_009', 'latin kit'], ['brush kit']], 'phrase_003 is one chip, in the first row that plays it');
  r.buttons()[3].dispatchEvent(new win.Event('mouseenter')); r.buttons()[3].click();
  assert.deepEqual(r.events, ['hover latin kit', 'click kits/latin']);
});

test('P3 through the everywhere consumers: a phrase tab\'s strip and a bar tab\'s "used by" strip are drawn exactly as before - no row block, the chips (and arrows and label) are the strip\'s own children', () => {
  const phrase = rig();
  phrase.h.set(chipsFor('phrase_004', MORPH));
  assert.equal(phrase.h.el.querySelector(`.${STRIP_ROW_CLASS}`), null);
  assert.deepEqual([...phrase.h.el.children].map((c: any) => c.tagName + ':' + c.textContent), ['BUTTON:bar_007', 'SPAN:→', 'BUTTON:phrase_004 morph, 17 bars', 'SPAN:→', 'BUTTON:bar_008']);
  const bar = rig();
  bar.h.set(usedByChips('bar_007', { 'phrases/phrase_001.md': { 'bars/bar_007.md': 1 }, 'phrases/phrase_003.md': { 'bars/bar_007.md': 2 } }));
  assert.equal(bar.h.el.querySelector(`.${STRIP_ROW_CLASS}`), null);
  assert.deepEqual([...bar.h.el.children].map((c: any) => c.tagName + ':' + c.textContent), ['SPAN:used by:', 'BUTTON:phrase_001', 'BUTTON:phrase_003']);
});

test('an arrangement of one kit stays one flat row of chips (no block to wrap a single row)', () => {
  const r = rig();
  r.h.set(arrangementChips({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }));
  assert.equal(r.h.el.querySelector(`.${STRIP_ROW_CLASS}`), null);
  assert.deepEqual([...r.h.el.children].map((c: any) => c.textContent), ['phrase_003', 'rock kit']);
});

test('emphasise takes one note (as ever), a list of notes (every chip of those notes), or null; a redraw keeps the emphasis of the notes it still draws', () => {
  const r = rig();
  r.h.set(arrangementChips(TWO_KITS as any));
  const on = () => r.buttons().filter((b) => b.classList.contains(STRIP_CHIP_ON_CLASS)).map((b) => b.dataset.note);
  r.h.emphasise('kits/rock'); assert.deepEqual(on(), ['kits/rock']);
  r.h.emphasise(['phrases/phrase_009', 'kits/latin']); assert.deepEqual(on(), ['phrases/phrase_009', 'kits/latin'], 'the phrase and the kit a pinned row came from');
  assert.equal(r.buttons().find((b) => b.dataset.note === 'kits/latin').style.fontWeight, '700');
  r.h.emphasise([]); assert.deepEqual(on(), []);
  r.h.emphasise(['kits/brush']); r.h.emphasise(null); assert.deepEqual(on(), []);
  r.h.emphasise(['kits/brush']); r.h.set(arrangementChips(TWO_KITS as any)); assert.deepEqual(on(), ['kits/brush']);
});
