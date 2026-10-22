// score_first M3 (drain 2026-10-21-1230) — the interaction layer (generic) and the panel (score-specific), in happy-dom with a hand-made SVG: hover, click-pin, Esc, arrows,
// the grid -> note direction without an echo, the lineage with "Open note", the notes list, the quiet Kit line, and that a score that could not be mapped says so.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { HITBOX_CLASS, HOT_CLASS, PINNED_CLASS, attachArtifactInspector, lineageOf, notesInMap, orderByStepThenChannel } from './artifact-inspector-core.ts';
import { INSPECTOR_HINT, createScoreInspector } from './score-inspector.ts';
import { CANONICAL_CHANNELS, type ProvenanceMap, type ProvenanceResult } from './provenance-core.ts';

const prov = (channel: string, step: number, extra: Record<string, unknown> = {}) => ({ noteId: 'bars/bar_001', role: 'hit', params: { channel, step, beat: `beat ${Math.floor(step / 4) + 1}`, ...extra } });
const MAP: ProvenanceMap = {
  a_kick_0: prov('kick', 0), a_kick_0_t1: prov('kick', 0, { tiedFrom: 'a_kick_0' }), a_snare_4: prov('snare', 4), a_kick_8: prov('kick', 8, { velocity: 90 }), a_snare_12: prov('snare', 12),
};

function dom(ids = Object.keys(MAP)) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const host = doc.createElement('div');
  host.innerHTML = `<svg><g class="note" id="decoy"><path/></g>${ids.map((id) => `<g class="note" id="${id}"><path id="${id}-p"/></g>`).join('')}</svg>`;
  doc.body.appendChild(host);
  const fire = (el: Element, type: string, extra: object = {}) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, ...extra }));
  const key = (el: Element, k: string) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { win, doc, host: host as HTMLElement, el: (id: string) => doc.getElementById(id)!, fire, key };
}
const hot = (d: ReturnType<typeof dom>) => [...d.doc.querySelectorAll(`.${HOT_CLASS}`)].map((e: Element) => e.id).sort();

test('hover lights the mapped note and tells the host; leaving clears; a child path counts as its note; an unmapped element is ignored', () => {
  const d = dom(); const told: any[] = [];
  attachArtifactInspector({ root: d.host, map: MAP, onHover: (e) => told.push(e?.id ?? null), onPin: () => {} });
  d.fire(d.el('a_snare_4-p'), 'mouseover');
  assert.deepEqual(hot(d), ['a_snare_4']);
  d.fire(d.el('a_snare_4'), 'mouseout', { relatedTarget: d.el('decoy') });
  assert.deepEqual(hot(d), []);
  d.fire(d.el('decoy'), 'mouseover');
  assert.deepEqual(hot(d), [], 'no map entry: nothing lights');
  assert.deepEqual(told, ['a_snare_4', null]);
});

test('click pins (class + callback), a click on empty space or Esc unpins; the pinned note stays pinned while hover moves', () => {
  const d = dom(); const pins: any[] = [];
  const layer = attachArtifactInspector({ root: d.host, map: MAP, onHover: () => {}, onPin: (e) => pins.push(e?.id ?? null) });
  d.fire(d.el('a_kick_8'), 'click');
  assert.equal(layer.pinnedId(), 'a_kick_8');
  assert.ok(d.el('a_kick_8').classList.contains(PINNED_CLASS));
  d.fire(d.el('a_snare_4'), 'mouseover');
  assert.ok(d.el('a_kick_8').classList.contains(PINNED_CLASS), 'hovering another note does not unpin');
  d.key(d.host, 'Escape');
  assert.equal(layer.pinnedId(), null);
  assert.ok(!d.el('a_kick_8').classList.contains(PINNED_CLASS));
  d.fire(d.el('a_snare_12'), 'click');
  d.fire(d.el('decoy'), 'click');
  assert.deepEqual(pins, ['a_kick_8', null, 'a_snare_12', null]);
});

test('arrows walk the notes in step order (a tied tail is not a stop), wrap around, pin as they go; the root is focusable', () => {
  const d = dom(); const layer = attachArtifactInspector({ root: d.host, map: MAP, order: orderByStepThenChannel(MAP, CANONICAL_CHANNELS), onHover: () => {}, onPin: () => {} });
  assert.equal(d.host.getAttribute('tabindex'), '0');
  const seen: Array<string | null> = [];
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) { d.key(d.host, k); seen.push(layer.pinnedId()); }
  assert.deepEqual(seen, ['a_kick_0', 'a_snare_4', 'a_kick_8', 'a_snare_12', 'a_kick_0', 'a_snare_12']);
  assert.deepEqual(orderByStepThenChannel(MAP, CANONICAL_CHANNELS), ['a_kick_0', 'a_snare_4', 'a_kick_8', 'a_snare_12']);
});

test('highlight() from outside lights without echoing onHover; unknown ids and null clear; dispose removes classes and listeners', () => {
  const d = dom(); const told: any[] = [];
  const layer = attachArtifactInspector({ root: d.host, map: MAP, onHover: (e) => told.push(e), onPin: () => {} });
  layer.highlight('a_kick_0'); assert.deepEqual(hot(d), ['a_kick_0']);
  layer.highlightAll(['a_kick_0', 'a_kick_0_t1', 'nope']); assert.deepEqual(hot(d), ['a_kick_0', 'a_kick_0_t1']);
  layer.highlight('nope'); assert.deepEqual(hot(d), []);
  layer.highlight('a_kick_8'); layer.pin('a_snare_4');
  layer.dispose();
  assert.deepEqual(hot(d), []); assert.equal(d.doc.querySelectorAll(`.${PINNED_CLASS}`).length, 0);
  d.fire(d.el('a_kick_0'), 'mouseover'); assert.deepEqual(hot(d), [], 'listeners are gone');
  assert.deepEqual(told, [], 'no echo');
});

test('enlarged targets: each mapped note gets an invisible rect (bounding box + padding) INSIDE it, events on the rect map to the note, and dispose removes them', () => {
  const d = dom(); const told: any[] = [];
  for (const id of Object.keys(MAP)) (d.el(id) as any).getBBox = () => ({ x: 10, y: 20, width: 10, height: 30 });
  const layer = attachArtifactInspector({ root: d.host, map: MAP, enlargeTargets: { x: 0.5, y: 0.1 }, onHover: (e) => told.push(e?.id), onPin: () => {} });
  const rects = [...d.host.querySelectorAll(`.${HITBOX_CLASS}`)];
  assert.equal(rects.length, Object.keys(MAP).length);
  const r = d.el('a_snare_4').querySelector(`.${HITBOX_CLASS}`)!;
  assert.deepEqual(['x', 'y', 'width', 'height', 'fill', 'pointer-events'].map((a) => r.getAttribute(a)), ['5', '17', '20', '36', 'transparent', 'all']);
  d.fire(r, 'mouseover'); assert.deepEqual(told, ['a_snare_4'], 'a hover on the padding is a hover on the note');
  d.fire(r, 'click'); assert.equal(layer.pinnedId(), 'a_snare_4');
  assert.equal(d.el('decoy').querySelector(`.${HITBOX_CLASS}`), null, 'only mapped notes');
  layer.dispose(); assert.equal(d.host.querySelectorAll(`.${HITBOX_CLASS}`).length, 0);
});

test('enlarged targets for an engraving that arrives LATE (the renderer is fire-and-forget): the rects appear when the notes do, once each', async () => {
  const d = dom([]);
  const layer = attachArtifactInspector({ root: d.host, map: MAP, enlargeTargets: { x: 0.5, y: 0.1 }, onHover: () => {}, onPin: () => {} });
  assert.equal(d.host.querySelectorAll(`.${HITBOX_CLASS}`).length, 0, 'nothing to enlarge yet');
  const svg = d.host.querySelector('svg')!;
  for (const id of Object.keys(MAP)) { const g = d.doc.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id', id); g.setAttribute('class', 'note'); (g as any).getBBox = () => ({ x: 0, y: 0, width: 4, height: 8 }); svg.appendChild(g); }
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(d.host.querySelectorAll(`.${HITBOX_CLASS}`).length, Object.keys(MAP).length);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(d.host.querySelectorAll(`.${HITBOX_CLASS}`).length, Object.keys(MAP).length, 'no second pass doubles them');
  layer.dispose();
});

test('the Score\'s own Kit / Multi-staff toggle REPLACES the SVG in the same host: the new elements get their targets, and a pinned or lit id is re-applied to its new element', async () => {
  const d = dom();
  const withBox = (id: string) => { const g = d.doc.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id', id); g.setAttribute('class', 'note'); (g as any).getBBox = () => ({ x: 0, y: 0, width: 4, height: 8 }); return g; };
  for (const id of Object.keys(MAP)) (d.el(id) as any).getBBox = () => ({ x: 0, y: 0, width: 4, height: 8 });
  const layer = attachArtifactInspector({ root: d.host, map: MAP, enlargeTargets: { x: 0.5, y: 0.1 }, onHover: () => {}, onPin: () => {} });
  layer.pin('a_snare_4'); layer.highlight('a_kick_0');
  const svg = d.host.querySelector('svg')!; svg.textContent = '';
  for (const id of Object.keys(MAP)) svg.appendChild(withBox(id));                                      // the toggle: same ids, brand-new elements
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(d.host.querySelectorAll(`.${HITBOX_CLASS}`).length, Object.keys(MAP).length, 'every new element has its enlarged target');
  assert.ok(d.el('a_snare_4').classList.contains(PINNED_CLASS), 'the pin survives the swap');
  assert.ok(d.el('a_kick_0').classList.contains(HOT_CLASS), 'so does a highlight');
  layer.dispose();
});

test('lineage: the hit (with its beat and velocity), then the note; a tied tail says so; notesInMap groups ids by note', () => {
  assert.deepEqual(lineageOf(MAP.a_kick_8).map((l) => l.text), ['kick — step 9 (beat 3), velocity 90', 'bars/bar_001']);
  assert.match(lineageOf(MAP.a_kick_0_t1)[0].text, /tied continuation/);
  assert.equal(lineageOf(MAP.a_kick_0)[1].noteId, 'bars/bar_001');
  const two: ProvenanceMap = { ...MAP, z: { noteId: 'bars/bar_002', role: 'hit', params: { channel: 'kick', step: 1 } } };
  assert.deepEqual(notesInMap(two).map((n) => [n.noteId, n.ids.length]), [['bars/bar_001', 5], ['bars/bar_002', 1]]);
});

function panel(over: Partial<ProvenanceResult> = {}) {
  const d = dom(); const opened: string[] = []; const posted: any[] = [];
  const slot = d.doc.createElement('div'); d.doc.body.appendChild(slot);
  const insp = createScoreInspector(slot, { noteId: 'bars/bar_001', openNote: (n) => opened.push(n), postHighlight: (t) => posted.push(t) });
  const result: ProvenanceResult = { payload: {}, map: MAP, problems: [], kitProblems: [], ...over };
  const text = () => slot.textContent ?? '';
  return { d, slot, insp, opened, posted, result, text };
}

test('the panel: a hint until something is pinned; pinning shows the lineage; "Open note" opens that note; Esc returns to the hint', () => {
  const p = panel(); p.insp.onShown(p.d.host, p.result);
  assert.ok(p.text().includes(INSPECTOR_HINT));
  p.d.fire(p.d.el('a_snare_12'), 'click');
  assert.match(p.text(), /snare — step 13 \(beat 4\)/);
  (p.slot.querySelector('.forge-inspector-open') as HTMLButtonElement).click();
  assert.deepEqual(p.opened, ['bars/bar_001']);
  p.d.key(p.d.host, 'Escape');
  assert.ok(p.text().includes(INSPECTOR_HINT));
  assert.equal(p.slot.querySelector('.forge-inspector-open'), null);
});

test('hovering an engraved note posts the grid step to light; leaving posts null; the notes list lights every note of that file', () => {
  const p = panel(); p.insp.onShown(p.d.host, p.result);
  p.d.fire(p.d.el('a_kick_8'), 'mouseover');
  p.d.fire(p.d.el('a_kick_8'), 'mouseout', { relatedTarget: p.d.el('decoy') });
  assert.deepEqual(p.posted, [{ channel: 'kick', step: 8 }, null]);
  const li = p.slot.querySelector('.forge-inspector-note')!; assert.equal(li.textContent, 'bars/bar_001');
  p.d.fire(li, 'mouseenter');
  assert.equal(hot(p.d).length, 5, 'all five elements of the note');
  p.d.fire(li, 'mouseleave'); assert.deepEqual(hot(p.d), []);
});

test('gridHover lights the engraved note (and its tied tail), without posting back; null clears', () => {
  const p = panel(); p.insp.onShown(p.d.host, p.result);
  p.insp.gridHover({ channel: 'kick', step: 0 });
  assert.deepEqual(hot(p.d), ['a_kick_0', 'a_kick_0_t1']);
  p.insp.gridHover({ channel: 'kick', step: 3 }); assert.deepEqual(hot(p.d), [], 'no such hit: nothing lights');
  p.insp.gridHover({ channel: 'snare', step: 4 }); assert.deepEqual(hot(p.d), ['a_snare_4']);
  p.insp.gridHover(null); assert.deepEqual(hot(p.d), []);
  assert.deepEqual(p.posted, [], 'no echo');
});

test('a score that could not be mapped says why and offers nothing to click; Kit-only problems add one quiet line and leave the map working', () => {
  const bad = panel({ map: {}, problems: ['kick: the Score\'s hits [0] are not the data\'s [1]'] }); bad.insp.onShown(bad.d.host, bad.result);
  assert.match(bad.text(), /could not be mapped to its note, so it cannot be inspected \(kick/);
  bad.d.fire(bad.d.el('a_kick_0'), 'click'); assert.equal(bad.slot.querySelector('.forge-inspector-open'), null);
  const kit = panel({ kitProblems: ['x'] }); kit.insp.onShown(kit.d.host, kit.result);
  assert.match(kit.text(), /Kit view: not mapped/);
  kit.d.fire(kit.d.el('a_kick_0'), 'click'); assert.ok(kit.slot.querySelector('.forge-inspector-open'));
});

test('a new score replaces the old one (onShown again), a hidden host detaches, and dispose empties the slot: no listener or class is left on a removed host', () => {
  const p = panel(); p.insp.onShown(p.d.host, p.result);
  p.d.fire(p.d.el('a_kick_0'), 'click');
  const second = dom(); p.slot.ownerDocument.body.appendChild(second.host);
  p.insp.onShown(second.host, p.result);
  assert.equal(p.d.doc.querySelectorAll(`.${PINNED_CLASS}`).length, 0, 'the old score\'s pin was cleared when the new score arrived');
  assert.ok(p.text().includes(INSPECTOR_HINT), 'the pin of the old score is gone from the panel');
  p.insp.onHidden(second.host); p.insp.gridHover({ channel: 'kick', step: 0 });
  assert.equal(second.host.querySelectorAll(`.${HOT_CLASS}`).length, 0, 'hidden: gridHover is a no-op');
  p.insp.dispose(); assert.equal(p.slot.querySelector('.forge-inspector'), null);
});
