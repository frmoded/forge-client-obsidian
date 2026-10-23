// score_first M8 (drain 2026-10-23-0230) — the mix's Inspector in the DOM (happy-dom, a hand-made SVG): the pin survives a redraw (moving the Weight slider), the legend, hit-only click targets, the colours
// painted on the pinned bar's noteheads, and arrows that do nothing. The generic layer's new options are ALL optional: with none given the bar's and the extend phrase's inspector is what it was.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { HITBOX_CLASS, PINNED_CLASS, attachArtifactInspector } from './artifact-inspector-core.ts';
import { createScoreInspector } from './score-inspector.ts';
import { MIX_BAR_ID, MIX_COLOURS, classifyMixHits, mixLineageOf, mixProvenance, type MixParams } from './mix-lineage-core.ts';
import { MIX_MARK_CLASS, paintMixHits } from './mix-hits-dom.ts';
import type { ProvenanceResult, RhythmDataLike } from './provenance-core.ts';

const bar = (channels: Record<string, Array<boolean | number>>): RhythmDataLike => ({ time_signature: '4/4', steps: 16, group_size: 4, channels });
const row = (at: Record<number, boolean | number>): Array<boolean | number> => Array.from({ length: 16 }, (_, i) => (i in at ? at[i] : false));
const A = bar({ kick: row({ 0: true, 2: true, 8: true }), snare: row({ 4: true }) });
const B = bar({ kick: row({ 0: true, 8: true }), snare: row({ 4: true }) });
const P = (weight: number, ghost = false): MixParams => ({ a: 'bar_005', b: 'bar_006', weight, threshold: 0.5, ghost });

function resultFor(params: MixParams): ProvenanceResult {
  const classified = classifyMixHits(A, B, params).map((h) => ({ ...h, velocity: 90 }));
  const map = mixProvenance('phrases/phrase_002', params, classified.map((h) => ({ id: `mx_${h.channel}_${h.step}`, channel: h.channel, step: h.step })), classified, 100);
  return { payload: {}, map, problems: [], kitProblems: [] };
}

function host(win: any, ids: string[]): HTMLElement {
  const h = win.document.createElement('div');
  h.innerHTML = `<svg><g class="measure" id="${MIX_BAR_ID}"><g class="staff"><path id="staffline"/></g>${ids.map((id) => `<g class="note" id="${id}"><g class="notehead"><use id="${id}-h"/></g></g>`).join('')}</g></svg>`;
  win.document.body.appendChild(h);
  return h as HTMLElement;
}

function rig(opts: { keepPin?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const slot = win.document.createElement('div'); win.document.body.appendChild(slot);
  const decorated: Array<string | null> = [];
  const insp = createScoreInspector(slot, {
    noteId: 'phrases/phrase_002', openNote: () => {}, lineage: mixLineageOf, hint: 'Click the bar or a note to see where it came from.',
    order: () => [], keepPin: opts.keepPin, enlargeTargets: { x: 0.35, y: 0.15 },
    enlargeIds: (map) => Object.keys(map).filter((id) => map[id].params.channel !== undefined),
    decorate: (root, map, pinned) => { decorated.push(pinned); paintMixHits(root, map, pinned); },
  });
  const show = (params: MixParams) => {
    const r = resultFor(params);
    const h = host(win, Object.keys(r.map).filter((k) => k !== MIX_BAR_ID));
    for (const el of h.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
    insp.onShown(h, r);
    return { h, r };
  };
  const click = (el: Element) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (el: Element, k: string) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const stack = () => [...slot.querySelectorAll('.forge-inspector-lineage > li > span')].map((s: Element) => s.textContent as string);
  return { win, slot, insp, show, click, key, stack, decorated };
}

test('clicking a notehead pins THAT hit (the nearest mapped ancestor) and shows its line over the bar stack; clicking the staff pins the bar', () => {
  const t = rig();
  const { h } = t.show(P(0.7));
  t.click(h.querySelector('#mx_kick_2-h')!);
  assert.deepEqual(t.stack().slice(0, 3), ['this hit: from bar_005 only, velocity 90', 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)', 'from bar_005 (70 %)']);
  assert.ok(h.querySelector('#mx_kick_2')!.classList.contains(PINNED_CLASS));
  t.click(h.querySelector('#staffline')!);
  assert.equal(t.stack()[0], 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)');
  assert.ok(h.querySelector(`#${MIX_BAR_ID}`)!.classList.contains(PINNED_CLASS));
});

test('with keepPin, a redraw (the Weight slider moved) keeps the pin and the stack follows the new weight', () => {
  const t = rig({ keepPin: true });
  const first = t.show(P(0.7));
  t.click(first.h.querySelector('#mx_kick_2-h')!);
  assert.match(t.stack()[1], /70 % bar_005/);
  const second = t.show(P(0.6));                              // a new SVG with the same ids, the new weight
  assert.ok(second.h.querySelector('#mx_kick_2')!.classList.contains(PINNED_CLASS), 'still pinned on the NEW engraving');
  assert.deepEqual(t.stack().slice(0, 2), ['this hit: from bar_005 only, velocity 90', 'made by phrase_002 (mix, 60 % bar_005 / 40 % bar_006, threshold 0.50)']);
});

test('keepPin: a pinned hit that is gone after the redraw falls back to the bar (still pinned, never an empty Inspector); Esc really lets go and a redraw does not bring it back', () => {
  const t = rig({ keepPin: true });
  const a = t.show(P(0.7));
  t.click(a.h.querySelector('#mx_kick_2-h')!);
  const b = t.show(P(0.4));                                    // kick 2 (bar_005 only) is below the threshold now
  assert.equal(b.h.querySelector('#mx_kick_2'), null);
  assert.ok(b.h.querySelector(`#${MIX_BAR_ID}`)!.classList.contains(PINNED_CLASS));
  assert.match(t.stack()[0], /^made by phrase_002 \(mix, 40 % bar_005/);
  t.key(b.h, 'Escape');
  assert.equal(t.stack().length, 0);
  const c = t.show(P(0.7));
  assert.equal(c.h.querySelectorAll(`.${PINNED_CLASS}`).length, 0, 'unpinned stays unpinned');
});

test('WITHOUT keepPin (the bar\'s and the extend phrase\'s inspector) a redraw forgets the pin, as it always did', () => {
  const t = rig();
  const a = t.show(P(0.7));
  t.click(a.h.querySelector('#mx_kick_2-h')!);
  const b = t.show(P(0.6));
  assert.equal(b.h.querySelectorAll(`.${PINNED_CLASS}`).length, 0);
});

test('decorate is told the pin on every change: the id when pinned, null when let go', () => {
  const t = rig();
  const { h } = t.show(P(0.7));
  t.click(h.querySelector('#mx_kick_2-h')!);
  t.key(h, 'Escape');
  assert.ok(t.decorated.includes('mx_kick_2'));
  assert.equal(t.decorated.at(-1), null);
});

test('the legend line is in the stack with inline-coloured marks (a theme cannot recolour what the style attribute sets)', () => {
  const t = rig();
  const { h } = t.show(P(0.7, true));
  t.click(h.querySelector('#staffline')!);
  const legend = t.slot.querySelector('.forge-inspector-legend')!;
  assert.ok(legend);
  const marks = [...legend.querySelectorAll('.forge-inspector-legend-mark')] as HTMLElement[];
  assert.deepEqual(marks.map((m) => m.textContent), ['▲', '■', '●', '△']);
  assert.match(marks[0].getAttribute('style') ?? '', new RegExp(MIX_COLOURS.a.replace('#', '#?'), 'i'));
  assert.match(legend.textContent ?? '', /only bar_005.*only bar_006.*both bars.*hollow = a ghost hit/);
});

test('arrow keys on a mix do nothing and do not throw (it has one bar); Esc still works', () => {
  const t = rig();
  const { h } = t.show(P(0.7));
  assert.doesNotThrow(() => { t.key(h, 'ArrowRight'); t.key(h, 'ArrowLeft'); t.key(h, 'ArrowDown'); });
  assert.equal(h.querySelectorAll(`.${PINNED_CLASS}`).length, 0);
});

test('click targets are enlarged for the HITS only: a hit rectangle over the whole measure would swallow every notehead click', () => {
  const t = rig();
  const { h } = t.show(P(0.7));
  assert.ok(h.querySelectorAll(`.${HITBOX_CLASS}`).length > 0, 'the hits have targets');
  assert.equal(h.querySelector(`#${MIX_BAR_ID} > .${HITBOX_CLASS}`), null, 'the bar has none');
  // and the generic layer without enlargeIds still enlarges every mapped element (what the bar inspector does)
  const win: any = new Window({ url: 'http://localhost/' });
  const hh = host(win, ['mx_kick_0']); for (const el of hh.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  attachArtifactInspector({ root: hh, map: resultFor(P(0.7)).map, enlargeTargets: { x: 0.35, y: 0.15 }, onHover: () => {}, onPin: () => {} });
  assert.ok(hh.querySelector(`#${MIX_BAR_ID} > .${HITBOX_CLASS}`), 'default: every mapped element');
});

// ---- the painter -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('paintMixHits: while something is pinned, noteheads are filled by parent (a only, b only, both) with inline style; unpinning clears everything', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const r = resultFor(P(0.7));
  const h = host(win, Object.keys(r.map).filter((k) => k !== MIX_BAR_ID));
  paintMixHits(h, r.map, 'mx_kick_2');
  const fill = (id: string) => (h.querySelector(`#${id} .notehead`) as HTMLElement).style.fill;
  assert.equal(fill('mx_kick_2'), MIX_COLOURS.a);
  assert.equal(fill('mx_kick_0'), MIX_COLOURS.both);
  assert.notEqual(MIX_COLOURS.a, MIX_COLOURS.both);
  paintMixHits(h, r.map, null);
  assert.equal(fill('mx_kick_2'), '');
  assert.equal(h.querySelectorAll(`.${MIX_MARK_CLASS}`).length, 0);
});

test('paintMixHits: b-only is its own colour; a ghost keeps its parent\'s colour but is drawn lighter; painting twice does not pile up marks', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const a = bar({ kick: row({}) }), b = bar({ kick: row({ 5: true, 6: true }) });
  const params: MixParams = { a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost: true };
  const hits = classifyMixHits(a, b, params).map((x) => ({ ...x, velocity: x.kind.startsWith('ghost') ? 36 : 90 }));
  const map = mixProvenance('phrases/phrase_002', params, hits.map((x) => ({ id: `mx_${x.channel}_${x.step}`, channel: x.channel, step: x.step })), hits, null);
  const h = host(win, ['mx_kick_5', 'mx_kick_6']);
  for (const el of h.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  paintMixHits(h, map, MIX_BAR_ID); paintMixHits(h, map, MIX_BAR_ID);
  assert.equal((h.querySelector('#mx_kick_5 .notehead') as HTMLElement).style.fill, MIX_COLOURS.b);
  assert.equal(h.querySelectorAll(`#mx_kick_5 .${MIX_MARK_CLASS}`).length, 1, 'one mark per hit, however often it is painted');
});

test('paintMixHits: letting go restores the markup EXACTLY — no empty style="" left on a notehead (found in real Chrome: that leftover alone shifted 89 anti-aliased pixels of the engraving)', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const r = resultFor(P(0.7));
  const h = host(win, Object.keys(r.map).filter((k) => k !== MIX_BAR_ID));
  for (const el of h.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  const before = h.innerHTML;
  paintMixHits(h, r.map, 'mx_kick_2');
  assert.notEqual(h.innerHTML, before, 'painting changes the markup');
  paintMixHits(h, r.map, null);
  assert.equal(h.innerHTML, before);
  paintMixHits(h, r.map, MIX_BAR_ID); paintMixHits(h, r.map, null);                      // and again, from a pin on the bar
  assert.equal(h.innerHTML, before);
});

test('paintMixHits: a notehead that already had its own inline style keeps it when the cue is cleared', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const r = resultFor(P(0.7));
  const h = host(win, Object.keys(r.map).filter((k) => k !== MIX_BAR_ID));
  const head = h.querySelector('#mx_kick_2 .notehead') as HTMLElement;
  head.setAttribute('style', 'stroke-width: 2px;');
  paintMixHits(h, r.map, 'mx_kick_2');
  paintMixHits(h, r.map, null);
  assert.equal(head.getAttribute('style'), 'stroke-width: 2px;');
});

test('paintMixHits: a ghost hit is drawn lighter (opacity) and its mark is hollow (no fill), while a real hit keeps full opacity and a filled mark', () => {
  const win: any = new Window({ url: 'http://localhost/' });
  const a = bar({ kick: row({ 1: true, 2: true }) }), b = bar({ kick: row({ 2: true }) });
  const params: MixParams = { a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost: true };   // kick 1: a only, v 0.4 -> ghost; kick 2: both -> placed
  const hits = classifyMixHits(a, b, params).map((x) => ({ ...x, velocity: x.kind.startsWith('ghost') ? 36 : 90 }));
  const map = mixProvenance('phrases/phrase_002', params, hits.map((x) => ({ id: `mx_${x.channel}_${x.step}`, channel: x.channel, step: x.step })), hits, null);
  const h = host(win, ['mx_kick_1', 'mx_kick_2']);
  for (const el of h.querySelectorAll('*')) (el as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  paintMixHits(h, map, MIX_BAR_ID);
  assert.equal((h.querySelector('#mx_kick_1 .notehead') as HTMLElement).style.opacity, '0.6');
  assert.equal((h.querySelector('#mx_kick_2 .notehead') as HTMLElement).style.opacity, '');
  assert.equal(h.querySelector(`#mx_kick_1 .${MIX_MARK_CLASS}`)!.getAttribute('fill'), 'none', 'a ghost mark is hollow');
  assert.equal(h.querySelector(`#mx_kick_2 .${MIX_MARK_CLASS}`)!.getAttribute('fill'), MIX_COLOURS.both, 'a real hit\'s mark is filled');
  paintMixHits(h, map, null);
  assert.equal((h.querySelector('#mx_kick_1 .notehead') as HTMLElement).style.opacity, '', 'letting go clears the opacity');
});
