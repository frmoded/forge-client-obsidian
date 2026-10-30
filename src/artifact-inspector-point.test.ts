// 2026-10-24-1100 — "clicking a notehead or the staff often does not pin the bar" (CCQA smoke 2). The cause, measured in real Chrome with real pointer events: a click on an UNPAINTED part of a bar (the
// empty staff between lines, just off a small notehead, a label) has the <svg> root, not the bar, as its target; no mapped element is above it, so the click counted as "empty space" and UNPINNED. A bar's
// box is its target too, for the elements the surface names (`pointIds`): a click whose target is under no mapped element but whose POINT is inside a bar's box pins that bar. Surfaces that name none behave as before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { attachArtifactInspector, clickKind } from './artifact-inspector-core.ts';

const IDS = [1, 2, 3].map((n) => `ph_bar_${n}`);
const MAP = Object.fromEntries(IDS.map((id, i) => [id, { noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: i + 1 } }]));

/** Three side-by-side bars, 100 px wide each (box x: 0-100, 110-210, 220-320; y: 0-60). `big` is an extra, larger box that overlaps bar 2 (to prove the smallest box wins). */
function rig(opts: { pointIds?: readonly string[]; trace?: (l: string) => void; pinLabel?: (id: string) => string; big?: boolean; bigOn?: number; keepPinOnControls?: boolean; releaseOnEscapeFrom?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const root = doc.createElement('div'); doc.body.appendChild(root);
  root.innerHTML = '<svg>' + IDS.map((id) => `<g class="measure" id="${id}"><g class="staff"><path class="line" d="M0 0"/></g><g class="notehead"><use/></g></g>`).join('') + '</svg>';
  const svg = root.querySelector('svg') as any;
  const bars = IDS.map((id) => root.querySelector(`#${id}`) as any);
  const box = (l: number, t: number, r: number, b: number) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t });
  bars.forEach((g, i) => { g.getBoundingClientRect = () => box(110 * i, 0, 110 * i + 100, 60); });
  if (opts.big) bars[opts.bigOn ?? 0].getBoundingClientRect = () => box(0, 0, 400, 400);       // one bar's box is huge and covers everything, including the others (bar 1 by default)
  const pins: Array<string | null> = [];
  const pane = doc.createElement('div'); doc.body.appendChild(pane); pane.appendChild(root);   // the pane around the Score (the notebook's buttons are in it, outside root)
  const layer = attachArtifactInspector({ root, releaseOnEscapeFrom: opts.releaseOnEscapeFrom ? pane : undefined, map: MAP, onHover: () => {}, onPin: (e) => { pins.push(e ? e.id : null); }, pointIds: opts.pointIds, trace: opts.trace, pinLabel: opts.pinLabel, keepPinOnControls: opts.keepPinOnControls } as any);
  const click = (target: any, x: number, y: number) => target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  return { root, pane, svg, bars, layer, pins, click };
}

test('the cause, before the fix: with no pointIds a click on empty space inside a bar UNPINS (the old, still-default behaviour of every other surface)', () => {
  const r = rig();
  r.layer.pin('ph_bar_2');
  r.click(r.svg, 150, 30);
  assert.equal(r.layer.pinnedId(), null);
});

test('a click on the unpainted part of a bar (its target is the svg root) pins THAT bar, from nothing pinned', () => {
  const r = rig({ pointIds: IDS });
  r.click(r.svg, 150, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  r.layer.pin(null); r.click(r.svg, 5, 5);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1');
});

test('with another bar pinned, a click on the unpainted part of a bar MOVES the pin; a repeat click keeps it (no toggle, onPin fires once per change)', () => {
  const r = rig({ pointIds: IDS });
  r.layer.pin('ph_bar_1');
  r.click(r.svg, 250, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_3');
  r.click(r.svg, 250, 30); r.click(r.svg, 260, 40);
  assert.equal(r.layer.pinnedId(), 'ph_bar_3');
  assert.deepEqual(r.pins, ['ph_bar_1', 'ph_bar_3'], 'no re-pin storm, no unpin in between');
});

test('a click outside every bar (the margin, between systems) still lets go; Esc still lets go', () => {
  const r = rig({ pointIds: IDS });
  r.layer.pin('ph_bar_2');
  r.click(r.svg, 150, 200);
  assert.equal(r.layer.pinnedId(), null);
  r.click(r.svg, 150, 30);
  r.svg.dispatchEvent(new r.svg.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(r.layer.pinnedId(), null);
});

test('a click ON a drawn part still pins its own bar (the target wins over the point), even when the point is also inside another bar\'s box', () => {
  const r = rig({ pointIds: IDS, big: true });
  r.click(r.bars[1].querySelector('.line'), 150, 30);              // the point is inside bar 1's huge box too: the staff line belongs to bar 2
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
});

test('where boxes overlap, the SMALLEST box wins (the bar, not a box that swallows its neighbours), whichever bar the big box belongs to', () => {
  for (const bigOn of [0, 2]) {
    const r = rig({ pointIds: IDS, big: true, bigOn });
    r.click(r.svg, 150, 30);
    assert.equal(r.layer.pinnedId(), 'ph_bar_2', `big box on bar ${bigOn + 1}`);
  }
});

test('the drawn part\'s own bar beats the smaller box that happens to hold the point: a bar-1 element drawn over bar 2\'s box pins bar 1', () => {
  const r = rig({ pointIds: IDS, big: true });                      // bar 1's box is huge; the point (150, 30) is also inside bar 2's smaller box
  r.click(r.bars[0].querySelector('.line'), 150, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1');
});

test('only the elements the surface names are chosen by their box: a mapped note is not (a click beside it falls back to the BAR)', () => {
  const r = rig({ pointIds: ['ph_bar_2'] });
  r.click(r.svg, 5, 5);                                            // inside bar 1's box, but bar 1 is not a point target here
  assert.equal(r.layer.pinnedId(), null);
  r.click(r.svg, 150, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
});

test('evidence line: [forge-pin] click <element kind> -> bar N|none (reason), one per click, and only when the surface asked for it', () => {
  const lines: string[] = [];
  const r = rig({ pointIds: IDS, trace: (l) => lines.push(l), pinLabel: (id) => `bar ${id.slice(-1)}` });
  r.click(r.svg, 150, 30);
  r.click(r.bars[0].querySelector('.notehead use'), 50, 20);
  r.click(r.bars[2].querySelector('.line'), 250, 30);
  r.click(r.svg, 150, 200);
  assert.deepEqual(lines, [
    '[forge-pin] click empty -> bar 2 (inside the bar\'s box)',
    '[forge-pin] click notehead -> bar 1 (on the bar)',
    '[forge-pin] click staff -> bar 3 (on the bar)',
    '[forge-pin] click empty -> none (not on a bar)',
  ]);
  const quiet = rig({ pointIds: IDS });
  quiet.click(quiet.svg, 150, 30);                                  // no trace given: nothing printed, nothing thrown
});

test('clickKind names the drawn part (the nearest classed ancestor), the svg root as "empty", anything else by its tag', () => {
  const r = rig();
  assert.equal(clickKind(r.svg), 'empty');
  assert.equal(clickKind(r.bars[0].querySelector('.notehead use')), 'notehead');
  assert.equal(clickKind(r.bars[0].querySelector('.line')), 'staff');
  assert.equal(clickKind(r.bars[0]), 'measure');
  assert.equal(clickKind(null), 'none');
});

// ---- through the panel (score-inspector.ts): the phrase surfaces opt in by ROLE, everything else is unchanged ---------------------------------------------------------------------------------------
import { createScoreInspector } from './score-inspector.ts';
import fs from 'node:fs';
import path from 'node:path';

function panel(extra: object, withHit = false) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const slot = doc.createElement('div'); doc.body.appendChild(slot);
  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.innerHTML = '<svg>' + IDS.map((id) => `<g class="measure" id="${id}"><path class="line" d="M0 0"/></g>`).join('') + '</svg><svg id="empty-one"></svg>';
  IDS.forEach((id, i) => { (host.querySelector(`#${id}`) as any).getBoundingClientRect = () => ({ left: 110 * i, top: 0, right: 110 * i + 100, bottom: 60, width: 100, height: 60, x: 110 * i, y: 0 }); });
  const lines: string[] = [];
  const insp = createScoreInspector(slot, { noteId: 'phrases/phrase_001', openNote: () => {}, trace: (l) => lines.push(l), ...extra } as any);
  // a mapped NOTE (not a bar) with a small box inside bar 2: only bars are chosen by their box
  const map = withHit ? { ...MAP, a_kick_2: { noteId: 'phrases/phrase_001', role: 'mix-hit', params: { channel: 'kick', step: 2 } } } : MAP;
  if (withHit) { const g = host.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id', 'a_kick_2'); (g as any).getBoundingClientRect = () => ({ left: 140, top: 20, right: 160, bottom: 40, width: 20, height: 20, x: 140, y: 20 }); host.querySelector('svg')!.appendChild(g); }
  insp.onShown(host, { payload: {}, map: map as any, problems: [], kitProblems: [] } as any);
  const svg = host.querySelector('svg') as any;
  const click = (x: number, y: number) => svg.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  return { host, lines, click, pinned: () => [...host.querySelectorAll('.forge-artifact-pinned')].map((e: any) => e.id) };
}

test('through the panel: a surface that names the bar role pins by box and prints the line with its own label; a surface that names nothing is unchanged', () => {
  const on = panel({ pointRoles: ['phrase-bar'], pinLabel: (_id: string, p: any) => `bar ${p.params.bar}` });
  on.click(150, 30);
  assert.deepEqual(on.pinned(), ['ph_bar_2']);
  assert.deepEqual(on.lines, ['[forge-pin] click empty -> bar 2 (inside the bar\'s box)']);
  const off = panel({});
  off.click(150, 30);
  assert.deepEqual(off.pinned(), [], 'the Beat Box tab\'s inspector (no pointRoles) is untouched');
  const withNote = panel({ pointRoles: ['phrase-bar'] }, true);
  withNote.click(150, 30);                                          // inside the note's small box AND bar 2's: the unpainted part of the BAR, so the bar
  assert.deepEqual(withNote.pinned(), ['ph_bar_2'], 'a note is not chosen by its box');
});

test('MECHANISM PIN: the phrase surfaces (extend, mix and — M7c Phase B, deliberate — morph) and — 2026-10-30-1000, deliberate — the arrangement tab opt in by role; the phrase surfaces print the evidence line; nothing else in the plugin names pointRoles (if the design moves this SHOULD go red: reassess, do not just rewrite)', () => {
  const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8');
  const dom = src('phrase-dom.ts');
  assert.match(dom, /pointRoles: \[PHRASE_BAR_ROLE\]/);
  assert.match(dom, /pointRoles: \[MIX_BAR_ROLE\]/);
  assert.match(dom, /pointRoles: \[MORPH_BAR_ROLE\]/);
  assert.equal((dom.match(/trace: \(line\) => \{ console\.info\(line\); \}/g) ?? []).length, 3, 'the line is printed by all three phrase surfaces');
  const users = fs.readdirSync(import.meta.dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && /pointRoles/.test(src(f))).sort();
  assert.deepEqual(users, ['kits-arrangements.ts', 'phrase-dom.ts', 'score-inspector.ts']);
  assert.match(src('kits-arrangements.ts'), /pointRoles: \[ARRANGEMENT_ROW_ROLE\]/, 'the arrangement tab opts in with its own role, one row per bar and channel');
});

test('the box edges count as inside (all four), one pixel beyond does not', () => {
  const r = rig({ pointIds: IDS });
  for (const [x, y] of [[0, 0], [100, 0], [0, 60], [100, 60]]) { r.layer.pin(null); r.click(r.svg, x, y); assert.equal(r.layer.pinnedId(), 'ph_bar_1', `${x},${y}`); }
  for (const [x, y] of [[-1, 30], [101, 30], [50, -1], [50, 61]]) { r.layer.pin('ph_bar_2'); r.click(r.svg, x, y); assert.equal(r.layer.pinnedId(), null, `${x},${y}`); }
});

// 2026-10-26-1800 (item 1, CCQA smoke 7 finding 2): the Score's player controls (play/pause, the zoom buttons) live INSIDE the inspector root. A click on one used to count as "empty space" and release the pin
// (`[forge-pin] click midi-player -> none (not on a bar)`), which sent the notes pane home the moment the person pressed play. A click on a control is not a pin gesture: ignored, pin and pane kept.
test('2026-10-26-1800: a click on the player (play/pause), on a zoom button, or on anything inside either keeps the pin and says why; Esc and a click on empty Score space still let go', () => {
  const lines: string[] = [];
  const r = rig({ pointIds: IDS, trace: (l) => lines.push(l), keepPinOnControls: true });
  const doc = r.root.ownerDocument;
  const player = doc.createElement('midi-player'); r.root.appendChild(player);
  const inner = doc.createElement('span'); player.appendChild(inner);
  const bar = doc.createElement('div'); bar.className = 'forge-zoom-bar'; r.root.appendChild(bar);
  const zoomIn = doc.createElement('button'); zoomIn.className = 'forge-zoom-button'; bar.appendChild(zoomIn);
  const zoomLabel = doc.createElement('span'); zoomIn.appendChild(zoomLabel);
  r.layer.pin('ph_bar_2');
  for (const target of [player, inner, zoomIn, zoomLabel, bar]) { r.click(target, 150, 30); assert.equal(r.layer.pinnedId(), 'ph_bar_2', `a click on ${(target as any).tagName} keeps the pin`); }
  assert.deepEqual(r.pins, ['ph_bar_2'], 'no release, no re-pin: the notes pane never hears of the click');
  assert.match(lines[0], /^\[forge-pin\] click midi-player -> ignored \(a player control, the pin is kept\)$/);
  r.click(r.svg, 150, 200);                                  // empty Score space outside every bar and outside the player: still lets go
  assert.equal(r.layer.pinnedId(), null);
  r.layer.pin('ph_bar_3');
  r.root.dispatchEvent(new (r.root.ownerDocument.defaultView as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(r.layer.pinnedId(), null, 'Esc still releases');
});

// 2026-10-27-1000, P3 for the 1800 rule: the inspector is shared with the bar's Beat Box tab, which exists in EVERY vault. The control rule is opt-in (`keepPinOnControls`, set only by the phrase Score surfaces, which exist only in a
// score-first vault); a surface that does not ask for it behaves byte-for-byte as before 1800: a click on the player or a button is a click on empty space and lets go.
test('2026-10-27-1000 P3: without keepPinOnControls a click on the player or on a button inside the root still releases the pin, exactly as before 1800 (the bar inspector of every vault)', () => {
  const lines: string[] = [];
  const r = rig({ pointIds: IDS, trace: (l) => lines.push(l) });
  const doc = r.root.ownerDocument;
  const player = doc.createElement('midi-player'); r.root.appendChild(player);
  const button = doc.createElement('button'); r.root.appendChild(button);
  for (const target of [player, button]) {
    r.layer.pin('ph_bar_2');
    r.click(target, 150, 200);
    assert.equal(r.layer.pinnedId(), null, `a click on ${(target as any).tagName} lets go, as it did`);
  }
  assert.deepEqual(lines, ['[forge-pin] click midi-player -> none (not on a bar)', '[forge-pin] click button -> none (not on a bar)'], 'the old evidence lines, none mentioning a control');
});

// 2026-10-27-1000: the edges of "a control INSIDE the root": the root itself, or a control that merely CONTAINS the root, is not one of the Score's own buttons.
test('2026-10-27-1000: keepPinOnControls ignores only controls strictly inside the root: a root that is itself a control, or sits inside a button, still lets go on empty space', () => {
  const r = rig({ pointIds: IDS, keepPinOnControls: true });
  r.layer.pin('ph_bar_2');
  r.root.className = 'forge-zoom-bar';                       // the root itself matches the control selector
  r.click(r.svg, 150, 200);
  assert.equal(r.layer.pinnedId(), null, 'the root is not a control inside itself');
  const doc = r.root.ownerDocument;
  const outer = doc.createElement('button'); doc.body.appendChild(outer); outer.appendChild(r.root);
  r.root.className = '';
  r.layer.pin('ph_bar_2');
  r.click(r.svg, 150, 200);
  assert.equal(r.layer.pinnedId(), null, 'a button AROUND the root is not one of the Score\'s controls');
  const inner = doc.createElement('button'); r.root.appendChild(inner);
  r.layer.pin('ph_bar_2');
  r.click(inner, 150, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2', 'a button inside the root is');
});

// ---- 2026-10-29-0900 item 3 (c): Esc releases the pin from anywhere in the pane (smoke 8: focus was on a notebook button) ----------------------------------------------------------------
const esc = (target: any) => target.dispatchEvent(new (target.ownerDocument.defaultView as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

test('(c) with releaseOnEscapeFrom (the phrase Score surfaces), Esc pressed on a button OUTSIDE the root but inside the pane releases the pin, with an evidence line', () => {
  const lines: string[] = [];
  const r = rig({ pointIds: IDS, trace: (l) => lines.push(l), releaseOnEscapeFrom: true });
  const button = r.root.ownerDocument.createElement('button'); r.pane.appendChild(button);
  r.layer.pin('ph_bar_2');
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  esc(button);
  assert.equal(r.layer.pinnedId(), null);
  assert.ok(lines.some((l) => /^\[forge-pin\] Esc /.test(l)), lines.join('|'));
});

test('(c) P3: without releaseOnEscapeFrom (the bar inspector of every vault) Esc outside the root does nothing, exactly as before; Esc inside the root still releases', () => {
  const r = rig({ pointIds: IDS });
  const button = r.root.ownerDocument.createElement('button'); r.pane.appendChild(button);
  r.layer.pin('ph_bar_2');
  esc(button);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2', 'unchanged for every other surface');
  esc(r.svg);
  assert.equal(r.layer.pinnedId(), null);
});

test('(c) dispose removes the pane listener', () => {
  const r = rig({ pointIds: IDS, releaseOnEscapeFrom: true });
  r.layer.dispose();
  r.layer.pin('ph_bar_2');                                              // pin() after dispose is a no-op or not: the point is that Esc no longer reaches a dead layer
  const before = r.layer.pinnedId();
  esc(r.pane);
  assert.equal(r.layer.pinnedId(), before);
});
