// 2026-10-30-1000 (M10 slice 3) - the rows of an arrangement's Score in a DOM (happy-dom has no layout, so each staff answers getBBox with a box the test chooses): one row group per (bar, channel), in the staff of that part, behind its
// drawing; made once; none where the SVG has no such measure or staff or the staff cannot be measured. Then the same rows under the REAL inspector: a click on a row (or, by the box rule, on a point inside it that nothing is drawn on)
// pins it, and the pin is the note the notes pane is sent to (pinnedNoteFor); Esc lets go; a hover shows the stack.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { FORGE_PHRASES_KEY, annotateArrangementPayload, arrangementLineageOf, ARRANGEMENT_ROW_ROLE } from './arrangement-nav-core.ts';
import { ROW_CLASS, ROW_PAD, ensureArrangementRows } from './arrangement-rows-dom.ts';
import { createScoreInspector } from './score-inspector.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { morphXml } from './test-support/morph-xml.ts';
import type { PhraseParams } from './phrase-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const NS = 'http://www.w3.org/2000/svg';
const bar = (channels: string[]): any => ({ time_signature: '4/4', steps: 4, group_size: 1, tempo_bpm: 100, channels: Object.fromEntries(channels.map((c) => [c, [true, false, true, false]])) });
const BARS = [1, 2, 3].map(() => bar(['kick', 'snare', 'bell']));
const lineage = (): any[] => [1, 2, 3].map((n) => ({ bar: n, tempo_bpm: 100, channels: { kick: { kit: 'rock', phrase: 'phrase_003', bar: n }, snare: { kit: 'rock', phrase: 'phrase_003', bar: n }, bell: { kit: 'latin', phrase: 'phrase_009', bar: n <= 2 ? n : null } }, retimed_from: n <= 2 ? { latin: 120 } : {} }));
const PHRASES: Record<string, PhraseParams> = { phrase_003: { kind: 'extend', source: 'bar_007', bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 } as any, phrase_009: { kind: 'extend', source: 'bar_008', bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 } as any };
const annotated = () => annotateArrangementPayload('arrangements/arr_001', { multi_staff_content: morphXml(BARS), bars_data: BARS, arrangement_lineage: lineage(), [FORGE_PHRASES_KEY]: PHRASES });

/** A host like Verovio's: one `g.measure` per bar (the first part's id on it) holding one `g.staff` per part. Each staff is 1000 x 100 and its box sits 300 below the one before. */
function svgHost(opts: { bars?: number; staves?: number; ids?: boolean; measurable?: boolean } = {}) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const svg = win.document.createElementNS(NS, 'svg'); host.appendChild(svg);
  for (let b = 1; b <= (opts.bars ?? 3); b++) {
    const m = win.document.createElementNS(NS, 'g'); m.setAttribute('class', 'measure'); if (opts.ids !== false) m.setAttribute('id', `ph_bar_${b}`); svg.appendChild(m);
    for (let s = 0; s < (opts.staves ?? 3); s++) {
      const staff = win.document.createElementNS(NS, 'g'); staff.setAttribute('class', 'staff');
      if (opts.measurable !== false) staff.getBBox = () => ({ x: (b - 1) * 1000, y: s * 300, width: 1000, height: 100 });
      const note = win.document.createElementNS(NS, 'g'); note.setAttribute('class', 'note'); note.setAttribute('id', `note_${b}_${s}`);   // "drawing" already in the staff
      staff.appendChild(note); m.appendChild(staff);
    }
  }
  return { host: host as HTMLElement, rows: () => [...host.querySelectorAll(`.${ROW_CLASS}`)] as any[] };
}

test('one row group per (bar, channel), inside the staff of that part, as its FIRST child (behind the drawing); each covers its staff and a quarter of its height above and below', () => {
  const { host, rows } = svgHost();
  const made = ensureArrangementRows(host, annotated().map);
  assert.equal(made, 9);
  assert.equal(rows().length, 9);
  const kick2 = host.querySelector('[id="ph_bar_2_kick"]') as any;
  assert.equal(kick2.parentNode.getAttribute('class'), 'staff');
  assert.equal(kick2.parentNode.firstChild, kick2, 'behind the drawing: the staff\'s notes come after it');
  assert.equal(kick2.parentNode.parentNode.getAttribute('id'), 'ph_bar_2', 'in bar 2');
  const bell3 = host.querySelector('[id="ph_bar_3_bell"]') as any;
  assert.equal(bell3.parentNode.getBBox().y, 600, 'the third staff: the bell\'s part');
  const rect = kick2.firstElementChild;
  assert.deepEqual([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')], ['1000', String(0 - 100 * ROW_PAD), '1000', String(100 * (1 + 2 * ROW_PAD))]);
  assert.deepEqual([rect.getAttribute('fill'), rect.getAttribute('pointer-events')], ['transparent', 'all'], 'invisible, but it takes a click');
});

test('it is idempotent: a second call makes nothing and leaves the very same elements (the inspector repaints often)', () => {
  const { host, rows } = svgHost();
  const map = annotated().map;
  ensureArrangementRows(host, map);
  const before = rows();
  assert.equal(ensureArrangementRows(host, map), 0);
  assert.ok(rows().every((r, i) => r === before[i]));
});

test('a redrawn SVG (the Kit / multi-staff toggle replaces it) gets its rows again; a SVG that lacks a measure or a staff gets none for it', () => {
  const map = annotated().map;
  const a = svgHost(); ensureArrangementRows(a.host, map);
  a.host.querySelector('svg')!.remove();
  const fresh = svgHost();
  assert.equal(ensureArrangementRows(fresh.host, map), 9);
  const noIds = svgHost({ ids: false });
  assert.equal(ensureArrangementRows(noIds.host, map), 0, 'the Kit view\'s measures carry no ids here: nothing is drawn');
  const short = svgHost({ bars: 2 });
  assert.equal(ensureArrangementRows(short.host, map), 6, 'bar 3 is not drawn (a page break): its rows wait');
  const fewStaves = svgHost({ staves: 2 });
  assert.equal(ensureArrangementRows(fewStaves.host, map), 6, 'no third staff: no bell row');
});

test('a staff that cannot be measured (no layout, an empty box, a throwing getBBox) has no row: nothing is guessed', () => {
  assert.equal(ensureArrangementRows(svgHost({ measurable: false }).host, annotated().map), 0);
  const empty = svgHost(); empty.host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }); });
  assert.equal(ensureArrangementRows(empty.host, annotated().map), 0);
  const broken = svgHost(); broken.host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => { throw new Error('not rendered'); }; });
  assert.equal(ensureArrangementRows(broken.host, annotated().map), 0);
});

test('only rows are drawn: other roles in the map, and a row without a bar or staff number, are ignored', () => {
  const { host } = svgHost();
  const map = { x: { noteId: 'bars/bar_001', role: 'hit', params: { bar: 1, staff: 0 } }, y: { noteId: 'a', role: ARRANGEMENT_ROW_ROLE, params: { bar: 'one', staff: 0 } }, z: { noteId: 'a', role: ARRANGEMENT_ROW_ROLE, params: { bar: 1 } } };
  assert.equal(ensureArrangementRows(host, map as any), 0);
});

// ---- under the real inspector ---------------------------------------------------------------------------------------------------------------------------------------------------

function rig() {
  const { host, rows } = svgHost();
  const slot = win.document.createElement('div'); win.document.body.appendChild(slot);
  const pane = win.document.createElement('div'); win.document.body.appendChild(pane);      // the whole pane (strip, controls, Score): Esc anywhere in it lets go
  const outside = win.document.createElement('button'); pane.appendChild(outside);
  const result = annotated();
  const pins: Array<[string, string] | null> = [];
  const insp = createScoreInspector(slot, {
    noteId: 'arrangements/arr_001', openNote: () => {}, lineage: arrangementLineageOf, hint: 'hint', enlargeTargets: null, pointRoles: [ARRANGEMENT_ROW_ROLE], previewOnHover: true,
    keepPinOnControls: true, releaseOnEscapeFrom: pane, band: false,
    onPinned: (e) => { const p = e ? pinnedNoteFor(e.prov) : null; pins.push(p ? [p.noteId, p.reason] : null); },
  });
  ensureArrangementRows(host, result.map);
  insp.onShown(host, result);
  const click = (el: any, xy?: [number, number]) => { const ev = new win.MouseEvent('click', { bubbles: true, clientX: xy?.[0], clientY: xy?.[1] }); el.dispatchEvent(ev); };
  return { host, slot, pane, outside, insp, pins, click, rows, text: () => [...slot.querySelectorAll('.forge-inspector-body li, .forge-inspector-body')].map((e: any) => (e.tagName === 'LI' ? e.firstElementChild?.textContent ?? e.textContent : '')).filter(Boolean).join('\n') || (slot.querySelector('.forge-inspector-body').textContent as string) };
}

test('a click on a row pins it: the stack says bar, kit, phrase bar and tempo, and the notes pane is sent to the bar note that row\'s phrase got it from', () => {
  const r = rig();
  r.click(r.host.querySelector('[id="ph_bar_2_bell"] rect'));
  assert.deepEqual(r.pins, [['bars/bar_008', 'pinned bar 2']]);
  assert.match(r.text(), /bar 2 of 3 · latin kit · phrase_009 bar 2 · played at 100 bpm \(came with 120\)/);
  r.click(r.host.querySelector('[id="ph_bar_2_kick"] rect'));
  assert.deepEqual(r.pins.at(-1), ['bars/bar_007', 'pinned bar 2'], 'the rock row of the same bar: the rock phrase\'s note');
  assert.match(r.text(), /^bar 2 of 3 · rock kit · phrase_003 bar 2 · played at 100 bpm$/m);
});

test('a click on a bar past a shorter phrase\'s end says so in plain words and sends the pane to that phrase\'s own note', () => {
  const r = rig();
  r.click(r.host.querySelector('[id="ph_bar_3_bell"] rect'));
  assert.deepEqual(r.pins, [['phrases/phrase_009', 'phrase ended']]);
  assert.match(r.text(), /the latin phrase has ended/);
});

test('a click on something drawn in the staff (a notehead) is found by the row\'s box: the pointer inside the row decides, as for a phrase\'s bars', () => {
  const r = rig();
  const kick1 = r.host.querySelector('[id="ph_bar_1_kick"]') as any;
  kick1.getBoundingClientRect = () => ({ left: 0, right: 1000, top: -25, bottom: 125 });
  r.host.querySelector('[id="ph_bar_1_snare"]')!.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 275, bottom: 425 });
  r.click(r.host.querySelector('[id="note_1_0"]'), [500, 50]);
  assert.deepEqual(r.pins, [['bars/bar_007', 'pinned bar 1']], 'a click on the note of the first staff is the kick row');
  r.click(r.host.querySelector('[id="note_1_1"]'), [500, 350]);
  assert.equal(r.pins.length, 2);
  assert.match(r.text(), /bar 1 of 3 · rock kit/);
  assert.match(r.text(), /snare row/);
});

test('Esc lets go (the notes pane goes home), from the Score and from anywhere in the pane; a click on a player or zoom button inside the Score keeps the pin', () => {
  const r = rig();
  r.click(r.host.querySelector('[id="ph_bar_1_kick"] rect'));
  const button = win.document.createElement('button'); r.host.appendChild(button);
  r.click(button);
  assert.equal(r.pins.length, 1, 'a control is not a pin gesture (the 1800 rule): the pin is kept and the pane is not sent home');
  r.host.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(r.pins, [['bars/bar_007', 'pinned bar 1'], null], 'Esc in the Score');
  r.click(r.host.querySelector('[id="ph_bar_2_snare"] rect'));
  r.outside.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(r.pins.at(-1), null, 'Esc from a button of the pane outside the Score (releaseOnEscapeFrom)');
  assert.equal(r.pins.length, 4);
});

test('a click OUTSIDE the Score (the row of Mute / Solo / volume sits in the pane, not in the Score) never pins and never lets go', () => {
  const r = rig();
  r.click(r.host.querySelector('[id="ph_bar_1_kick"] rect'));
  r.click(r.outside);
  assert.equal(r.pins.length, 1, 'the inspector listens on the Score only: a control of the pane is not a gesture on it');
});

test('hovering a row with nothing pinned shows its stack (the preview), leaving shows the hint again', () => {
  const r = rig();
  r.host.querySelector('[id="ph_bar_1_bell"] rect')!.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  assert.match(r.text(), /bar 1 of 3 · latin kit · phrase_009 bar 1/);
  r.host.querySelector('[id="ph_bar_1_bell"] rect')!.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true }));
  assert.equal(r.text(), 'hint');
});


// ---- gaps the mutation pass found (2026-10-30-1000) ---------------------------------------------------------------------------------------------------------------------------------------

test('the rows are SVG (their namespace), invisible (no stroke), and reach past their staff by a margin that cannot touch the next staff', () => {
  const { host } = svgHost();
  ensureArrangementRows(host, annotated().map);
  const g = host.querySelector('[id="ph_bar_1_kick"]') as any;
  assert.equal(g.namespaceURI, NS);
  assert.equal(g.firstElementChild.namespaceURI, NS);
  assert.equal(g.firstElementChild.getAttribute('stroke'), 'none');
  assert.ok(ROW_PAD > 0 && ROW_PAD <= 0.4, 'staves sit a few staff-heights apart; a margin over 0.4 of the height each way could overlap the next row');
});

test('a row whose bar or staff is not a NUMBER is not drawn even when its text names a real bar and staff; a staff with only one measurable side has no row', () => {
  const { host } = svgHost();
  const strings = { a: { noteId: 'n', role: ARRANGEMENT_ROW_ROLE, params: { bar: '1', staff: 0 } }, b: { noteId: 'n', role: ARRANGEMENT_ROW_ROLE, params: { bar: 1, staff: '0' } } };
  assert.equal(ensureArrangementRows(host, strings as any), 0);
  assert.equal(host.querySelector('[id="a"]'), null); assert.equal(host.querySelector('[id="b"]'), null);
  const flat = svgHost(); flat.host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => ({ x: 0, y: 0, width: 100, height: 0 }); });
  assert.equal(ensureArrangementRows(flat.host, annotated().map), 0, 'no height');
  const thin = svgHost(); thin.host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => ({ x: 0, y: 0, width: 0, height: 100 }); });
  assert.equal(ensureArrangementRows(thin.host, annotated().map), 0, 'no width');
  const sliver = svgHost(); sliver.host.querySelectorAll('.staff').forEach((s: any) => { s.getBBox = () => ({ x: 0, y: 0, width: 0.5, height: 0.5 }); });
  assert.equal(ensureArrangementRows(sliver.host, annotated().map), 9, 'a small box is still a box (only zero is not)');
});
