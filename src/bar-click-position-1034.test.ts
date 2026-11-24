// 2026-11-24-1034 - a click on a bar of a PHRASE Score writes the bar's POSITION (the words the phrase grammar uses: `bar 6`, or just `6` after `bar `/`bars `/`to `/`and `), not the one source link every bar of an Extend shares (`[[bar_007]]`), and it writes in an EMPTY
// composer too (and still pins). The driver, music-playground / phrase_001: "whatever bar I click I see [[bar_007]], and only when the composer is not empty". This file pins (A) the pure rule (`barClickText`: what the text before the caret ends with), (B) the click end to end on the REAL phrase
// tab + REAL composer of a 12-bar phrase made by ONE Extend (happy-dom), (C) the native-undo step the click leaves (the text goes in through the field's own `insertText`, so Cmd/Ctrl+Z takes it away in ONE step; a plain `value =` leaves nothing to undo: measured in Chromium).
// Written RED first. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { barClickText } from './duplicate-sentence-core.ts';
import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { installHostClock } from './test-support/host-workspace.ts';
import { planNewBar } from './score-first-core.ts';

// ---- (A) the pure rule -------------------------------------------------------------------------------------------------------------------------------------------------------------------
const W = (before: string, bar: number | null, link: string | null = 'bar_007', hasHead = true) => barClickText(before, bar, link, hasHead);
test('A1: the NUMBER only after `bar `, `bars `, `to ` (a range) and `and ` (Mix and Morph bars); a space is added unless the caret follows a space, a bracket or the start of the text', () => {
  for (const [before, text] of [['Copy bar ', '6'], ['copy bar ', '6'], ['COPY BAR ', '6'], ['Copy bar', ' 6'], ['Delete bars ', '6'], ['Copy bars 3 to ', '6'], ['Copy Bars 3 TO ', '6'], ['Mix bars 2 and ', '6'], ['Morph bars 2 and ', '6'], ['Copy bars 3 to 5. Delete bar ', '6'], ['Copy\nDelete bar ', '6']] as const)
    assert.deepEqual(W(before, 6), { text }, JSON.stringify(before));
});
test('A2: anything else writes `bar K` (the grammar\'s own words: Copy bar 6., Delete bar 2., Move bar 4 ...): an empty text, a verb, a direction, another sentence; after a bar reference `and bar K`; `and ` after Keep/Delete/Copy/Move needs `bar` too ("and 8" is not grammar)', () => {
  for (const [before, text] of [['', 'bar 6'], ['Copy', ' bar 6'], ['Copy ', 'bar 6'], ['Please look at', ' bar 6'], ['Foo', ' bar 6'], ['Make it 8 bars long.', ' bar 6'], ['Make it 8 bars long. ', 'bar 6'], ['Foo\n', 'bar 6'], ['Move bar 4 back', ' bar 6'], ['Delete bar 3', ' and bar 6'], ['Delete bar 3 and bar 5', ' and bar 6'], ['Keep bars 3 to 5', ' and bar 6'], ['Keep bars 3 to 5 and ', 'bar 6'], ['Delete bar 3 and ', 'bar 6'], ['Extend [[bar_005]] to ', 'bar 6'], ['(', 'bar 6']] as const)
    assert.deepEqual(W(before, 6), { text }, JSON.stringify(before));
});
test('A3: the SOURCE link after `replaced by` (and where the line needs a link: Take, and the head verbs Extend, Mix and Morph while the phrase has no head line); the link keeps its space rule; the LAST sentence decides', () => {
  for (const [before, hasHead, text] of [['Bar 3 is replaced by ', true, '[[bar_007]]'], ['Bar 3 is replaced by', true, ' [[bar_007]]'], ['bar 3 is REPLACED BY ', true, '[[bar_007]]'], ['Take ', true, '[[bar_007]]'], ['Take', true, ' [[bar_007]]'], ['Extend ', false, '[[bar_007]]'], ['Mix ', false, '[[bar_007]]'], ['Morph [[bar_005]] into ', false, '[[bar_007]]'], ['Extend [[bar_005]] to 8 bars. Take ', true, '[[bar_007]]'], ['Copy bar 3. Bar 4 is replaced by ', true, '[[bar_007]]']] as const)
    assert.deepEqual(W(before, 6, 'bar_007', hasHead), { text }, JSON.stringify([before, hasHead]));
  assert.deepEqual(W('Extend ', 6, 'bar_007', true), { text: 'bar 6' }, 'with a head line Extend is a bar step: Extend bar 6 to 4 bars');
  assert.deepEqual(W('Extend [[bar_005]] to 8 bars. ', 6, 'bar_007', false), { text: 'bar 6' }, 'the last sentence is a new one: it does not open with a head verb');
});
test('A4: what is missing is said: a number the Score could not tell, a link the bar has none of; nothing is guessed', () => {
  for (const bad of [null, 0, -1, 2.5, NaN, Infinity, '3', undefined] as unknown[]) assert.deepEqual(W('Copy bar ', bad as never), { need: 'bar' }, String(bad));
  assert.deepEqual(W('Bar 3 is replaced by ', 6, null), { need: 'link' }); assert.deepEqual(W('Take ', null, null), { need: 'link' }, 'a link click needs no number');
  assert.deepEqual(W('Take ', null, 'bar_007'), { text: '[[bar_007]]' });
});

// ---- (B) the click, end to end ------------------------------------------------------------------------------------------------------------------------------------------------------------
const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const xmlFor = (bars: number) => `<score-partwise><part id="P1">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part></score-partwise>`;
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
/** ONE Extend of the one source bar: every bar of the Score has the same provenance note (bars/bar_007). */
const TWELVE: PhraseParams = { kind: 'extend', source: 'bar_007', bars: 12, style: 'repeat_with_fills', tempo_change_pct: 0 };

async function rig(opts: { emptyHost?: boolean } = {}) {
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_001.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_007.md', BAR], [notePath, noteContentFor('phrase_001', TWELVE)]]);
  const pins: unknown[] = []; const timers: Array<() => void> = []; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = []; const traces: string[] = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    create: async (p: string, c: string) => { files.set(p, c); }, exists: (p: string) => files.has(p), isAlreadyExists: () => false,
  }, {}));
  const off = registerBarSelectionHost({
    appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }),
    duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar),
    ...(opts.emptyHost === false ? {} : { duplicateEmpty: (p: string) => ctl.duplicateEmpty(p) }),
  } as never);
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_001', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (_d: any, params: any) => { const bars = Array.from({ length: params.bars ?? 12 }, (_, i) => barOf(i)); return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars }; },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {}, setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: (p: unknown) => { pins.push(p); } },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load(); await clock.advance(400);
  panes.push({ path: notePath, contentEl: parent, tab: true }); await ctl.inspect(notePath); for (let i = 0; i < 240; i++) await Promise.resolve();
  const bars = () => [...parent.querySelectorAll('g.measure')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const field = () => parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); await clock.advance(20); };
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const suggestion = () => [...parent.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  return { handle, parent, files, pins, bars, click, field, type, press, flush, suggestion, notePath, ctl, traces, done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); delete win.document.execCommand; } };
}

test('B1: a 12-bar phrase made by ONE Extend: after an empty text a click on bars 1, 6 and 12 writes `bar 1`, `bar 6`, `bar 12` (not the one source link bar_007 they all share), after `Copy bar ` it writes `6`, the focus stays in the field', async () => {
  const r = await rig();
  try {
    assert.equal(r.bars().length, 12);
    for (const k of [1, 6, 12]) { r.type('Please look at'); r.click(r.bars()[k - 1]); await r.flush(); assert.equal(r.field().value, `Please look at bar ${k}`, `bar ${k}`); assert.ok(win.document.activeElement === r.field(), 'focus in the field'); }
    for (const k of [1, 6, 12]) { r.type('Copy bar '); r.click(r.bars()[k - 1]); await r.flush(); assert.equal(r.field().value, `Copy bar ${k}`, `bar ${k}`); }
    r.type('Copy bars 3 to '); r.click(r.bars()[4]); await r.flush(); assert.equal(r.field().value, 'Copy bars 3 to 5');
    assert.deepEqual(r.pins, [], 'a click that writes into a composer with text pins nothing (1023)');
    assert.ok(![...r.field().value].join('').includes('[['), 'no link');
  } finally { r.done(); }
});

test('B2: `Bar 3 is replaced by ` then a click writes the source link of the bar (the one thing a position cannot say); `Take ` too', async () => {
  const r = await rig();
  try {
    r.type('Bar 3 is replaced by '); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, 'Bar 3 is replaced by [[bar_007]]');
    r.type('Take'); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, 'Take [[bar_007]]');
    assert.deepEqual(r.pins, []);
  } finally { r.done(); }
});

test('B3: an EMPTY composer: the click writes `bar K` AND still pins the bar, as today (both happen)', async () => {
  const r = await rig();
  try {
    for (const k of [1, 6, 12]) {
      r.type(''); const before = r.pins.length; r.click(r.bars()[k - 1]); await r.flush();
      assert.equal(r.field().value, `bar ${k}`, `bar ${k}`); assert.equal(r.pins.length, before + 1, `bar ${k}: pinned once as ever`); assert.ok(win.document.activeElement === r.field(), 'focus in the field');
    }
    r.type('   '); const n = r.pins.length; r.click(r.bars()[2]); await r.flush(); assert.equal(r.field().value, '   bar 3', 'blank text counts as empty: the caret follows a space'); assert.equal(r.pins.length, n + 1);
  } finally { r.done(); }
});

test('B4: Shift, Ctrl and Cmd clicks NEVER write, with an empty composer or with text (they are the selection gestures)', async () => {
  const r = await rig();
  try {
    for (const text of ['', 'Copy bar ']) for (const mod of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }]) { r.type(text); r.click(r.bars()[5], mod); await r.flush(); assert.equal(r.field().value, text, `${text || 'empty'} + ${Object.keys(mod)[0]}`); }
  } finally { r.done(); }
});

test('B5: a host that does not know the empty-composer port keeps today\'s empty click (pin only): the port is optional', async () => {
  const r = await rig({ emptyHost: false });
  try { r.type(''); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, ''); assert.equal(r.pins.length, 1); r.type('Copy bar '); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, 'Copy bar 6'); } finally { r.done(); }
});

test('B6: the written text is a real sentence: click bar 6 after `Copy bar `, Enter previews `Copy bar 6.`, the second Enter writes ONE line', async () => {
  const r = await rig();
  try {
    r.type('Copy bar '); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, 'Copy bar 6');
    await r.press({ key: 'Enter' }); assert.match(r.suggestion(), /Copy bar 6\./); await r.press({ key: 'Enter' });
    assert.match(r.files.get(r.notePath)!, /Copy bar 6\./);
  } finally { r.done(); }
});

test('B7: a click with no usable number inserts nothing in an empty composer (and still pins); in a text that needs a number it says so in words', async () => {
  const r = await rig();
  try {
    const none = await r.ctl.duplicateClick(r.notePath, 'bars/bar_007', null); assert.equal(none.ok, false); assert.equal(r.field().value, '');
    r.type('Copy bar '); const bad = await r.ctl.duplicateClick(r.notePath, 'bars/bar_007', 0); assert.deepEqual(bad, { ok: false, message: 'I cannot tell which bar that is, so I cannot write its number.' }); assert.equal(r.field().value, 'Copy bar ');
    r.type('Bar 3 is replaced by '); const nolink = await r.ctl.duplicateClick(r.notePath, null, 4); assert.deepEqual(nolink, { ok: false, message: 'I cannot tell which note made that bar, so I cannot copy it.' });
    assert.equal(r.ctl.duplicateEmpty('phrases/phrase_777.md'), false, 'no composer open: no');
    r.type(''); assert.equal(r.ctl.duplicateEmpty(r.notePath), true); r.type('x'); assert.equal(r.ctl.duplicateEmpty(r.notePath), false);
  } finally { r.done(); }
});

// ---- (C) the undo step --------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** What Chromium does for `document.execCommand('insertText')` on the focused textarea: replace the selection, fire `input`, push ONE undo step; `undo` takes it back (and fires `input`). */
function fakeExecCommand() {
  const calls: Array<[string, string | undefined]> = []; const stack: Array<{ ta: any; value: string }> = [];
  win.document.execCommand = (cmd: string, _ui?: boolean, val?: string) => {
    calls.push([cmd, val]); const ta: any = win.document.activeElement;
    if (cmd === 'insertText' && ta?.tagName === 'TEXTAREA') { stack.push({ ta, value: ta.value }); ta.setRangeText(String(val), ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new win.Event('input', { bubbles: true })); return true; }
    if (cmd === 'undo') { const s = stack.pop(); if (s === undefined) return false; s.ta.value = s.value; s.ta.dispatchEvent(new win.Event('input', { bubbles: true })); return true; }
    return false;
  };
  return calls;
}
test('C1: the click writes through the field\'s own `insertText` (ONE native undo step) and the composer\'s state follows the field: the empty composer\'s `bar 6` goes away with one undo, and an Enter after a click previews the sentence', async () => {
  const calls = fakeExecCommand(); const r = await rig();
  try {
    r.type(''); r.click(r.bars()[5]); await r.flush();
    assert.deepEqual(calls, [['insertText', 'bar 6']]); assert.equal(r.field().value, 'bar 6');
    assert.equal(win.document.execCommand('undo'), true); await r.flush(); assert.equal(r.field().value, '', 'one undo takes the clicked text away');
    r.type('Copy bar '); r.click(r.bars()[5]); await r.flush(); assert.equal(r.field().value, 'Copy bar 6');
    await r.press({ key: 'Enter' }); assert.match(r.suggestion(), /Copy bar 6\./, 'the composer\'s own state saw the inserted text');
  } finally { r.done(); }
});
