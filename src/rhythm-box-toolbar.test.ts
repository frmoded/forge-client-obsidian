// Drain 2026-10-20-0900 §3–§5 — the Rhythm Box widget's toolbar, after the driver's feedback on the Iteration 83 deploy.
//
//   §3  Tap tempo is gone (tempo − / + stays).
//   §4  ONE transform toolbar, identical in Grid and Circle: shift left, shift right (every instrument, one step), mirror, rotate counter-clockwise,
//       rotate clockwise (the SELECTED instrument only). It is ONE row of DOM shown in both views, generated from ONE definition (TRANSFORM_TOOLS), so the
//       two views cannot drift — a control cannot exist in one and not the other. Grid gains the selection concept the circle already had: click a row's name.
//       The Move ring up/down pair, the Shape toggle and the ring chips are circle-only extras, after the five.
//   §5  The Add instrument menu is first in that row, in both views, and is ONE control (it used to be two, one per view).
//   §1  (the widget half) When the host says its own toolbar owns Reset and the "not saved" reminder (`resetInHost`), the widget draws neither, and the
//       bar that held them disappears — one row instead of two. Without the flag (an older plugin) the widget draws them as it always did.
//
// Real notes from the shipped library, not look-alikes. The five controls are driven through the REAL widget in happy-dom; the pure functions come from the
// widget's own pure-core block (the same code the page runs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadWidget, skip, widgetHtml, widgetScript, type Harness } from './test-support/rhythm-widget-harness.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

function pureCore(): any {
  const mod: { exports: any } = { exports: {} };
  new Function('module', widgetScript)(mod);
  return mod.exports;
}
const noteData = (name: string): RhythmData => {
  const p = path.resolve(import.meta.dirname, '..', 'assets', 'vaults', 'music-theory', 'rhythm_data', `${name}.md`);
  const r = readRhythmNote(fs.readFileSync(p, 'utf8'));
  assert.ok(r.ok, name);
  return (r as { ok: true; value: { data: RhythmData } }).value.data;
};
const ROCK = noteData('rhythm_pattern_straight_rock');          // kick, snare, hihat — 4/4, 16 steps
const load = (d: unknown, extra: Record<string, unknown> = {}) => ({ type: 'forge-rhythm-load', data: d, noteName: 'rhythm_pattern_test', ...extra });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
const lastSave = (h: Harness) => types(h, 'forge-rhythm-save').at(-1)?.data as RhythmData | undefined;
const tick = () => new Promise((r) => setTimeout(r, 5));
const rot = (a: unknown[], by: number) => a.map((_, i) => a[(((i - by) % a.length) + a.length) % a.length]);
async function loaded(d: unknown, extra: Record<string, unknown> = {}): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send(load(d, extra));
  return h;
}
const press = async (h: Harness, id: string) => { h.el(id).click(); await tick(); };
/** Is the element on screen: no ancestor (or itself) carries `hidden`. */
const shown = (el: any): boolean => { for (let e = el; e && e.tagName !== 'BODY'; e = e.parentElement) if (e.hidden) return false; return true; };
const FIVE = ['bRotLeft', 'bRotRight', 'bMirror', 'bRingRotLeft', 'bRingRotRight'];
const snapshot = (h: Harness, id: string) => { const b = h.el(id); return { id, text: b.textContent.trim(), title: b.getAttribute('title'), aria: b.getAttribute('aria-label'), disabled: !!b.disabled, shown: shown(b) }; };

// ---- §3 Tap tempo is gone ---------------------------------------------------------------------------------------------------------

test('§3 TAP TEMPO: no button, no code, no exported helpers — and tempo − / + is still there and still commits', { skip }, async () => {
  const core = pureCore();
  assert.equal('pushTap' in core, false);
  assert.equal('bpmFromTapHistory' in core, false);
  assert.doesNotMatch(widgetHtml, /tap tempo|Tap tempo|bTap|tapHistory|pushTap|bpmFromTapHistory/i);
  const h = await loaded(ROCK);
  assert.ok(h.el('bTap') === null, 'no #bTap');
  assert.equal(h.doc.querySelector('.transport').textContent.toLowerCase().includes('tap'), false);
  // NON-VACUITY: the neighbouring tempo control survives and commits through the one save path
  assert.ok(h.el('bBpmUp') && h.el('bBpmDown') && h.el('bpmVal'));
  h.posted.length = 0;
  await press(h, 'bBpmUp');
  assert.equal(h.el('bpmVal').textContent, '101 BPM');
});

// ---- §4 the definition, and the pure transforms ----------------------------------------------------------------------------------

test('§4 ONE DEFINITION: TRANSFORM_TOOLS is exactly the five controls, in the driver\'s order, with icons, tooltips and aria-labels', { skip }, () => {
  const { TRANSFORM_TOOLS, transformToolText } = pureCore();
  assert.deepEqual(TRANSFORM_TOOLS.map((t: any) => t.id), ['shiftLeft', 'shiftRight', 'mirror', 'rotateCcw', 'rotateCw']);
  assert.deepEqual(TRANSFORM_TOOLS.map((t: any) => t.domId), FIVE);
  assert.deepEqual(TRANSFORM_TOOLS.map((t: any) => t.scope), ['all', 'all', 'all', 'selected', 'selected']);
  assert.deepEqual(TRANSFORM_TOOLS.map((t: any) => t.icon), ['‹', '›', '⇆', '↺', '↻']);
  for (const t of TRANSFORM_TOOLS) {
    const text = transformToolText(t, 'Kick');
    assert.ok(text.title.length > 20 && text.label.length > 8, t.id);
    assert.ok(t.icon.length === 1, `${t.id} is an icon, not a word`);
  }
  // wording the driver used: shift = every instrument, rotate = the selected one; counter-clockwise / clockwise
  assert.match(transformToolText(TRANSFORM_TOOLS[0], 'Kick').title, /shift left/i);
  assert.match(transformToolText(TRANSFORM_TOOLS[0], 'Kick').title, /every instrument/i);
  assert.match(transformToolText(TRANSFORM_TOOLS[3], 'Kick').title, /counter-clockwise/i);
  assert.match(transformToolText(TRANSFORM_TOOLS[4], 'Kick').title, /clockwise/i);
  assert.match(transformToolText(TRANSFORM_TOOLS[3], 'Kick').label, /Kick/);
  assert.doesNotMatch(transformToolText(TRANSFORM_TOOLS[0], 'Kick').title, /Kick/, 'an all-instruments control never names one');
  assert.doesNotMatch(transformToolText(TRANSFORM_TOOLS[3], 'Kick').title, /\bring\b/i, 'one noun for both views: instrument, not ring or row');
});

test('§4 applyTransform: shift moves EVERY row, mirror reverses EVERY row, rotate turns ONLY the selected one — one function both views use', { skip }, () => {
  const { applyTransform, rotatePattern, mirrorPattern } = pureCore();
  const p = JSON.parse(JSON.stringify(ROCK.channels));
  const rows = Object.keys(p);
  assert.deepEqual(applyTransform('shiftLeft', p, rows, 16, 'snare'), rotatePattern(p, rows, 16, -1));
  assert.deepEqual(applyTransform('shiftRight', p, rows, 16, 'snare'), rotatePattern(p, rows, 16, 1));
  assert.deepEqual(applyTransform('mirror', p, rows, 16, 'snare'), mirrorPattern(p, rows, 16));
  const ccw = applyTransform('rotateCcw', p, rows, 16, 'snare');
  assert.deepEqual(ccw.snare, rot(p.snare, -1));
  assert.deepEqual(ccw.kick, p.kick); assert.deepEqual(ccw.hihat, p.hihat);
  const cw = applyTransform('rotateCw', p, rows, 16, 'snare');
  assert.deepEqual(cw.snare, rot(p.snare, 1));
  assert.deepEqual(applyTransform('rotateCcw', cw, rows, 16, 'snare'), p, 'cw then ccw is the identity');
  assert.deepEqual(applyTransform('mirror', applyTransform('mirror', p, rows, 16, 'x'), rows, 16, 'x'), p, 'mirror is its own inverse');
  assert.deepEqual(applyTransform('nonsense', p, rows, 16, 'snare'), p, 'an unknown id changes nothing');
  assert.deepEqual(applyTransform('rotateCw', p, rows, 16, 'bell'), p, 'a selection that is not a row changes nothing');
  assert.deepEqual(p, JSON.parse(JSON.stringify(ROCK.channels)), 'the input is left alone');
});

test('§4 selectedRowOf: the chosen row if it is one of the rows, else the first (a removed or unknown selection falls back)', { skip }, () => {
  const { selectedRowOf } = pureCore();
  assert.equal(selectedRowOf(['kick', 'snare'], 'snare'), 'snare');
  assert.equal(selectedRowOf(['kick', 'snare'], 'bell'), 'kick');
  assert.equal(selectedRowOf(['kick', 'snare'], null), 'kick');
  assert.equal(selectedRowOf([], 'kick'), undefined);
});

// ---- §4/§5 the DOM: ONE toolbar, the same in both views ------------------------------------------------------------------------------

test('§4 ONE TOOLBAR: Add instrument first, then the five, in that order — in GRID', { skip }, async () => {
  const h = await loaded(ROCK);
  const bar = h.el('rhythmTools');
  assert.ok(bar, 'the toolbar exists');
  assert.equal(bar.getAttribute('role'), 'toolbar');
  const ids = [...bar.querySelectorAll('select, button')].filter((e: any) => shown(e)).map((e: any) => e.id);
  assert.deepEqual(ids, ['addInstrument', ...FIVE], 'grid: Add instrument, then exactly the five (no circle extras)');
  assert.equal(h.el('gridView').hidden, false);
});

test('§4 ONE TOOLBAR: in CIRCLE the same six come first, in the same order, then the circle-only extras (Move ring out / in, Shape, the ring chips)', { skip }, async () => {
  const h = await loaded(ROCK);
  await press(h, 'bViewCircle');
  const bar = h.el('rhythmTools');
  const ids = [...bar.querySelectorAll('select, button')].filter((e: any) => shown(e)).map((e: any) => e.id || `chip:${e.getAttribute('data-ring')}`);
  assert.deepEqual(ids, ['addInstrument', ...FIVE, 'bRingOut', 'bRingIn', 'bShape', 'chip:kick', 'chip:snare', 'chip:hihat']);
});

test('§4 IDENTICAL: each of the five is the SAME element with the same icon, tooltip, aria-label and enabled state in Grid and in Circle', { skip }, async () => {
  const h = await loaded(ROCK);
  const inGrid = ['addInstrument', ...FIVE].map((id) => snapshot(h, id));
  const gridEls = ['addInstrument', ...FIVE].map((id) => h.el(id));
  await press(h, 'bViewCircle');
  const inCircle = ['addInstrument', ...FIVE].map((id) => snapshot(h, id));
  assert.deepEqual(inCircle, inGrid, 'nothing about the six differs between the views');
  assert.ok(['addInstrument', ...FIVE].every((id, i) => h.el(id) === gridEls[i]), 'literally the same elements (one source of truth, nothing to drift)');
  await press(h, 'bViewGrid');
  assert.deepEqual(['addInstrument', ...FIVE].map((id) => snapshot(h, id)), inGrid, 'and back again');
  for (const s of inGrid) assert.ok(s.shown, `${s.id} is on screen`);
});

test('§4 GENERATED FROM THE DEFINITION: every control\'s icon, tooltip and aria-label is what TRANSFORM_TOOLS + transformToolText say (nothing hand-written in the page)', { skip }, async () => {
  const { TRANSFORM_TOOLS, transformToolText } = pureCore();
  const h = await loaded(ROCK);
  for (const t of TRANSFORM_TOOLS) {
    const b = h.el(t.domId);
    const want = transformToolText(t, 'Kick');                       // Kick is the first row, so the default selection
    assert.equal(b.textContent.trim(), t.icon, t.id);
    assert.equal(b.getAttribute('title'), want.title, t.id);
    assert.equal(b.getAttribute('aria-label'), want.label, t.id);
  }
  // the static markup does not carry the five (they would be a second, drifting copy)
  const staticMarkup = widgetHtml.slice(0, widgetHtml.indexOf('<script>'));
  for (const id of FIVE) assert.doesNotMatch(staticMarkup, new RegExp(`id="${id}"`), `${id} is generated, not typed into the page`);
});

test('§4 NO SECOND COPIES: the grid\'s own Mirror button and the circle\'s own Add instrument are gone (one control each, ids unique)', { skip }, async () => {
  const h = await loaded(ROCK);
  assert.ok(h.el('bMirrorGrid') === null, 'no #bMirrorGrid');
  assert.ok(h.el('addInstrumentCircle') === null, 'no #addInstrumentCircle');
  assert.equal(h.doc.querySelectorAll('select[aria-label="Add instrument"]').length, 1);
  assert.equal(h.doc.querySelectorAll('.add-row, .circle-tools').length, 0, 'the old per-view toolbars are gone');
  const all = [...h.doc.querySelectorAll('[id]')].map((e: any) => e.id);
  assert.equal(new Set(all).size, all.length, 'every id is unique');
});

// ---- grid selection: click a row's name -------------------------------------------------------------------------------------------

const pick = async (h: Harness, ch: string) => { h.doc.querySelector(`.channel-label .row-pick[data-row="${ch}"]`).click(); await tick(); };
const selectedRows = (h: Harness) => [...h.doc.querySelectorAll('.channel-label .row-pick')].filter((b: any) => b.getAttribute('aria-pressed') === 'true').map((b: any) => b.getAttribute('data-row'));

test('§4 GRID SELECTION: every row\'s name is a button; the FIRST row is selected by default; clicking another selects it (one at a time)', { skip }, async () => {
  const h = await loaded(ROCK);
  const picks = [...h.doc.querySelectorAll('.channel-label .row-pick')];
  assert.deepEqual(picks.map((b: any) => b.getAttribute('data-row')), ['kick', 'snare', 'hihat']);
  assert.deepEqual(picks.map((b: any) => b.textContent.trim()), ['Kick', 'Snare', 'Hi-hat']);
  for (const b of picks) assert.ok((b as any).getAttribute('title') && (b as any).tagName === 'BUTTON');
  assert.deepEqual(selectedRows(h), ['kick']);
  await pick(h, 'hihat');
  assert.deepEqual(selectedRows(h), ['hihat']);
  await pick(h, 'snare');
  assert.deepEqual(selectedRows(h), ['snare']);
});

test('§4 GRID: rotate counter-clockwise / clockwise turn ONLY the selected row, one step, through the single save path; the others stay byte-identical', { skip }, async () => {
  const h = await loaded(ROCK);
  await pick(h, 'snare');
  h.posted.length = 0;
  await press(h, 'bRingRotRight');
  let saved = lastSave(h)!;
  assert.deepEqual(saved.channels.snare, rot(ROCK.channels.snare, 1));
  assert.deepEqual(saved.channels.kick, ROCK.channels.kick);
  assert.deepEqual(saved.channels.hihat, ROCK.channels.hihat);
  await press(h, 'bRingRotLeft');
  saved = lastSave(h)!;
  assert.deepEqual(saved, ROCK, 'cw then ccw puts the note back exactly');
  assert.equal(types(h, 'forge-rhythm-save').length, 2, 'each press is one save');
});

test('§4 GRID: shift left / right and mirror act on EVERY row (and need no selection)', { skip }, async () => {
  const h = await loaded(ROCK);
  await press(h, 'bRotLeft');
  const left = lastSave(h)!;
  for (const ch of Object.keys(ROCK.channels)) assert.deepEqual((left.channels as any)[ch], rot((ROCK.channels as any)[ch], -1), `shift left: ${ch}`);
  await press(h, 'bRotRight');
  assert.deepEqual(lastSave(h), ROCK);
  await press(h, 'bMirror');
  const m = lastSave(h)!;
  for (const ch of Object.keys(ROCK.channels)) assert.deepEqual((m.channels as any)[ch], [...(ROCK.channels as any)[ch]].reverse(), `mirror: ${ch}`);
});

test('§4 SELECTION IS ONE STATE: a row picked in Grid is the ring selected in Circle (and back), and the shape follows it', { skip }, async () => {
  const h = await loaded(ROCK);
  await pick(h, 'hihat');
  await press(h, 'bViewCircle');
  assert.deepEqual([...h.doc.querySelectorAll('#ringLegend .ring-pick')].filter((b: any) => b.getAttribute('aria-pressed') === 'true').map((b: any) => b.getAttribute('data-ring')), ['hihat']);
  assert.equal(h.doc.querySelector('polygon.shape')?.getAttribute('data-ring'), 'hihat');
  h.doc.querySelector('#ringLegend .ring-pick[data-ring="kick"]').click(); await tick();
  await press(h, 'bViewGrid');
  assert.deepEqual(selectedRows(h), ['kick']);
});

test('§4 THE SAME TEXT IN BOTH VIEWS: the rotate buttons name the selected instrument, wherever it was picked', { skip }, async () => {
  const h = await loaded(ROCK);
  await pick(h, 'snare');
  assert.match(h.el('bRingRotLeft').getAttribute('title'), /Snare/);
  assert.match(h.el('bRingRotRight').getAttribute('aria-label'), /Snare/);
  const gridText = [h.el('bRingRotLeft').getAttribute('title'), h.el('bRingRotRight').getAttribute('aria-label')];
  await press(h, 'bViewCircle');
  assert.deepEqual([h.el('bRingRotLeft').getAttribute('title'), h.el('bRingRotRight').getAttribute('aria-label')], gridText);
});

test('§4 a removed selected row falls back to the first row (the buttons never point at nothing)', { skip }, async () => {
  const h = await loaded(ROCK);
  await pick(h, 'hihat');
  h.doc.querySelector('.channel-label .mini-btn.remove[data-remove="hihat"]').click(); await tick();
  // hi-hat has hits, and this is a hosted EDIT note: removing it asks first
  assert.equal(h.el('confirmBar').hidden, false);
  h.el('confirmOk').click(); await tick();
  assert.deepEqual(selectedRows(h), ['kick']);
  assert.match(h.el('bRingRotLeft').getAttribute('title'), /Kick/);
});

test('§4 selection is not data: picking a row posts nothing and changes nothing in the note', { skip }, async () => {
  const h = await loaded(ROCK);
  h.posted.length = 0;
  await pick(h, 'snare');
  await press(h, 'bViewCircle');
  await press(h, 'bViewGrid');
  assert.deepEqual(types(h, 'forge-rhythm-save'), []);
  assert.deepEqual(types(h, 'forge-rhythm-edited'), []);
});

// ---- §5 Add instrument ----------------------------------------------------------------------------------------------------------------

test('§5 ADD INSTRUMENT: one menu, offering the channels not shown yet; choosing one adds the row in Grid and the ring in Circle (one path)', { skip }, async () => {
  const h = await loaded(ROCK);
  const sel = h.el('addInstrument');
  assert.deepEqual([...sel.options].map((o: any) => o.value), ['', 'bell', 'claves', 'conga_high', 'conga_low']);
  sel.value = 'bell'; sel.dispatchEvent(new h.win.Event('change')); await tick();
  assert.deepEqual(Object.keys(lastSave(h)!.channels), ['kick', 'snare', 'hihat', 'bell']);
  assert.ok(h.doc.querySelector('.channel-row [data-channel="bell"]'));
  await press(h, 'bViewCircle');
  assert.equal(h.doc.querySelectorAll('#circle g.cell[data-channel="bell"]').length, 16, 'the bell ring is drawn');
});

test('§5 ADD INSTRUMENT at the circle\'s four-ring limit: DISABLED in Circle with the reason (not hidden, not a silent no-op), ENABLED in Grid (which has no limit)', { skip }, async () => {
  const four = { ...ROCK, channels: { ...ROCK.channels, bell: new Array(16).fill(false) } };
  const h = await loaded(four);
  const sel = h.el('addInstrument');
  assert.equal(sel.disabled, false, 'grid: no limit');
  await press(h, 'bViewCircle');
  assert.equal(sel.disabled, true);
  assert.match(sel.getAttribute('title'), /up to 4 instruments/i);
  assert.ok(shown(sel), 'visible, so the reason can be read');
  await press(h, 'bViewGrid');
  assert.equal(sel.disabled, false);
  assert.doesNotMatch(sel.getAttribute('title'), /up to 4/i);
});

// ---- §1 (widget half): Reset and the reminder belong to the host's toolbar when it says so --------------------------------------------

const host = (h: Harness) => ({ bar: h.el('hostBar'), label: h.el('playgroundLabel'), reset: h.el('bReset') });

test('§1 resetInHost: a playground load draws NO host bar at all — no note name, no "edits are not saved" label, no Reset (the host\'s toolbar has them)', { skip }, async () => {
  const h = await loaded(ROCK, { mode: 'playground', resetInHost: true });
  const { bar, label, reset } = host(h);
  assert.ok(bar.hidden, 'the whole bar is gone: one row instead of two');
  assert.ok(label.hidden && reset.hidden);
  assert.ok(!shown(reset) && !shown(label));
});

test('§1 WITHOUT the flag (an older plugin) the widget draws its own label and Reset exactly as before — and Reset still works and still tells the host', { skip }, async () => {
  const h = await loaded(ROCK, { mode: 'playground' });
  const { bar, label, reset } = host(h);
  assert.equal(bar.hidden, false);
  assert.equal(label.hidden, false);
  assert.match(label.textContent, /Playground.*edits are not saved/);
  assert.equal(reset.hidden, false);
  await press(h, 'bRotLeft');
  h.posted.length = 0;
  reset.click(); await tick();
  assert.equal(types(h, 'forge-rhythm-reset').length, 1, 'the host is still asked to re-read the note');
});

test('§1 resetInHost must be the EXACT boolean true, and applies to a playground only: a truthy string or an edit-mode note keeps its bar', { skip }, async () => {
  for (const flag of ['true', 1, 'yes', null]) {
    const h = await loaded(ROCK, { mode: 'playground', resetInHost: flag });
    assert.equal(host(h).bar.hidden, false, `resetInHost: ${JSON.stringify(flag)}`);
    assert.equal(host(h).reset.hidden, false);
  }
  const edit = await loaded(ROCK, { resetInHost: true });
  assert.equal(host(edit).bar.hidden, false, 'an edited note still shows its name and the autosave status');
  assert.equal(edit.el('hostNote').textContent, 'rhythm_pattern_test');
});

test('§1 the flag is per LOAD: a later load without it brings the bar back (a host that stopped saying so is believed)', { skip }, async () => {
  const h = await loaded(ROCK, { mode: 'playground', resetInHost: true });
  assert.ok(host(h).bar.hidden);
  await h.send(load(ROCK, { mode: 'playground' }));
  assert.equal(host(h).bar.hidden, false);
  assert.equal(host(h).reset.hidden, false);
  await h.send(load(ROCK, { mode: 'playground', resetInHost: true }));
  assert.ok(host(h).bar.hidden);
});

test('§1 a note the widget REFUSES still says why, even when the host owns Reset (the error must not vanish with the bar)', { skip }, async () => {
  const h = await loaded({ ...ROCK, tempo_bpm: 5000 }, { mode: 'playground', resetInHost: true });
  assert.equal(host(h).bar.hidden, false);
  assert.match(h.el('loadMsg').textContent, /Could not load this note/);
});

test('§1 the host\'s Reset message path is unchanged: a fresh load after edits puts the note back, and nothing is saved by it', { skip }, async () => {
  const h = await loaded(ROCK, { mode: 'playground', resetInHost: true });
  await press(h, 'bRotLeft');
  assert.deepEqual(types(h, 'forge-rhythm-save'), [], 'a playground never saves');
  await h.send(load(ROCK, { mode: 'playground', resetInHost: true }));
  assert.equal(h.cell('kick', 0).classList.contains('on'), true, 'kick is on step 0 again');
  assert.deepEqual(types(h, 'forge-rhythm-save'), []);
});

// ---- a `hidden` element must not be DISPLAYED (BUG found by the real-Chromium measurement of this drain) ----------------------------------------
// `.host-bar { display: flex }` beat the browser's `[hidden] { display: none }` (an author rule always beats the user-agent's), so the host bar was drawn
// — a stray "Editing" row — in the standalone widget and before any load, and `$("hostBar").hidden = true` (what resetInHost does) could not hide it.
// The property, not the spelling: every element the page ships or sets `hidden` on must COMPUTE to display: none.

test('BUG: every element that is `hidden` computes display: none — in the standalone page and after each kind of load (the host bar used to stay displayed)', { skip }, async () => {
  const offenders = async (h: Harness, label: string) => {
    const out: string[] = [];
    for (const el of h.doc.querySelectorAll('[hidden]') as any) {
      if (h.win.getComputedStyle(el).display !== 'none') out.push(`${label}: #${el.id || el.className} is hidden but displayed (${h.win.getComputedStyle(el).display})`);
    }
    return out;
  };
  const standalone = await loadWidget(false);
  assert.deepEqual(await offenders(standalone, 'standalone'), []);
  const before = await loadWidget(true);
  assert.deepEqual(await offenders(before, 'host, before the load'), []);
  const playground = await loaded(ROCK, { mode: 'playground', resetInHost: true });
  assert.deepEqual(await offenders(playground, 'playground + resetInHost'), []);
  assert.ok(playground.doc.querySelectorAll('[hidden]').length > 3, 'NON-VACUITY: there are hidden elements to check');
});
