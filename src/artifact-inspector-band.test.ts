// drain 2026-10-22-2300 — "in the real Obsidian no bar of a phrase's Score visibly lights, pinned or hovered". The class-based recolour (CSS on `forge-artifact-hot` / `-pinned`) depends on the stylesheet
// being installed and winning over Verovio's own presentation attributes and the theme; the headless proof asserted class NAMES, never a rendered colour. The band is a cue that does not depend on any of
// that: a translucent rectangle INSIDE the element, behind its content, painted with inline style (and a literal fallback colour), plus dimming of the other elements while one is pinned.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { BAND_CLASS, attachArtifactInspector } from './artifact-inspector-core.ts';

const MAP = Object.fromEntries([1, 2, 3, 4].map((n) => [`ph_bar_${n}`, { noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: n } }]));

function rig(band: boolean) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const root = doc.createElement('div'); doc.body.appendChild(root);
  root.innerHTML = '<svg>' + [1, 2, 3, 4].map((n) => `<g class="measure" id="ph_bar_${n}"><path d="M0 0"/></g>`).join('') + '</svg>';
  const bars = [1, 2, 3, 4].map((n) => root.querySelector(`#ph_bar_${n}`) as any);
  bars.forEach((g, i) => { g.getBBox = () => ({ x: 100 * i, y: 10, width: 90, height: 60 }); });     // a drawn measure has a box; happy-dom has no layout
  const layer = attachArtifactInspector({ root, map: MAP, onHover: () => {}, onPin: () => {}, band });
  const band_ = (g: any) => g.querySelector(`.${BAND_CLASS}`);
  return { win, root, bars, layer, band: band_ };
}

test('PINNED: the bar gets a band — the FIRST child (behind its content), never hit-testable, with an inline colour that has a literal fallback; the other bars are dimmed', () => {
  const r = rig(true);
  r.layer.pin('ph_bar_3');
  const b = r.band(r.bars[2]);
  assert.ok(b, 'a band rect exists in the pinned bar');
  assert.equal(r.bars[2].firstElementChild, b, 'behind the bar\'s own drawing');
  assert.equal(b.getAttribute('pointer-events'), 'none', 'it must never take a click or a hover from the notes');
  assert.match(b.getAttribute('style'), /fill:\s*var\(--interactive-accent,\s*#[0-9a-f]{6}\)/i);
  assert.deepEqual(['x', 'y', 'width', 'height'].map((k) => Number(b.getAttribute(k))), [200, 10, 90, 60], 'exactly the bar\'s box');
  assert.ok(Number(b.getAttribute('fill-opacity')) >= 0.25, 'strong enough to see');
  assert.deepEqual(r.bars.map((g) => g.style.opacity), ['0.45', '0.45', '', '0.45'], 'the others are dimmed, the pinned one is not');
});

test('HOVER is visibly different from PIN (lighter band, no dimming), and moves with the pointer', () => {
  const r = rig(true);
  r.layer.highlight('ph_bar_2');
  const hot = Number(r.band(r.bars[1]).getAttribute('fill-opacity'));
  assert.ok(hot > 0 && hot < 0.25, `hover band is lighter than a pin's (${hot})`);
  assert.deepEqual(r.bars.map((g) => g.style.opacity), ['', '', '', ''], 'hovering dims nothing');
  r.layer.highlight('ph_bar_4');
  assert.equal(r.band(r.bars[1]), null, 'left the old bar');
  assert.ok(r.band(r.bars[3]));
  r.layer.pin('ph_bar_4');
  const pinned = Number(r.band(r.bars[3]).getAttribute('fill-opacity'));
  assert.ok(pinned > hot, 'pinned is stronger than hot on the same bar');
  assert.equal(r.bars[3].querySelectorAll(`.${BAND_CLASS}`).length, 1, 'one band per bar, never stacked');
});

test('THE FAN: highlightAll lights every bar with the same band; clearing removes them all', () => {
  const r = rig(true);
  r.layer.highlightAll(['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4']);
  assert.equal(r.root.querySelectorAll(`.${BAND_CLASS}`).length, 4);
  r.layer.highlightAll([]);
  assert.equal(r.root.querySelectorAll(`.${BAND_CLASS}`).length, 0);
});

test('Esc / unpin clears the band and the dimming; dispose leaves nothing behind', () => {
  const r = rig(true);
  r.layer.pin('ph_bar_2');
  r.layer.pin(null);
  assert.equal(r.root.querySelectorAll(`.${BAND_CLASS}`).length, 0);
  assert.deepEqual(r.bars.map((g) => g.style.opacity), ['', '', '', '']);
  r.layer.pin('ph_bar_2'); r.layer.highlight('ph_bar_1');
  r.layer.dispose();
  assert.equal(r.root.querySelectorAll(`.${BAND_CLASS}`).length, 0);
  assert.deepEqual(r.bars.map((g) => g.style.opacity), ['', '', '', '']);
});

test('a SWAPPED SVG (the Kit / multi-staff toggle replaces the content) re-applies the band to the new elements with the same ids', async () => {
  const r = rig(true);
  r.layer.pin('ph_bar_3');
  r.root.innerHTML = '<svg>' + [1, 2, 3, 4].map((n) => `<g class="measure" id="ph_bar_${n}"><path d="M0 0"/></g>`).join('') + '</svg>';
  const fresh = [1, 2, 3, 4].map((n) => r.root.querySelector(`#ph_bar_${n}`) as any);
  fresh.forEach((g, i) => { g.getBBox = () => ({ x: 100 * i, y: 10, width: 90, height: 60 }); });
  await new Promise((res) => setTimeout(res, 20));              // the MutationObserver
  assert.ok(fresh[2].querySelector(`.${BAND_CLASS}`), 'the new bar 3 has its band');
  assert.equal(fresh[0].style.opacity, '0.45');
});

test('an element that cannot be measured (no layout yet) gets no band and no error — the class recolour still applies', () => {
  const r = rig(true);
  r.bars[1].getBBox = () => { throw new Error('not rendered'); };
  r.layer.pin('ph_bar_2');
  assert.equal(r.band(r.bars[1]), null);
  assert.ok(r.bars[1].classList.contains('forge-artifact-pinned'));
});

test('P3: WITHOUT the option (the bar\'s Beat Box tab, notes) nothing is inserted and nothing is dimmed — byte-identical to before', () => {
  const r = rig(false);
  const before = r.root.innerHTML;
  r.layer.highlight('ph_bar_1'); r.layer.pin('ph_bar_2');
  assert.equal(r.root.querySelectorAll(`.${BAND_CLASS}`).length, 0);
  assert.deepEqual(r.bars.map((g) => g.style.opacity), ['', '', '', '']);
  r.layer.pin(null); r.layer.highlight(null);
  assert.equal(r.root.innerHTML.replace(/ class="[^"]*forge-artifact-[a-z]+[^"]*"/g, ' class="measure"'), before.replace(/ tabindex="0"/g, ''), 'the DOM is what it was once the classes are gone');
});

test('hovering ANOTHER bar while one is pinned: the hovered bar is not dimmed and gets the lighter band; the pinned one keeps the strong band', () => {
  const r = rig(true);
  r.layer.pin('ph_bar_1');
  r.layer.highlight('ph_bar_3');
  assert.equal(r.bars[2].style.opacity, '', 'the hovered bar is at full strength');
  assert.equal(r.bars[1].style.opacity, '0.45');
  assert.ok(r.band(r.bars[2]) && r.band(r.bars[0]));
  assert.ok(Number(r.band(r.bars[0]).getAttribute('fill-opacity')) > Number(r.band(r.bars[2]).getAttribute('fill-opacity')));
});
