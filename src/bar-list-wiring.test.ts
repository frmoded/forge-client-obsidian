// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the REAL controller + composer + dialog, with the REAL Beat Box page (rhythm_box.html, run in happy-dom) behind the real Beat Box state machine (bar-box-host-core.ts), on an in-memory vault. Written RED first
// against the controller of HEAD (a bar was not a list family: appendLine refused it, the composer never mounted on its tab, a hand edit of `lines:` was never heard). Pinned here, every action COUNTED (ONE `process` call and ONE write per gesture):
//   * a Beat Box click, a transform, tempo, swing, a grid change, an added or removed channel = ONE line = ONE write = ONE undo; the first write of an unlisted bar synthesizes the head; a new bar starts with an empty list;
//   * a cell said again REPLACES that cell's mention (a hit and a clear of the same cell leave nothing behind); tempo replaces in place; a drag across 8 cells is one line and one undo (the gesture key);
//   * the grid is redrawn from the replay when a gesture could not be written; OPENING WRITES NOTHING (the controller, the composer, the Beat Box);
//   * the composer takes the bar grammar (preview, then Enter), never asks the sentence service, undoes with Cmd/Ctrl+Z in the empty composer and from the "+" menu, redoes with Shift;
//   * a hand edit of `lines:` is followed (the lines before the first unreadable one; named in plain muted words, no red; with NO readable line nothing is written); an edit of the json outside the list wins and the list starts again from it;
//   * P3: every note that is not a listed bar (every playground bar never edited, a phrase, an arrangement, a composition, a kit, a rhythm pattern of the library) is byte for byte what it was.
// A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { createBarBoxHost, SWING_QUIET_MS, type BarBoxHost } from './bar-box-host-core.ts';
import { barLinesBlock, inspectBarNote, readBarLines, withBarLines, writeBarNote } from './bar-list-note-core.ts';
import { baselineList, replayBar } from './bar-list-core.ts';
import { headSentence } from './bar-grammar-core.ts';
import { buildLoadMessage, extractJsonBlock, formatRhythmJson, readRhythmNote, rhythmDataEqual, type RhythmData } from './rhythm-edit-core.ts';
import { planNewBar } from './score-first-core.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { newKitNote } from './kit-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import { widgetHtml, skip as widgetSkip } from './test-support/rhythm-widget-harness.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BAR_PATH = 'bars/bar_001.md';
const BAR_001 = PLAYGROUND_BARS['bar_001'];
const dataOf = (t: string): RhythmData => { const r = readRhythmNote(t); assert.equal(r.ok, true, JSON.stringify(r)); return (r as { value: { data: RhythmData } }).value.data; };
const fence = (t: string): string => { const b = extractJsonBlock(t) as Extract<ReturnType<typeof extractJsonBlock>, { ok: true }>; return t.slice(b.contentStart, b.contentEnd); };
const json = (d: RhythmData): string => formatRhythmJson(d);
const newBarText = (): string => { const p = planNewBar({ existingBasenames: [], exists: () => false }); return (p as { content: string }).content; };

interface RigOpts { note?: string; path?: string; extra?: Record<string, string>; service?: boolean; refuseWrites?: boolean }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? BAR_PATH;
  const store = new Map<string, string>([[path, opts.note ?? BAR_001], ...Object.entries(opts.extra ?? {})]);
  const writes: string[] = []; let processCalls = 0; let serviceCalls = 0; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { if (opts.refuseWrites) throw new Error('disk full'); store.set(p, next); writes.push(p); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    ...(opts.service === true ? { askPlan: async () => { serviceCalls++; return { status: 200, json: {} }; }, configured: () => true } : {}),
    composerMenu: () => ({ items: [{ id: 'new_bar', label: 'New bar' }], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const undoKey = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  const runTimers = async () => { const t = timers.splice(0); for (const fn of t) fn(); await flush(); };
  const text = () => store.get(path)!;
  const lines = () => readBarLines(text())?.lines ?? [];
  const entries = () => dialogEntries(el);
  const menuItems = () => [...el.querySelectorAll('.forge-composer-menuitem')] as HTMLElement[];
  const openMenu = async () => { const plus = el.querySelector('.forge-composer-plus') as HTMLElement; if ((el.querySelector('.forge-composer-menu') as HTMLElement).hidden === false) { plus.click(); await flush(); } plus.click(); await flush(); };
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const hand = async (next: string) => { store.set(path, next); ctl.modified(path); await runTimers(); };
  return { ctl, store, writes, el, flush, field, type, enter, undoKey, runTimers, menuItems, openMenu, text, lines, entries, say, hand, path, timers, calls: () => processCalls, service: () => serviceCalls, ready: async () => { await ctl.inspect(path); await flush(); } };
}
type Rig = ReturnType<typeof rig>;
const empty = (r: Rig): boolean => r.field().value === '';

// ---- the real Beat Box page, behind the real Beat Box state machine ------------------------------------------------------------------------------------------------------------------------------

async function beatBox(r: Rig, opts: { gesturePath?: boolean } = {}) {
  void opts;
  const bwin: any = new Window({ url: 'http://localhost/' });
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const legacy: unknown[] = []; const current: RhythmData[] = []; let loads = 0; let box: BarBoxHost | null = null;
  const host = { postMessage: (m: any) => { const msg = JSON.parse(JSON.stringify(m)); onPost(msg); } };
  const sendToWidget = async (m: unknown) => { bwin.dispatchEvent(new bwin.MessageEvent('message', { data: m, source: host })); await new Promise((res) => setTimeout(res, 3)); };
  const noteBar = (): RhythmData => dataOf(r.text());
  const showNote = async (): Promise<void> => { const d = noteBar(); loads++; await sendToWidget(buildLoadMessage(d, 'bar_001', 'edit', null, true, false, false, [])); box?.loaded(d); };
  function onPost(msg: any): void {
    if (msg.type === 'forge-rhythm-ready') { void (async () => { await showNote(); })(); }
    else if (msg.type === 'forge-rhythm-save') box?.save(msg.data);
    else if (msg.type === 'forge-rhythm-current-data') current.push(msg.data);
  }
  Object.defineProperty(bwin, 'parent', { value: host, configurable: true });
  const m = /<script>([\s\S]*?)<\/script>/.exec(widgetHtml)!;
  bwin.document.write(widgetHtml.replace(m[0], ''));
  box = createBarBoxHost(noteBar(), {
    appendLine: (s) => r.ctl.appendLine(r.path, s),
    load: (d) => { loads++; void sendToWidget(buildLoadMessage(d, 'bar_001', 'edit', null, true, false, false, [])); },
    reload: async () => { await showNote(); },
    legacySave: (p) => { legacy.push(p); },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, warn: () => {},
  });
  bwin.eval(m[1]);
  await new Promise((res) => setTimeout(res, 15));
  const settle = async () => { await new Promise((res) => setTimeout(res, 10)); await r.flush(); await new Promise((res) => setTimeout(res, 5)); await r.flush(); };
  const cell = (ch: string, s: number): any => bwin.document.querySelector(`.step[data-channel="${ch}"][data-step="${s}"]`);
  const click = async (el: any) => { el.dispatchEvent(new bwin.MouseEvent('click', { bubbles: true })); await settle(); };
  const widgetBar = async (): Promise<RhythmData> => { current.length = 0; await sendToWidget({ type: 'forge-rhythm-request-data' }); return current[current.length - 1]; };
  const quiet = async () => { const t = timers.splice(0); for (const x of t) x.fn(); await settle(); };
  return { win: bwin, box: box!, cell, click, settle, widgetBar, quiet, legacy, loads: () => loads, el: (id: string) => bwin.document.getElementById(id), showNote, timers };
}

test('the Beat Box page (rhythm_box.html) is found, so none of the tests below can skip (a missing page is a failure, never a skip)', () => { assert.equal(widgetSkip, false, String(widgetSkip)); assert.ok(widgetHtml.length > 1000); });
const BAR_HEAD = headSentence(dataOf(BAR_001))!;

// ---- OPENING WRITES NOTHING ----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('OPENING WRITES NOTHING: looking at an unlisted bar, a listed bar and a new bar (the controller, the composer, the Beat Box page) makes no `process` call and no write', async () => {
  for (const note of [BAR_001, newBarText(), (await (async () => { const r = rig(); await r.ready(); await r.ctl.appendLine(r.path, 'Hit kick on step 3.'); return r.text(); })())]) {
    const r = rig({ note }); const before = r.text();
    await r.ready(); await r.ctl.inspectOpen(); r.ctl.syncBars(); await r.flush();
    assert.ok(r.field(), 'the composer mounted on the bar\'s Beat Box tab');
    assert.equal(r.calls(), 0); assert.deepEqual(r.writes, []); assert.equal(r.text(), before);
    r.ctl.modified(r.path);
    await r.runTimers();
    assert.equal(r.calls(), 0, 'a heard `modify` of an untouched bar writes nothing either');
  }
});
test('OPENING WRITES NOTHING (the Beat Box page): the page loads the note, and nothing is written until a gesture', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  assert.equal(bb.loads(), 1); assert.equal(r.calls(), 0); assert.equal(r.text(), BAR_001);
  assert.deepEqual((await bb.widgetBar()).channels.kick, dataOf(BAR_001).channels.kick, 'the grid is the bar');
});

// ---- ONE gesture = ONE line = ONE write = ONE undo ----------------------------------------------------------------------------------------------------------------------------------------

test('the FIRST gesture on an unlisted bar: ONE process call and ONE write; the head is synthesized, the click is the next line; the fence is the replay; everything else is the bar\'s own bytes', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  await bb.click(bb.cell('kick', 2));
  assert.equal(r.calls(), 1); assert.equal(r.writes.length, 1);
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.']);
  const expected = dataOf(BAR_001); expected.channels.kick[2] = true;
  assert.equal(fence(r.text()), json(expected));
  assert.equal(r.text().replace(barLinesBlock(r.text())! + '\n', '').replace(fence(r.text()), fence(BAR_001)), BAR_001, 'only `lines:` and the json fence changed');
  assert.ok(rhythmDataEqual(await bb.widgetBar(), expected), 'the grid shows what the list says');
  assert.equal(bb.loads(), 1, 'a write that is the grid does not redraw it');
});

test('three clicks: three process calls, three writes, three lines, and Cmd+Z three times in the composer takes them back one at a time, back to the bar as it was', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  await bb.click(bb.cell('kick', 2)); await bb.click(bb.cell('snare', 7)); await bb.click(bb.cell('kick', 8));
  assert.equal(r.calls(), 3); assert.equal(r.writes.length, 3);
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.', 'Hit snare on step 8.', 'Clear kick on step 9.']);
  const states = [dataOf(BAR_001)];
  const c1 = dataOf(BAR_001); c1.channels.kick[2] = true; const c2 = JSON.parse(JSON.stringify(c1)) as RhythmData; c2.channels.snare[7] = true; const c3 = JSON.parse(JSON.stringify(c2)) as RhythmData; c3.channels.kick[8] = false;
  assert.equal(fence(r.text()), json(c3));
  for (const want of [c2, c1, states[0]]) {
    const before = r.writes.length;
    await r.undoKey(); await bb.settle();
    assert.equal(r.writes.length, before + 1, 'one write per undo');
    assert.equal(fence(r.text()), json(want));
    assert.ok(rhythmDataEqual(dataOf(r.text()), want));
  }
  assert.deepEqual(r.lines(), [BAR_HEAD], 'the head stays: it IS the bar as it was');
  assert.equal(r.entries().filter((e) => e.kind === 'notice' && /^Removed:/.test(e.text)).length, 3);
  await r.undoKey(); assert.deepEqual(r.lines(), [BAR_HEAD], 'nothing more to take back');
});

test('undo and redo through the controller: redo puts the line back, one write each; a new gesture clears redo', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  await bb.click(bb.cell('kick', 2)); await bb.click(bb.cell('snare', 7));
  const u = await r.ctl.undoLast(r.path); assert.equal(u.ok, true);
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.']);
  assert.equal(r.ctl.canRedo(r.path), true);
  const re = await r.ctl.redoLast(r.path); assert.equal(re.ok, true);
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.', 'Hit snare on step 8.']);
  await r.ctl.undoLast(r.path); await bb.settle();
  await bb.click(bb.cell('snare', 14));
  assert.equal(r.ctl.canRedo(r.path), false);
});

test('a NEW bar starts with an EMPTY list and the groove it has always had; the first click is line 1 (no head); Cmd+Z gives the groove back', async () => {
  const r = rig({ note: newBarText() }); await r.ready(); const bb = await beatBox(r);
  assert.deepEqual(r.lines(), []); assert.equal(r.calls(), 0);
  await bb.click(bb.cell('kick', 3));
  assert.deepEqual(r.lines(), ['Hit kick on step 4.']);
  await r.undoKey(); await bb.settle();
  assert.deepEqual(r.lines(), []);
  assert.deepEqual(dataOf(r.text()).channels.kick, dataOf(newBarText()).channels.kick);
});

test('a cell said again REPLACES the cell\'s mention: hit then clear leaves no line behind (one write each, and the list is shorter after the second)', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  await bb.click(bb.cell('kick', 2));
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.']);
  await bb.click(bb.cell('kick', 2));
  assert.deepEqual(r.lines(), [BAR_HEAD], 'the hit and the clear of one cell cancel');
  assert.equal(r.writes.length, 2); assert.equal(fence(r.text()), fence(BAR_001));
  await r.undoKey(); await bb.settle();
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.'], 'undo of the second click gives the first click\'s line back');
  await bb.click(bb.cell('kick', 0));                                     // a cell the HEAD set: the clear is a line (the head is the bar as it was)
  assert.equal(r.lines()[r.lines().length - 1], 'Clear kick on step 1.');
});

test('tempo replaces in place (the list does not grow), the swing slider is ONE line for a whole drag; a transform, a grid change, an added and a removed channel are one line each', async () => {
  const r = rig(); await r.ready(); const bb = await beatBox(r);
  await bb.click(bb.el('bBpmUp')); await bb.click(bb.el('bBpmUp'));
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Set the tempo to 120.'], 'the second click replaced the first line in place');
  assert.equal(r.writes.length, 2);
  const w = r.writes.length;
  for (const v of [5, 10, 15, 20]) { const s = bb.el('swing'); s.value = String(v); s.dispatchEvent(new bb.win.Event('input', { bubbles: true })); await bb.settle(); }
  assert.equal(r.writes.length, w, 'while the slider moves nothing is written');
  await bb.quiet();
  assert.equal(r.writes.length, w + 1, 'one write for the whole drag'); assert.equal(r.lines()[r.lines().length - 1], 'Set the swing to 20 percent.');
  assert.ok(bb.timers !== undefined);
  await bb.click(bb.cell('kick', 3));                                                  // an asymmetric bar: a mirror of the groove itself is also a shift, and the two would say the same thing
  await bb.click(bb.el('bRotLeft'));
  assert.equal(r.lines()[r.lines().length - 1], 'Shift every channel one step to the left.');
  await bb.click(bb.el('bMirror'));
  assert.equal(r.lines()[r.lines().length - 1], 'Mirror every channel.');
  const add = bb.el('addInstrument'); add.value = 'hihat'; add.dispatchEvent(new bb.win.Event('change', { bubbles: true })); await bb.settle();
  assert.equal(r.lines()[r.lines().length - 1], 'Add the channel hihat.');
  assert.ok(Object.keys(dataOf(r.text()).channels).includes('hihat'));
  const sel = bb.el('timeSig'); sel.value = '3/4'; sel.dispatchEvent(new bb.win.Event('change', { bubbles: true })); await bb.settle();
  await bb.click(bb.el('confirmOk'));
  assert.equal(r.lines()[r.lines().length - 1], 'Use 12 steps in 3/4.');
  assert.equal(dataOf(r.text()).steps, 12);
  assert.ok(rhythmDataEqual(await bb.widgetBar(), dataOf(r.text())), 'after eight kinds of gesture the grid is the replay');
  assert.deepEqual(replayBar(r.lines()).stop, null);
  // every write was ONE process call
  assert.equal(r.calls(), r.writes.length);
});

test('a drag across 8 cells is ONE line and ONE undo (the gesture key): eight appends of one pointer gesture, the list grows by one line, one Cmd+Z takes the whole drag back', async () => {
  const r = rig(); await r.ready();
  for (let i = 1; i <= 8; i++) await r.ctl.appendLine(r.path, `Hit hihat on step ${i}.`, { gesture: 'drag-1' }).then((x) => assert.equal(x.ok, false, 'the bar has no hihat channel yet: refused in words'));
  await r.ctl.appendLine(r.path, 'Add the channel hihat.');
  const w0 = r.writes.length;
  for (let i = 1; i <= 8; i++) { const x = await r.ctl.appendLine(r.path, `Hit hihat on step ${i}.`, { gesture: 'drag-1' }); assert.equal(x.ok, true, x.message); }
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Add the channel hihat.', 'Hit hihat on steps 1, 2, 3, 4, 5, 6, 7 and 8.']);
  assert.equal(r.writes.length, w0 + 8, 'each cell is written as it is painted');
  await r.undoKey();
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Add the channel hihat.'], 'ONE undo took the whole drag back');
  for (let i = 1; i <= 2; i++) await r.ctl.appendLine(r.path, `Hit hihat on step ${i}.`, { gesture: 'drag-2' });
  await r.ctl.appendLine(r.path, 'Hit hihat on step 9.', { gesture: 'drag-3' });
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Add the channel hihat.', 'Hit hihat on steps 1 and 2.', 'Hit hihat on step 9.'], 'another gesture is another line');
});

// ---- the grid is redrawn from the replay -------------------------------------------------------------------------------------------------------------------------------------------------

test('a gesture the list refused is NOT left on the grid: the widget is redrawn from the note (a list with a line nobody can read blocks the append)', async () => {
  const note = (writeBarNote(BAR_001, [BAR_HEAD, 'Hit kick on step 3.', 'garbage nobody can read']) as { text: string }).text;          // the fence says lines 1 and 2, as a replay of the list does
  const r = rig({ note }); await r.ready(); const bb = await beatBox(r);
  const loads = bb.loads();
  await bb.click(bb.cell('snare', 7));
  assert.equal(r.writes.length, 0, 'nothing was written');
  assert.ok(bb.loads() > loads, 'the grid was drawn again from the note');
  assert.ok(rhythmDataEqual(await bb.widgetBar(), dataOf(note)), 'and it shows what the note shows');
  assert.ok(r.entries().some((e) => e.kind === 'notice' && /^Line 3 is not a sentence I can read; the note shows lines 1 and 2\./.test(e.text)), 'said in plain words');
});

test('a bar that cannot be said as a head (a signature the sentences cannot say) is written by the old autosave: `unlistable` is not an error and nothing is lost', async () => {
  const odd = BAR_001.replace('"time_signature": "4/4"', '"time_signature": "common time"');
  const r = rig({ note: odd }); await r.ready();
  const result = await r.ctl.appendLine(r.path, 'Hit kick on step 3.');
  assert.equal(result.ok, false); assert.equal(result.reason, 'unlistable');
  assert.equal(r.writes.length, 0); assert.equal(r.text(), odd);
  assert.equal(r.entries().length, 0, 'it is not said in the dialog: the tab simply falls back');
});

// ---- the composer ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the composer on a bar: a typed sentence is previewed (nothing written), Enter applies it in ONE write; the service is never asked; the composer is empty after', async () => {
  const r = rig({ service: true }); await r.ready();
  assert.ok(empty(r));
  r.type('hit the kick on steps 9, 3'); await r.enter();
  assert.equal(r.calls(), 0); assert.deepEqual(r.writes, []);
  assert.match(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, /The grammar read your sentence/);
  assert.ok([...r.el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent?.includes('Hit kick on steps 3 and 9.'));
  await r.enter();
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on steps 3 and 9.']); assert.equal(r.calls(), 1); assert.equal(r.writes.length, 1); assert.ok(empty(r));
  assert.equal(dataOf(r.text()).channels.kick[2], true);
  r.type('Frobnicate the kick'); await r.enter();
  assert.equal(r.service(), 1, '2026-11-20-1003 (deliberate): bars are under the sentence service now: a sentence the bar grammar cannot read is asked ONCE (it was never asked before 1003)');
  assert.match(r.field().closest('.forge-chat-panel, .forge-prompt-box')?.textContent ?? '', /does not know bar sentences yet/, 'an older service (it answers the old plan) says so in words');
});
test('2026-11-20-1003: a bar with NO service set up is refused in the bar grammar\'s own words, as before (no request)', async () => {
  const r = rig(); await r.ready();
  r.type('Frobnicate the kick'); await r.enter();
  assert.equal(r.service(), 0);
  assert.match(r.field().closest('.forge-chat-panel, .forge-prompt-box')?.textContent ?? '', /do not know how to read/);
});

test('typed sentences: several in one text are several lines and ONE undo; a replacement says "This replaces"; a sentence the bar cannot take is refused in words; the same sentence twice changes nothing', async () => {
  const r = rig(); await r.ready();
  await r.say('Hit kick on step 3. Set the tempo to 110. Clear snare on step 5.');
  assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.', 'Set the tempo to 110.', 'Clear snare on step 5.']); assert.equal(r.writes.length, 1);
  await r.undoKey(); assert.deepEqual(r.lines(), [BAR_HEAD], 'one typed text, one undo');
  await r.say('Set the tempo to 110.');
  r.type('Set the tempo to 90.'); await r.enter();
  const s = r.entries().filter((e) => e.kind === 'suggestion').pop()!.text; assert.ok(s.includes('This replaces: Set the tempo to 110.'), s);
  await r.enter(); assert.deepEqual(r.lines(), [BAR_HEAD, 'Set the tempo to 90.']);
  const w1 = r.writes.length;
  r.type('Hit hihat on step 1.'); await r.enter();
  assert.equal(r.writes.length, w1, 'a refusal writes nothing');
  assert.match(r.entries().filter((e) => e.kind !== 'you').pop()!.text, /no hihat channel in this bar/);
  const w = r.writes.length;
  r.type('Set the tempo to 90.'); await r.enter();
  assert.match(r.entries().filter((e) => e.kind !== 'you').pop()!.text, /Nothing changed/); assert.equal(r.writes.length, w);
});

test('Cmd/Ctrl+Z in the EMPTY composer undoes, Shift redoes, the key is not taken with text in the field; the "+" menu has the two items (disabled when there is nothing)', async () => {
  const r = rig(); await r.ready();
  await r.openMenu();
  const labels = r.menuItems().map((b) => b.textContent);
  assert.deepEqual(labels.slice(-2), ['Undo last sentence', 'Redo']);
  assert.equal(r.menuItems().slice(-2).every((b) => b.getAttribute('aria-disabled') === 'true'), true, 'nothing to undo yet');
  await r.say('Hit kick on step 3.');
  await r.openMenu(); assert.equal(r.menuItems().slice(-2)[0].getAttribute('aria-disabled'), 'false');
  r.type('typing'); assert.equal(await r.undoKey(), false, 'with text in the field the key is the browser\'s own'); assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.']);
  r.type('');
  assert.equal(await r.undoKey(), true); assert.deepEqual(r.lines(), [BAR_HEAD]);
  assert.equal(await r.undoKey(true), true); assert.deepEqual(r.lines(), [BAR_HEAD, 'Hit kick on step 3.']);
  assert.ok(r.entries().some((e) => /^Added again: Hit kick on step 3\./.test(e.text)));
});

// ---- hand edits ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a hand edit of `lines:`: the fence follows it in ONE write; an unreadable line is KEPT and named in plain muted words (no red), the replay stops before it; when NO line is readable nothing is written', async () => {
  const r = rig(); await r.ready(); await r.say('Hit kick on step 3.');
  const w = r.writes.length;
  await r.hand(withBarLines(r.text(), [BAR_HEAD, 'Hit kick on step 3.', 'Hit snare on step 8.']));
  assert.equal(r.writes.length, w + 1); assert.deepEqual(dataOf(r.text()).channels.snare[7], true);
  const w2 = r.writes.length;
  await r.hand(withBarLines(r.text(), [BAR_HEAD, 'Hit kick on step 3.', 'this is not a sentence', 'Hit kick on step 9.']));
  assert.equal(r.writes.length, w2 + 1, 'the readable lines applied (the snare hit is gone: line 3 was the snare line)');
  assert.deepEqual(readBarLines(r.text())!.lines, [BAR_HEAD, 'Hit kick on step 3.', 'this is not a sentence', 'Hit kick on step 9.'], 'every line is kept');
  const said = r.entries().filter((e) => e.kind === 'notice').map((e) => e.text);
  assert.ok(said.some((t) => t.startsWith('Line 3 is not a sentence I can read; the note shows lines 1 and 2.')), said.join(' | '));
  assert.equal(r.el.querySelectorAll('.forge-chat-msg[data-kind="rejected"], .forge-chat-msg[data-kind="failed"], .forge-chat-msg[data-kind="refused"]').length, 0, 'no red: it is a notice');
  const w3 = r.writes.length, before = r.text();
  await r.hand(withBarLines(r.text(), ['nothing here', 'nor here']));
  assert.equal(r.writes.length, w3, 'no readable line: nothing is written'); assert.equal(fence(r.text()), fence(before));
});

test('an edit of the json OUTSIDE the list (the JSON view, a sync) wins: the data stays as the person left it and the list starts again from it; its own write never loops', async () => {
  const r = rig(); await r.ready(); await r.say('Hit kick on step 3.');
  await r.runTimers();                                                                                  // the vault's `modify` for our own write: nothing to do
  const edited = dataOf(r.text()); edited.tempo_bpm = 77; edited.channels.snare[1] = true;
  const next = r.text().replace(fence(r.text()), json(edited));
  const w = r.writes.length;
  await r.hand(next);
  assert.equal(r.writes.length, w + 1);
  assert.deepEqual(readBarLines(r.text())!.lines, [headSentence(edited)!], 'the list starts again from the bar as it is');
  assert.ok(rhythmDataEqual(dataOf(r.text()), edited), 'the person\'s data is untouched');
  assert.ok(r.entries().some((e) => /edited outside its list/.test(e.text)));
  const w2 = r.writes.length; await r.runTimers(); assert.equal(r.writes.length, w2, 'and it is quiet after');
  assert.equal(inspectBarNote(r.text()).inSync, true);
});

test('WHAT YOU SEE IS WHAT YOU EDIT: a bar whose list and fence disagree (`lines: []` with a fence that is not the starter - a demo bar, a bar saved by an older tab - or a json edited outside) is edited from the FENCE (the bar the Beat Box shows); the list starts again from it, with a notice, and the click is on top of it', async () => {
  const demo = dataOf(BAR_001); demo.channels.kick = [true, ...new Array(15).fill(true)]; demo.tempo_bpm = 77;
  const cases: Array<[string, string]> = [
    ['an empty list and another bar in the fence', withBarLines(BAR_001.replace(fence(BAR_001), json(demo)), [])],
    ['a list and a fence edited outside it (no modify heard)', (() => { const listed = withBarLines(BAR_001, [BAR_HEAD, 'Hit snare on step 8.']); return listed.replace(fence(listed), json(demo)); })()],
  ];
  for (const [what, note] of cases) {
    const r = rig({ note }); await r.ready();
    const x = await r.ctl.appendLine(r.path, 'Hit snare on step 2.');
    assert.equal(x.ok, true, `${what}: ${x.message}`);
    const want = JSON.parse(JSON.stringify(demo)) as RhythmData; want.channels.snare[1] = true;
    assert.equal(fence(r.text()), json(want), `${what}: the bar the Beat Box showed, plus the click`);
    assert.deepEqual(r.lines(), [headSentence(demo)!, 'Hit snare on step 2.'], `${what}: the list starts again from the fence`);
    assert.ok(r.entries().some((e) => e.kind === 'notice' && /edited outside its list/.test(e.text)), `${what}: said once, in plain words`);
    assert.equal(r.calls(), 1, `${what}: still ONE process call and one write`); assert.equal(r.writes.length, 1);
    const u = await r.ctl.undoLast(r.path); assert.equal(u.ok, true); assert.deepEqual(r.lines(), [headSentence(demo)!], `${what}: undo gives the bar back as it was shown`);
    assert.ok(rhythmDataEqual(dataOf(r.text()), demo));
  }
});

test('our own write heard back through the vault (`modify`) writes nothing more, for every kind of line', async () => {
  const r = rig(); await r.ready();
  for (const s of ['Hit kick on step 3.', 'Set the tempo to 90.', 'Set the swing to 20 percent.', 'Add the channel hihat.', 'Hit hihat on steps 1 and 5.', 'Mirror every channel.', 'Use 8 steps in 4/4.']) {
    await r.say(s); const w = r.writes.length; r.ctl.modified(r.path); await r.runTimers(); assert.equal(r.writes.length, w, s);
  }
  assert.equal(inspectBarNote(r.text()).inSync, true);
});

test('a write that fails on disk is said in the dialog and leaves the note as it was; the composer keeps the sentence', async () => {
  const r = rig({ refuseWrites: true }); await r.ready();
  const saved = console.error; console.error = () => {};
  try { r.type('Hit kick on step 3.'); await r.enter(); await r.enter(); } finally { console.error = saved; }
  assert.equal(r.text(), BAR_001); assert.equal(r.field().value, 'Hit kick on step 3.');
  assert.ok(r.entries().some((e) => /disk full|Could not write/.test(e.text)));
});

// ---- P3: nothing else is touched ------------------------------------------------------------------------------------------------------------------------------------------------------

test('P3 (byte pins): every playground bar never edited, a phrase, an arrangement, a composition, a kit and a library rhythm pattern are byte for byte what they were, whatever happens to the one bar', async () => {
  const others: Record<string, string> = {
    'phrases/phrase_001.md': emptyPhraseNote('phrase_001'), 'arrangements/arr_001.md': emptyArrangementNote('arr_001'), 'compositions/comp_001.md': emptyCompositionNote('comp_001'),
    'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] }), 'rhythm_data/rhythm_pattern_tresillo.md': PLAYGROUND_BARS['bar_002'], 'notes/plain.md': 'a plain note\n',
  };
  for (const [name, t] of Object.entries(PLAYGROUND_BARS)) if (name !== 'bar_001') others[`bars/${name}.md`] = t;
  const r = rig({ extra: others }); await r.ready();
  const before = new Map(r.store);
  await r.say('Hit kick on step 3.'); await r.say('Set the tempo to 90.'); await r.undoKey(); await r.undoKey();
  await r.hand(withBarLines(r.text(), [BAR_HEAD, 'Hit kick on step 4.']));
  for (const p of Object.keys(others)) { r.ctl.modified(p); await r.ctl.inspect(p); }
  await r.runTimers();
  for (const [p, t] of before) if (p !== BAR_PATH) assert.equal(r.store.get(p), t, `${p} is byte for byte what it was`);
  assert.ok(r.writes.every((p) => p === BAR_PATH), `only the one bar was written: ${[...new Set(r.writes)].join(', ')}`);
  for (const p of ['phrases/phrase_001.md', 'kits/rock.md', 'notes/plain.md', 'rhythm_data/rhythm_pattern_tresillo.md']) {
    const x = await r.ctl.appendLine(p, 'Hit kick on step 3.'); assert.equal(x.ok, false, `${p} is not a bar: ${x.message}`);
  }
  assert.equal(r.store.get('kits/rock.md'), before.get('kits/rock.md'));
  assert.equal(r.store.get('rhythm_data/rhythm_pattern_tresillo.md'), before.get('rhythm_data/rhythm_pattern_tresillo.md'));
});

test('P3: a bar that was never listed and never written has no `lines:` after the controller has looked at it, heard it change (a modify with the same text), and had its pane synced', async () => {
  for (const [name, t] of Object.entries(PLAYGROUND_BARS)) {
    const r = rig({ note: t, path: `bars/${name}.md` }); await r.ready(); r.ctl.modified(r.path); await r.runTimers(); r.ctl.syncBars();
    assert.equal(r.calls(), 0, name); assert.equal(r.text(), t, name);
    assert.deepEqual(baselineList(dataOf(t)), inspectBarNote(t).list);
  }
});
