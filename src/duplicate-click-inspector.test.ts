// 2026-11-19-0992 - THE COPY CLICK, in the inspector the Score's bars are pinned by (artifact-inspector-core.ts): opt-in (`copyClick`), like `selectBars` and `keepPinOnControls`, because this inspector is shared with the bar's Beat Box
// tab of EVERY vault (P3). While the surface says "armed" (its composer's text is "Duplicate"), the NEXT plain click on a bar (on a drawn part or inside the bar's box) does NOT pin: it tells the surface WHICH bar (`onBar(entry)`), once,
// and the pin stays where it was. In every other state the click is the pin it always was: not armed, a click on empty space (unpins as before), Shift-click and Ctrl/Cmd-click (the selection gestures), the end of a drag, a player
// button; and a surface that does not pass the option is byte for byte what it was. Real pointer sequences over three side-by-side bars of 100 px. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { attachArtifactInspector, type InspectorEntry } from './artifact-inspector-core.ts';

const IDS = [1, 2, 3].map((n) => `ph_bar_${n}`);
const MAP = Object.fromEntries(IDS.map((id, i) => [id, { noteId: 'phrases/phrase_001', role: 'phrase-bar', params: { bar: i + 1, source: 'bar_00' + (i + 5) } }]));
const barOf = (prov: { params: Record<string, unknown> }): number | null => (typeof prov.params.bar === 'number' ? prov.params.bar : null);

function rig(opts: { copy?: boolean; armed?: () => boolean; selectBars?: boolean } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document;
  const root = doc.createElement('div'); doc.body.appendChild(root);
  root.innerHTML = '<svg>' + IDS.map((id) => `<g class="measure" id="${id}"><g class="staff"><path class="line" d="M0 0"/></g><g class="notehead"><use/></g></g>`).join('') + '</svg><button class="player-ish">play</button>';
  const svg = root.querySelector('svg') as any; const button = root.querySelector('button') as any;
  IDS.forEach((id, i) => { (root.querySelector(`#${id}`) as any).getBoundingClientRect = () => ({ left: 110 * i, top: 0, right: 110 * i + 100, bottom: 60, width: 100, height: 60, x: 110 * i, y: 0 }); });
  const copies: string[] = []; const pins: Array<string | null> = []; const sel: string[] = []; let armedAnswer = true; const armedCalls: number[] = [];
  const layer = attachArtifactInspector({
    root, map: MAP, onHover: () => {}, onPin: (e) => { pins.push(e ? e.id : null); }, pointIds: IDS, keepPinOnControls: true,
    selectBars: opts.selectBars === false ? undefined : { barOf, onRange: () => {}, onShiftClick: (n: number) => { sel.push(`shift ${n}`); }, onToggleClick: (n: number) => { sel.push(`toggle ${n}`); } },
    ...(opts.copy === false ? {} : { copyClick: { armed: () => { armedCalls.push(1); return opts.armed ? opts.armed() : armedAnswer; }, onBar: (e: InspectorEntry) => { copies.push(`${e.id}:${String(e.prov.params.source)}`); } } }),
  } as never);
  const ev = (type: string, target: any, x: number, y = 30, extra: Record<string, unknown> = {}) => target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra }));
  const click = (target: any, x: number, extra: Record<string, unknown> = {}) => { ev('mousedown', target, x, 30, extra); ev('mouseup', target, x, 30, extra); ev('click', target, x, 30, extra); };
  return { win, root, svg, button, layer, copies, pins, sel, click, ev, setArmed: (v: boolean) => { armedAnswer = v; }, armedCalls, bar: (n: number) => root.querySelector(`#${IDS[n - 1]}`) as any };
}

test('ARMED: the next click on a bar (on a drawn part) is a COPY click: it tells which bar, once, and does NOT pin it', () => {
  const r = rig();
  r.click(r.bar(2).querySelector('.notehead'), 160);
  assert.deepEqual(r.copies, ['ph_bar_2:bar_006']);
  assert.equal(r.layer.pinnedId(), null); assert.deepEqual(r.pins, [], 'nothing was pinned, nothing was told as pinned');
});

test('ARMED: a click on the UNPAINTED part of a bar (the svg root, inside the bar\'s box) is the same copy click', () => {
  const r = rig();
  r.click(r.svg, 270);
  assert.deepEqual(r.copies, ['ph_bar_3:bar_007']); assert.deepEqual(r.pins, []);
});

test('ARMED: the pin that was there is kept (a copy click moves nothing), and EVERY bar of the Score can be the one clicked', () => {
  const r = rig();
  r.layer.pin('ph_bar_1');
  for (const [i, x] of [[1, 50], [2, 160], [3, 270]] as const) r.click(r.svg, x);
  assert.deepEqual(r.copies, ['ph_bar_1:bar_005', 'ph_bar_2:bar_006', 'ph_bar_3:bar_007']);
  assert.equal(r.layer.pinnedId(), 'ph_bar_1'); assert.deepEqual(r.pins, ['ph_bar_1']);
});

test('NOT armed: the click is the pin it always was, and onBar is never called (the next click after a copy click pins again)', () => {
  const r = rig();
  r.click(r.svg, 160); assert.deepEqual(r.copies, ['ph_bar_2:bar_006']);
  r.setArmed(false);
  r.click(r.svg, 270);
  assert.equal(r.layer.pinnedId(), 'ph_bar_3'); assert.deepEqual(r.pins, ['ph_bar_3']); assert.deepEqual(r.copies, ['ph_bar_2:bar_006'], 'no second copy click');
});

test('ARMED, but the click is on EMPTY space (in no bar\'s box): it is what it always was (it unpins); it is not a copy click', () => {
  const r = rig();
  r.layer.pin('ph_bar_2');
  r.click(r.svg, 500);
  assert.deepEqual(r.copies, []); assert.equal(r.layer.pinnedId(), null);
});

test('ARMED: Shift-click and Ctrl/Cmd-click are still the selection gestures (they pin nothing and copy nothing), the end of a drag is not a copy click, and a player button is ignored', () => {
  const r = rig();
  r.click(r.svg, 160, { shiftKey: true }); r.click(r.svg, 270, { ctrlKey: true }); r.click(r.svg, 50, { metaKey: true });
  assert.deepEqual(r.sel, ['shift 2', 'toggle 3', 'toggle 1']); assert.deepEqual(r.copies, []); assert.deepEqual(r.pins, []);
  r.ev('mousedown', r.svg, 5); r.ev('mousemove', r.svg, 150); r.ev('mouseup', r.svg, 150); r.ev('click', r.svg, 150);          // a drag from bar 1 into bar 2: a range, then the click the browser fires
  assert.deepEqual(r.copies, [], 'the click after a drag is not a copy click'); assert.deepEqual(r.pins, []);
  r.click(r.button, 50);
  assert.deepEqual(r.copies, [], 'a click on the Score\'s own player is not a click on a bar'); assert.deepEqual(r.pins, []);
});

test('P3: a surface that passes no `copyClick` (the bar\'s Beat Box tab, the arrangement and composition Scores) never asks anything and pins exactly as before', () => {
  const r = rig({ copy: false });
  r.click(r.svg, 160);
  assert.equal(r.layer.pinnedId(), 'ph_bar_2'); assert.deepEqual(r.pins, ['ph_bar_2']); assert.deepEqual(r.armedCalls, []);
  const bare = rig({ copy: false, selectBars: false }); bare.click(bare.svg, 270); assert.equal(bare.layer.pinnedId(), 'ph_bar_3');
});

test('the armed answer is asked at the CLICK (not once at attach): the same inspector copies, then pins, as the composer\'s text changes', () => {
  let armed = false; const r = rig({ armed: () => armed });
  r.click(r.svg, 50); assert.equal(r.layer.pinnedId(), 'ph_bar_1');
  armed = true; r.click(r.svg, 160); assert.deepEqual(r.copies, ['ph_bar_2:bar_006']); assert.equal(r.layer.pinnedId(), 'ph_bar_1');
  armed = false; r.click(r.svg, 270); assert.equal(r.layer.pinnedId(), 'ph_bar_3');
});
