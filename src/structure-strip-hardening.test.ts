// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over structure-strip-core.ts and structure-strip-dom.ts. What the person sees of the strip is its attributes, classes and the
// inline emphasis (this plugin has no stylesheet rule for it), so they are pinned as the browser would read them, not just the text.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import type { PhraseParams } from './phrase-core.ts';
import { barParent, barsContributedBy, chipsFor, type Chip } from './structure-strip-core.ts';
import { mountStructureStrip, STRIP_CHIP_CLASS, STRIP_CHIP_ON_CLASS, STRIP_CLASS } from './structure-strip-dom.ts';

const win: any = new Window({ url: 'http://localhost/' });

// ---- the rule: which note made bar n ----------------------------------------------------------------------------------------------------------------------------------------------------

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: 0, overrides: { '2': 'bars/bar_009' } };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 5, order: 'musical', seed: 0, overrides: { '4': 'bars/bar_012' } };
const MIX = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false } as PhraseParams;

test('barParent: a fork wins in an extend AND in a morph; otherwise the source, a before the middle, b after it; a mix is its heavier side', () => {
  assert.equal(barParent(EXTEND, 2), 'bar_009');
  assert.equal(barParent(EXTEND, 3), 'bar_005');
  assert.equal(barParent(MORPH, 4), 'bar_012');
  assert.equal(barParent(MORPH, 3), 'bar_007');
  assert.equal(barParent(MORPH, 5), 'bar_008');
  assert.equal(barParent(MIX, 1), 'bar_005');
  assert.equal(barParent({ ...MIX, weight: 0.2 } as PhraseParams, 1), 'bar_006');
  assert.equal(barParent({ ...MIX, weight: 0.5 } as PhraseParams, 1), 'bar_005', 'a tie is a');
  assert.equal(barParent({ ...MIX, overrides: { '1': 'bars/bar_099' } } as unknown as PhraseParams, 1), 'bar_005', 'a mix has no forks');
});

test('barsContributedBy: the phrase\'s own name is every bar only when a phrase name is given AND it is the note asked about', () => {
  assert.deepEqual(barsContributedBy(EXTEND, 'phrase_001', 'phrase_001'), [1, 2, 3, 4]);
  assert.deepEqual(barsContributedBy(EXTEND, 'bar_007', 'phrase_001'), [], 'another note, with a phrase name given: its own bars only (none)');
  assert.deepEqual(barsContributedBy(EXTEND, 'phrase_001'), [], 'no phrase name given: the name is just a note that took no part');
  assert.deepEqual(barsContributedBy(EXTEND, 'bar_005', 'phrase_001'), [1, 3, 4]);
  assert.deepEqual(barsContributedBy(EXTEND, 'bar_009'), [2]);
  assert.deepEqual(barsContributedBy(MIX, 'bar_005'), [1]);
});

test('chipsFor: the fork chips of an extend and of a morph, in bar order, after the rest', () => {
  const texts = (c: Chip[]) => c.map((x) => `${x.kind}:${x.text}>${x.noteId}`);
  assert.deepEqual(texts(chipsFor('phrase_001', EXTEND)), ['bar:bar_005>bars/bar_005', 'phrase:phrase_001 extend 4 bars>phrases/phrase_001', 'fork:bar_009 fork of bar 2>bars/bar_009']);
  assert.deepEqual(texts(chipsFor('phrase_002', MORPH)), ['bar:bar_007>bars/bar_007', 'phrase:phrase_002 morph, 5 bars>phrases/phrase_002', 'bar:bar_008>bars/bar_008', 'fork:bar_012 fork of bar 4>bars/bar_012']);
  assert.deepEqual(texts(chipsFor('phrase_003', MIX)), ['bar:bar_005>bars/bar_005', 'bar:bar_006>bars/bar_006', 'phrase:phrase_003 mix, vote>phrases/phrase_003']);
});

// ---- the DOM -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function parentWith(n = 2) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const kids = Array.from({ length: n }, (_, i) => { const k = win.document.createElement('p'); k.id = `k${i}`; parent.appendChild(k); return k; });
  return { parent, kids };
}
const ports = () => { const events: string[] = []; return { events, p: { onHover: (c: Chip | null) => events.push(`hover ${c ? c.noteId : 'none'}`), onClick: (c: Chip) => events.push(`click ${c.noteId}`) } }; };

test('the strip is a hidden navigation landmark named Structure, with the class the stylesheet and the tests find it by', () => {
  const { parent } = parentWith(0);
  const h = mountStructureStrip(parent, ports().p);
  assert.equal(STRIP_CLASS, 'forge-structure-strip');
  assert.equal(h.el.className, 'forge-structure-strip');
  assert.equal(h.el.getAttribute('role'), 'navigation');
  assert.equal(h.el.getAttribute('aria-label'), 'Structure');
  assert.equal(h.el.style.display, 'none', 'hidden until it has chips');
  assert.equal(h.el.parentNode, parent);
});

test('it goes before the node it is given when that node is a child of the parent, and at the end otherwise (no node, or a node of another parent)', () => {
  const a = parentWith(2);
  const first = mountStructureStrip(a.parent, ports().p, a.kids[1]);
  assert.deepEqual([...a.parent.children].map((c: any) => c.id || c.className), ['k0', STRIP_CLASS, 'k1'], 'before k1');
  const b = parentWith(2);
  mountStructureStrip(b.parent, ports().p);
  assert.deepEqual([...b.parent.children].map((c: any) => c.id || c.className), ['k0', 'k1', STRIP_CLASS], 'no node: at the end');
  const c = parentWith(1); const other = parentWith(1);
  mountStructureStrip(c.parent, ports().p, other.kids[0]);
  assert.deepEqual([...c.parent.children].map((x: any) => x.id || x.className), ['k0', STRIP_CLASS], 'a node of another parent: at the end, and that node is not moved');
  assert.equal(other.kids[0].parentNode, other.parent);
  first.dispose();
  assert.deepEqual([...a.parent.children].map((x: any) => x.id), ['k0', 'k1'], 'dispose takes the strip out');
});

test('what set() draws: buttons typed "button" with class, text, data-note and an "Open <name>" label; arrows and the "used by:" label as spans with their own class, glyph and aria-hidden; the strip shows only with tokens', () => {
  const { parent } = parentWith(0);
  const h = mountStructureStrip(parent, ports().p);
  h.set(chipsFor('phrase_002', MORPH));
  const kids = [...h.el.children] as any[];
  assert.deepEqual(kids.map((k) => k.tagName.toLowerCase()), ['button', 'span', 'button', 'span', 'button', 'button']);
  const btn = kids[0];
  assert.equal(btn.type, 'button');
  assert.equal(btn.className, `${STRIP_CHIP_CLASS} ${STRIP_CHIP_CLASS}-bar`);
  assert.equal(btn.textContent, 'bar_007');
  assert.equal(btn.dataset.note, 'bars/bar_007');
  assert.equal(btn.getAttribute('aria-label'), 'Open bar_007');
  assert.equal(kids[2].className, `${STRIP_CHIP_CLASS} ${STRIP_CHIP_CLASS}-phrase`);
  assert.equal(kids[5].className, `${STRIP_CHIP_CLASS} ${STRIP_CHIP_CLASS}-fork`);
  const arrow = kids[1];
  assert.equal(arrow.className, 'forge-structure-arrow');
  assert.equal(arrow.textContent, '→');
  assert.equal(arrow.getAttribute('aria-hidden'), 'true');
  assert.equal(h.el.style.display, '');
  h.set([{ text: 'phrase_001', noteId: 'phrases/phrase_001', kind: 'phrase' }]);
  const used = [...h.el.children] as any[];
  assert.deepEqual(used.map((k) => k.textContent), ['used by:', 'phrase_001']);
  assert.equal(used[0].className, 'forge-structure-label');
  assert.equal(used[0].getAttribute('aria-hidden'), 'false');
  assert.equal(used[0].tagName.toLowerCase(), 'span');
  h.set([]);
  assert.equal(h.el.children.length, 0);
  assert.equal(h.el.style.display, 'none');
  h.set(chipsFor('phrase_002', MORPH));
  assert.equal(h.el.style.display, '', 'shown again with chips');
});

test('emphasis is inline: bold and an accent outline on the chip of that note, every property back to empty when it moves or clears', () => {
  const { parent } = parentWith(0);
  const h = mountStructureStrip(parent, ports().p);
  h.set(chipsFor('phrase_002', MORPH));
  const chips = () => [...h.el.querySelectorAll('button')] as any[];
  // happy-dom drops a `var()` value from a style property, so the chips get plain recording style objects: what the code WRITES is what is read back
  for (const b of chips()) Object.defineProperty(b, 'style', { value: { fontWeight: '', outlineWidth: '', outlineStyle: '', outlineColor: '', outlineOffset: '' }, configurable: true });
  const style = (b: any) => [b.style.fontWeight, b.style.outlineWidth, b.style.outlineStyle, b.style.outlineColor, b.style.outlineOffset];
  assert.deepEqual(style(chips()[0]), ['', '', '', '', ''], 'nothing emphasised yet');
  h.emphasise('bars/bar_008');
  assert.deepEqual(style(chips()[1]), ['', '', '', '', '']);
  assert.deepEqual(style(chips()[2]), ['700', '2px', 'solid', 'var(--interactive-accent, #7c3aed)', '1px']);
  assert.ok(chips()[2].classList.contains(STRIP_CHIP_ON_CLASS));
  h.emphasise('bars/bar_007');
  assert.deepEqual(style(chips()[2]), ['', '', '', '', ''], 'the old one is cleared, property by property');
  assert.ok(!chips()[2].classList.contains(STRIP_CHIP_ON_CLASS));
  assert.deepEqual(style(chips()[0]), ['700', '2px', 'solid', 'var(--interactive-accent, #7c3aed)', '1px']);
  h.emphasise(null);
  assert.deepEqual(style(chips()[0]), ['', '', '', '', '']);
});

test('hover, focus, blur and click on a chip reach the owner with that chip', () => {
  const { parent } = parentWith(0);
  const p = ports();
  const h = mountStructureStrip(parent, p.p);
  h.set(chipsFor('phrase_002', MORPH));
  const b = (h.el.querySelectorAll('button')[0]) as any;
  b.dispatchEvent(new win.MouseEvent('mouseenter')); b.dispatchEvent(new win.MouseEvent('mouseleave'));
  b.dispatchEvent(new win.Event('focus')); b.dispatchEvent(new win.Event('blur'));
  b.click();
  assert.deepEqual(p.events, ['hover bars/bar_007', 'hover none', 'hover bars/bar_007', 'hover none', 'click bars/bar_007']);
});
