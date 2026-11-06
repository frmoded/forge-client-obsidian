// 2026-10-30-1020 — "the driver CANNOT pick bars 3 to 5 in the notebook": a drag across bars on the engraving selects them (opt-in `selectBars`), Shift-click on a bar extends, a plain click still pins. This inspector is shared with the bar's
// Beat Box tab of EVERY vault and with the other Score surfaces, so everything here is opt-in (P3): a surface that does not pass `selectBars` is tested to behave exactly as before. Real pointer-event sequences (mousedown, mousemove,
// mouseup, then the click the browser fires after them), over three side-by-side bars of 100 px (box x: 0-100, 110-210, 220-320).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { attachArtifactInspector } from './artifact-inspector-core.ts';

const IDS = [1, 2, 3].map((n) => `ph_bar_${n}`);
const MAP = Object.fromEntries(IDS.map((id, i) => [id, { noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: i + 1 } }]));
const barOf = (prov: { params: Record<string, unknown> }): number | null => (typeof prov.params.bar === 'number' ? prov.params.bar : null);

function rig(opts: { selectBars?: boolean; keepPinOnControls?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const root = doc.createElement('div'); doc.body.appendChild(root);
  root.innerHTML = '<svg>' + IDS.map((id) => `<g class="measure" id="${id}"><g class="staff"><path class="line" d="M0 0"/></g><g class="notehead"><use/></g></g>`).join('') + '</svg><button class="player-ish">play</button>';
  const svg = root.querySelector('svg') as any;
  const button = root.querySelector('button') as any;
  IDS.forEach((id, i) => { (root.querySelector(`#${id}`) as any).getBoundingClientRect = () => ({ left: 110 * i, top: 0, right: 110 * i + 100, bottom: 60, width: 100, height: 60, x: 110 * i, y: 0 }); });
  const calls: string[] = [];
  const pins: Array<string | null> = [];
  const layer = attachArtifactInspector({
    root, map: MAP, onHover: () => {}, onPin: (e) => { pins.push(e ? e.id : null); }, pointIds: IDS, keepPinOnControls: opts.keepPinOnControls,
    selectBars: opts.selectBars ? { barOf, onRange: (a: number, b: number) => { calls.push(`range ${a}-${b}`); }, onRangeEnd: () => { calls.push('end'); }, onShiftClick: (n: number) => { calls.push(`shift ${n}`); } } : undefined,
  } as any);
  const ev = (type: string, target: any, x: number, y = 30, extra: Record<string, unknown> = {}) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra }));
  /** What a browser does for a press at `from`, a drag through `via` and a release at `to`: mousedown, mousemove(s), mouseup, then the click on the common ancestor (the svg root here). */
  const drag = (from: number, via: number[], to: number, target: any = svg) => {
    ev('mousedown', target, from); for (const x of via) ev('mousemove', target, x); ev('mouseup', target, to); ev('click', target, to);
  };
  return { win, root, svg, button, layer, calls, pins, ev, drag };
}

test('a drag from bar 1 to bar 3 selects bars 1 to 3 (live: 1-2 on the way, 1-3 at the end) and does NOT pin, release or move the pin', () => {
  const r = rig({ selectBars: true });
  r.layer.pin('ph_bar_2');
  r.drag(5, [150, 250], 250);
  assert.deepEqual(r.calls, ['range 1-2', 'range 1-3', 'end'], 'the end of the drag is told AFTER the last range: the surface may scroll then, never while the pointer is moving over the Score');
  assert.equal(r.layer.pinnedId(), 'ph_bar_2', 'the click that follows a drag is not a pin gesture');
  assert.deepEqual(r.pins, ['ph_bar_2'], 'onPin told once, by the explicit pin before the drag');
});

test('a drag from nothing pinned pins nothing, and a backwards drag (bar 3 to bar 1) is the same range', () => {
  const r = rig({ selectBars: true });
  r.drag(250, [150, 5], 5);
  assert.deepEqual(r.calls, ['range 2-3', 'range 1-3', 'end']);
  assert.equal(r.layer.pinnedId(), null);
  assert.deepEqual(r.pins, []);
});

test('a plain click (press and release in one place) still pins, and tells nobody about a range', () => {
  const r = rig({ selectBars: true });
  r.drag(150, [], 150);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  assert.deepEqual(r.calls, []);
});

test('a press that moves inside ONE bar is still a click: it pins, there is no range', () => {
  const r = rig({ selectBars: true });
  r.drag(120, [130, 160, 190], 190);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  assert.deepEqual(r.calls, []);
});

test('the click after a drag is swallowed once: the NEXT click (after the browser has finished with the first) pins as usual', async () => {
  const r = rig({ selectBars: true });
  r.drag(5, [250], 250);
  await new Promise((resolve) => setTimeout(resolve, 5));
  r.ev('click', r.svg, 150);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
});

test('a drag released OUTSIDE the root (no click reaches it) leaves nothing swallowing the next click', async () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5); r.ev('mousemove', r.svg, 250);
  r.ev('mouseup', r.root.ownerDocument.body, 900);                     // released over the margin of the page
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(r.calls, ['range 1-3', 'end'], 'released over the margin of the page: the drag still ends');
  r.ev('click', r.svg, 150);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
});

test('a press that starts in no bar (the margin) is not a drag', () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5, 200); r.ev('mousemove', r.svg, 250, 30); r.ev('mouseup', r.svg, 250, 30);
  assert.deepEqual(r.calls, []);
});

// 2026-11-06-1192: the fix named in 1190 item 3 (d). A press that starts where no bar is (the Score box's margin, the gap between systems) and is released on a bar is a drag the person did not mean as a pin: the browser's click lands at the release point.
test('1192: a press in no bar, released on bar 3, pins nothing and tells nobody about a range (the click at the release point is swallowed)', () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5, 200); r.ev('mousemove', r.svg, 150, 100); r.ev('mousemove', r.svg, 250, 30); r.ev('mouseup', r.svg, 250, 30); r.ev('click', r.svg, 250, 30);
  assert.equal(r.layer.pinnedId(), null, 'a margin press released on a bar does not pin it');
  assert.deepEqual(r.pins, []);
  assert.deepEqual(r.calls, []);
});

test('1192: the swallowed click does not release a pin that was already there', () => {
  const r = rig({ selectBars: true });
  r.layer.pin('ph_bar_1');
  r.ev('mousedown', r.svg, 150, 200); r.ev('mouseup', r.svg, 250, 30); r.ev('click', r.svg, 250, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1');
  assert.deepEqual(r.pins, ['ph_bar_1']);
});

test('1192: the swallow is once and only for that gesture: the next plain click on a bar pins', () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5, 200); r.ev('mouseup', r.svg, 250, 30); r.ev('click', r.svg, 250, 30);
  assert.equal(r.layer.pinnedId(), null);
  r.ev('click', r.svg, 150);                                              // a bare click straight after (no press of its own): the swallowed gesture's press is spent
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  const q = rig({ selectBars: true });
  q.ev('mousedown', q.svg, 5, 200); q.ev('mouseup', q.svg, 250, 30); q.ev('click', q.svg, 250, 30);
  q.ev('mousedown', q.svg, 150); q.ev('mouseup', q.svg, 150); q.ev('click', q.svg, 150);
  assert.equal(q.layer.pinnedId(), 'ph_bar_2', 'and the next gesture, with its own press, pins');
});

test('1192: a margin press released OUTSIDE the root (no click reaches it) leaves nothing swallowing the next click', async () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5, 200);
  r.ev('mouseup', r.root.ownerDocument.body, 900);
  await new Promise((resolve) => setTimeout(resolve, 5));
  r.ev('click', r.svg, 150);                                              // e.g. a click with no press of its own (keyboard-activated, synthetic)
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
});

test('1192: the slop is 4 px: a margin press released 4 px away on a bar still pins (an unsteady click), 5 px away is a drag', () => {
  const near = rig({ selectBars: true });
  near.ev('mousedown', near.svg, 150, 64); near.ev('mouseup', near.svg, 150, 60); near.ev('click', near.svg, 150, 60);   // bar box bottom is 60; the press is 4 px below it
  assert.equal(near.layer.pinnedId(), 'ph_bar_2', 'exactly 4 px away is a click');
  const far = rig({ selectBars: true });
  far.ev('mousedown', far.svg, 150, 65); far.ev('mouseup', far.svg, 150, 60); far.ev('click', far.svg, 150, 60);
  assert.equal(far.layer.pinnedId(), null, '5 px away is a drag');
  const side = rig({ selectBars: true });
  side.ev('mousedown', side.svg, 105, 30); side.ev('mouseup', side.svg, 109.5, 30); side.ev('click', side.svg, 109.5, 30);   // x 105-109.5 is the gap between bar 1 and 2: a click in the gap pins nothing
  assert.equal(side.layer.pinnedId(), null);
  const diag = rig({ selectBars: true });
  diag.ev('mousedown', diag.svg, 150, 63); diag.ev('mouseup', diag.svg, 153, 59); diag.ev('click', diag.svg, 153, 59);    // 3 px across, 4 px down: 5 px apart in a straight line
  assert.equal(diag.layer.pinnedId(), null, 'the distance is straight-line, not per axis');
});

test('1192: a plain click in the margin (press and release in one place) still unpins, as before', () => {
  const r = rig({ selectBars: true });
  r.layer.pin('ph_bar_2');
  r.ev('mousedown', r.svg, 150, 200); r.ev('mouseup', r.svg, 150, 200); r.ev('click', r.svg, 150, 200);
  assert.equal(r.layer.pinnedId(), null);
});

test('1192: a press that starts IN a bar and ends in the margin is unchanged (the click in the margin unpins; no range)', () => {
  const r = rig({ selectBars: true });
  r.layer.pin('ph_bar_2');
  r.ev('mousedown', r.svg, 5); r.ev('mousemove', r.svg, 5, 200); r.ev('mouseup', r.svg, 5, 200); r.ev('click', r.svg, 5, 200);
  assert.equal(r.layer.pinnedId(), null);
  assert.deepEqual(r.calls, []);
});

test('1192: a shift press is not a stray press: Shift-click on a bar still extends, even after a margin press whose release never came', () => {
  const r = rig({ selectBars: true });
  r.ev('mousedown', r.svg, 5, 200);                                       // a margin press the window never saw the end of (focus lost)
  r.ev('mousedown', r.svg, 250, 30, { shiftKey: true }); r.ev('mouseup', r.svg, 250, 30, { shiftKey: true }); r.ev('click', r.svg, 250, 30, { shiftKey: true });
  assert.deepEqual(r.calls, ['shift 3']);
  assert.equal(r.layer.pinnedId(), null);
});

test('1192 P3: where selectBars is not set a margin press released on a bar pins that bar by the old rule', () => {
  const r = rig({ selectBars: false });
  r.ev('mousedown', r.svg, 5, 200); r.ev('mouseup', r.svg, 250, 30); r.ev('click', r.svg, 250, 30);
  assert.equal(r.layer.pinnedId(), 'ph_bar_3');
});

test('Shift-click on a bar asks to EXTEND (with that bar) and does not pin; Shift-click on the margin does nothing and keeps the pin', () => {
  const r = rig({ selectBars: true });
  r.layer.pin('ph_bar_1');
  r.ev('click', r.svg, 250, 30, { shiftKey: true });
  assert.deepEqual(r.calls, ['shift 3']);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1');
  r.ev('click', r.svg, 250, 200, { shiftKey: true });
  assert.deepEqual(r.calls, ['shift 3']);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1');
});

test('a press on a control inside the root (the player) is not a drag start, with keepPinOnControls on', () => {
  const r = rig({ selectBars: true, keepPinOnControls: true });
  r.ev('mousedown', r.button, 5); r.ev('mousemove', r.svg, 250); r.ev('mouseup', r.svg, 250);
  assert.deepEqual(r.calls, []);
});

test('P3: a surface that does not opt in sees none of it - the same presses pin by the old rule (the click lands on bar 3), Shift-click pins, nothing throws', () => {
  const r = rig({ selectBars: false });
  r.drag(5, [150, 250], 250);
  assert.equal(r.layer.pinnedId(), 'ph_bar_3');
  r.ev('click', r.svg, 150, 30, { shiftKey: true });
  assert.equal(r.layer.pinnedId(), 'ph_bar_2');
  assert.deepEqual(r.calls, []);
});

test('dispose takes the listeners with it: a drag after dispose tells nobody', () => {
  const r = rig({ selectBars: true });
  r.layer.dispose();
  r.drag(5, [250], 250);
  assert.deepEqual(r.calls, []);
});

test('MECHANISM PIN 2026-10-30-1020 (if the design moves this SHOULD go red: reassess, do not just rewrite): `selectBars` is opt-in - only the phrase surfaces\' wiring (phrase-dom.ts) turns it on, through score-inspector.ts; the Beat Box tab, the kit and arrangement tabs and every other Score never name it', () => {
  const dir = import.meta.dirname;
  const users = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && /\bselectBars\b/.test(fs.readFileSync(path.join(dir, f), 'utf8'))).sort();
  assert.deepEqual(users, ['artifact-inspector-core.ts', 'compositions.ts', 'phrase-dom.ts', 'score-inspector.ts']);     // (M17c: the composition tab has the notebook too, so it turns the gesture on - and, as the phrase tab, only when it HAS one: asserted below)
  const dom = fs.readFileSync(path.join(dir, 'phrase-dom.ts'), 'utf8');
  assert.equal((dom.match(/selectBars: selectBarsPort\(\),/g) ?? []).length, 3, 'extend, mix and morph');
  assert.match(dom, /const selectBarsPort = \(\): ScoreInspectorPorts\['selectBars'\] => \(ports\.notebook \? \{/, 'only a tab that HAS a notebook gets the gesture');
  const comp = fs.readFileSync(path.join(dir, 'compositions.ts'), 'utf8');
  assert.equal((comp.match(/selectBars: \{/g) ?? []).length, 1, 'the composition tab turns it on once');
  assert.match(comp, /\.\.\.\(this\.notebookFor \? \{[\s\S]*?selectBars: \{[\s\S]*?\} : \{\}\)/, 'and only when the plugin gave it a notebook'); 
});
