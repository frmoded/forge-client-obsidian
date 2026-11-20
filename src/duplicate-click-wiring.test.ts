// 2026-11-19-0992 - THE GESTURE, end to end on the surface a person uses (happy-dom): the REAL phrase tab (mountPhrase: the Score area, the inspector, the pin handlers) and the REAL composer + dialog (the description controller) in the SAME
// tab element, joined by the one host the plugin registers (bar-selection-bus.ts: score-first.ts hands it the controller's two methods). Type "Duplicate", click a bar: the bar's note name is appended (` [[bar_007]].`), focus is back in the
// field, the usual preview "Copy [[bar_007]] to a new bar." is shown and the bar is NOT pinned; Enter creates the copy; the NEXT click pins again; in every other state a click pins and nothing else changes. EVERY bar of the phrase gives the right
// name (an extend's forks give their own bar notes; a transform's bars give the phrase they were taken from). The phrase note is never written. Written RED first. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { dialogButtons, dialogEntries } from './test-support/dialog-view.ts';
import { installHostClock } from './test-support/host-workspace.ts';
import { planNewBar } from './score-first-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { MORPH_BAR_ROLE } from './morph-lineage-core.ts';

const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
const FORKED: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '3': 'bars/bar_009', '6': 'bars/bar_002' } };
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };

async function rig(phrase: PhraseParams, opts: { host?: boolean; composer?: boolean } = {}) {
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_020.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], ['bars/bar_002.md', BAR], ['bars/bar_009.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], [notePath, noteContentFor('phrase_020', phrase)]]);
  const phraseWrites: unknown[] = []; const pins: unknown[] = []; let processCalls = 0; const creates: string[] = []; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); creates.push(p); }, exists: (p: string) => files.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
  }, {}));
  const off = opts.host === false ? () => {} : registerBarSelectionHost({
    appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }),
    duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar),      // 2026-11-19-0996b (deliberate): the bar's number rides along, as score-first.ts registers it
  });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_020', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (p: unknown) => { phraseWrites.push(p); return { ok: true }; },
    compute: async (data: any, params) => {
      const bars = params.kind === 'transform' ? data.bars : Array.from({ length: (params as any).bars ?? 8 }, (_, i) => barOf(i));
      return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: (p: unknown) => { pins.push(p); } },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load(); await clock.advance(400);
  if (opts.composer !== false) { panes.push({ path: notePath, contentEl: parent, tab: true }); await ctl.inspect(notePath); for (let i = 0; i < 240; i++) await Promise.resolve(); }
  const bars = () => [...parent.querySelectorAll('g.measure')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const field = () => parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); await clock.advance(20); };
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const suggestion = () => [...parent.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  const count = () => (parent.querySelector('.forge-bar-selection .forge-bar-selection-count') as any)?.textContent as string | undefined;
  return { handle, parent, files, pins, bars, click, field, type, press, flush, suggestion, count, creates, notePath, phraseWrites, calls: () => processCalls, ctl, buttons: () => dialogButtons(parent), entries: () => dialogEntries(parent), done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
}

// 2026-11-19-0996b (deliberate): 0992 said "type Duplicate, click a bar: its note's link and the preview of the copy". Since 0996b a click after the word Duplicate (or any bar word first in the text) inserts the bar's NUMBER, ` bar 3`; the note copy is the typed
// `Duplicate [[bar_007]].` (the tests below, and bar-words-click-wiring.test.ts for the click).
test('2026-11-19-0996b (deliberate): type "Duplicate", click ANY bar of an extend with two forks: " bar N" is inserted (the bar\'s number in the Score; it was the link of the note that made THAT bar and the usual preview), focus is in the field, NO preview, and NOTHING is pinned', async () => {
  const r = await rig(FORKED);
  try {
    assert.equal(r.bars().length, 8);
    for (let i = 0; i < 8; i++) {
      r.type('Duplicate'); r.click(r.bars()[i]); await r.flush();
      assert.equal(r.field().value, `Duplicate bar ${i + 1}`, `bar ${i + 1}`);
      assert.ok(win.document.activeElement === r.field(), `bar ${i + 1}: focus is back in the field`);
      assert.equal(r.suggestion(), '', `bar ${i + 1}: no preview`); assert.deepEqual(r.buttons(), []);
    }
    assert.deepEqual(r.pins, [], 'not one of the eight clicks pinned a bar');
    assert.deepEqual(r.creates, [], 'and the clicks created nothing');
  } finally { r.done(); }
});

// 2026-11-19-0992a (deliberate): 0992 said "the next click pins again (the text no longer ends with the word)"; now ANY text arms the click, so the next click ADDS a link (the reader will refuse two links: Duplicate takes one note); a click pins again once the field is empty.
test('then the NEXT click adds " and bar M" (any text arms the click: 0992a; 2026-11-19-0996b (deliberate): after a bar word it is a bar number, it was the note link), no pin; when the field is empty again a click pins', async () => {
  const r = await rig(FORKED);
  try {
    r.type('Duplicate'); r.click(r.bars()[1]); await r.flush();
    assert.equal(r.field().value, 'Duplicate bar 2'); assert.deepEqual(r.pins, []);
    r.click(r.bars()[5]); await r.flush();
    assert.equal(r.pins.length, 0, 'no pin: the field has text'); assert.equal(r.field().value, 'Duplicate bar 2 and bar 6');       // 2026-11-19-0992a (deliberate): was pins.length 1 and the text unchanged
    r.type(''); r.click(r.bars()[4]); assert.equal(r.pins.length, 1, 'an empty field: the pin it always was');
  } finally { r.done(); }
});

test('Enter on the preview creates the copy (bars/bar_010: one past the highest); the PHRASE is never written (no writePhrase, no process call, byte for byte); the copy opens from the dialog (2026-11-19-0996b (deliberate): the sentence is TYPED now, the click gives a bar number)', async () => {
  const r = await rig(FORKED);
  try {
    const phraseBefore = r.files.get(r.notePath)!;
    r.type('Duplicate [[bar_009]].'); await r.flush();                                    // bar 3 is the fork bar_009
    await r.press({ key: 'Enter' });
    await r.press({ key: 'Enter' });
    assert.deepEqual(r.creates, ['bars/bar_010.md']);
    assert.equal(r.files.get(r.notePath), phraseBefore); assert.deepEqual(r.phraseWrites, []); assert.equal(r.calls(), 0);
    assert.ok(r.entries().some((e) => e.kind === 'applied' && /Created bar_010, a copy of bar_009\./.test(e.text)), JSON.stringify(r.entries().map((e) => e.text)));       // 2026-11-19-0992a (deliberate): the sentence is plain (was 'Created [[bar_010]], a copy of [[bar_009]].')
    assert.equal(r.field().value, '');
    assert.equal(r.files.get('bars/bar_010.md')!.slice(r.files.get('bars/bar_010.md')!.indexOf('```json')), BAR.slice(BAR.indexOf('```json')));
  } finally { r.done(); }
});

test('a TRANSFORM\'s bar was taken from a phrase: the link click gives that phrase\'s name (2026-11-19-0996b (deliberate): with "Foo", it was "Duplicate"), the typed Duplicate says "to a new phrase"', async () => {
  const r = await rig(TRANSFORM);
  try {
    assert.equal(r.bars().length, 8);
    for (const i of [0, 4, 7]) { r.type('Foo'); r.click(r.bars()[i]); await r.flush(); assert.equal(r.field().value, 'Foo [[phrase_006]]', `bar ${i + 1}`); }
    r.type('Duplicate [[phrase_006]].'); await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), 'Copy [[phrase_006]] to a new phrase.'); await r.press({ key: 'Escape' });
    assert.deepEqual(r.pins, []);
  } finally { r.done(); }
});

test('the rule the click uses is the notes pane\'s (pinnedNoteFor): a morph\'s bars name the first note up to the middle bar and the second after it; nothing else changed there', () => {
  const prov = (bar: number) => ({ noteId: 'phrases/phrase_020', role: MORPH_BAR_ROLE, params: { bar, bars: 6, a: 'bar_003', b: 'bar_001' } });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => pinnedNoteFor(prov(n))?.noteId), ['bars/bar_003', 'bars/bar_003', 'bars/bar_003', 'bars/bar_001', 'bars/bar_001', 'bars/bar_001']);
});

// 2026-11-19-0992a (deliberate): 0992 pinned for 'Keep bars 1 to 2.' and 'Duplicate bars' too (three clicks, three pins); now only the EMPTY composer pins (1 pin); the other two insert their link (the new tests below).
test('in every OTHER state a click on a bar is what it was: the composer empty pins; a menu selection (Shift-click) is the selection gesture even while text is in the composer', async () => {
  const r = await rig(FORKED);
  try {
    r.type(''); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, '', 'the composer text is untouched'); assert.equal(r.pins.length, 1, 'one click, one pin');
    for (const [i, t] of ['Make it 8 bars long.', 'Foo'].entries()) { r.type(t);       // 2026-11-19-0996b (deliberate): the texts were 'Keep bars 1 to 2.' and 'Duplicate bars', bar words now (their click inserts a bar number: bar-words-click-wiring.test.ts)
       r.click(r.bars()[i + 2]); await r.flush(); assert.equal(r.field().value, `${t} [[bar_009]]`.replace('bar_009', i === 0 ? 'bar_009' : 'bar_005'), `${t}: the link goes in (0992a, deliberate: it used to pin)`); }
    assert.equal(r.pins.length, 1, 'no more pins');
    r.type('Duplicate'); r.click(r.bars()[2], { shiftKey: true }); r.click(r.bars()[4], { shiftKey: true }); await r.flush();
    assert.equal(r.pins.length, 1, 'a Shift-click is the selection gesture even while the word is in the composer'); assert.equal(r.count(), '3 bars selected: bars 3 to 5'); assert.equal(r.field().value, 'Duplicate');
  } finally { r.done(); }
});

// ---- 2026-11-19-0992a (R1): a click inserts the link after ANY typed text (the real phrase tab, the real composer) ------------------------------------------------------------------------------------------
test('R1: with "Foo" in the field a plain click on ANY bar of an extend with two forks inserts " [[name]]" (the note that made THAT bar), no full stop, no preview, focus in the field, NOTHING pinned, nothing created', async () => {
  const r = await rig(FORKED);
  try {
    const expected = ['bar_005', 'bar_005', 'bar_009', 'bar_005', 'bar_005', 'bar_002', 'bar_005', 'bar_005'];
    for (let i = 0; i < 8; i++) {
      r.type('Foo'); r.click(r.bars()[i]); await r.flush();
      assert.equal(r.field().value, `Foo [[${expected[i]}]]`, `bar ${i + 1}`);
      assert.ok(win.document.activeElement === r.field(), `bar ${i + 1}: focus is back in the field`);
      assert.equal(r.suggestion(), '', `bar ${i + 1}: no preview`); assert.deepEqual(r.buttons(), []);
    }
    assert.deepEqual(r.pins, [], 'not one of the eight clicks pinned a bar'); assert.deepEqual(r.creates, []); assert.deepEqual(r.phraseWrites, []);
  } finally { r.done(); }
});

test('R1: the link goes at the CARET of the field, not at the end', async () => {
  const r = await rig(FORKED);
  try {
    r.type('Make it 8 bars long.'); r.field().setSelectionRange(4, 4); r.click(r.bars()[2]); await r.flush();       // 2026-11-19-0996b (deliberate): it was 'Keep bars 1 to 2.' (Keep is a bar word now)
    assert.equal(r.field().value, 'Make [[bar_009]] it 8 bars long.'); assert.deepEqual(r.pins, []);
  } finally { r.done(); }
});

test('R1: an EMPTY composer: a click pins as ever (P3: byte for byte; the field stays empty); a transform\'s bar gives its phrase; Shift and Ctrl/Cmd clicks are the selection gestures with text in the field', async () => {
  const r = await rig(FORKED);
  try {
    r.type(''); r.click(r.bars()[1]); await r.flush(); assert.equal(r.pins.length, 1); assert.equal(r.field().value, '');
    r.type('Foo'); r.click(r.bars()[2], { shiftKey: true }); r.click(r.bars()[4], { ctrlKey: true }); await r.flush();
    assert.equal(r.pins.length, 1); assert.equal(r.field().value, 'Foo', 'a selection gesture adds no link');
  } finally { r.done(); }
  const t = await rig(TRANSFORM);
  try { t.type('Foo'); t.click(t.bars()[3]); await t.flush(); assert.equal(t.field().value, 'Foo [[phrase_006]]'); assert.deepEqual(t.pins, []); } finally { t.done(); }
});

test('R1: "Duplicate" is a bar word since 0996b (deliberate: it was 0992\'s " [[bar_005]]." with the full stop and the usual preview): " bar 2", no preview', async () => {
  const r = await rig(FORKED);
  try {
    r.type('Duplicate'); r.click(r.bars()[1]); await r.flush();
    assert.equal(r.field().value, 'Duplicate bar 2'); assert.equal(r.suggestion(), ''); assert.deepEqual(r.pins, []);
  } finally { r.done(); }
});

test('P3: a tab with no host registered, and a tab whose composer is not there, pin exactly as before (the word cannot arm anything)', async () => {
  const noHost = await rig(FORKED, { host: false });
  try { noHost.type('Duplicate'); noHost.click(noHost.bars()[1]); await noHost.flush(); assert.equal(noHost.pins.length, 1); assert.equal(noHost.field().value, 'Duplicate'); } finally { noHost.done(); }
  const noBox = await rig(FORKED, { composer: false });
  try { noBox.click(noBox.bars()[1]); await noBox.flush(); assert.equal(noBox.pins.length, 1); assert.ok(noBox.field() === null, 'no composer in this tab'); } finally { noBox.done(); }
});

// ---- the mechanism pins (they say so): the wiring this drain added, and where it must NOT be ----------------------------------------------------------------------------------------------------
const SRC = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8');
test('MECHANISM PIN: the plugin registers the two host methods on the description controller; the three phrase inspectors (extend/transform, mix, morph) carry the copy click and it asks pinnedNoteFor; nobody else passes it (P3)', () => {
  const first = SRC('score-first.ts');
  assert.match(first, /duplicateArmed: \(path\) => descriptions\.duplicateArmed\(path\)/); assert.match(first, /duplicateClick: \(path, noteId, bar\) => descriptions\.duplicateClick\(path, noteId, bar\)/);       // 2026-11-19-0996b (deliberate): the bar's number rides along
  const dom = SRC('phrase-dom.ts');
  assert.equal((dom.match(/copyClick: copyClickPort\(\),/g) ?? []).length, 3, 'extend (and transform, which shares its inspector), mix and morph');
  assert.match(dom, /pinnedNoteFor\(e\.prov\)[\s\S]{0,200}duplicateClick|duplicateClick[\s\S]{0,200}pinnedNoteFor/);
  const offenders = fs.readdirSync(import.meta.dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !['phrase-dom.ts', 'score-inspector.ts', 'artifact-inspector-core.ts', 'bar-selection-bus.ts', 'description-apply.ts', 'prompt-box-dom.ts', 'duplicate-sentence-core.ts', 'duplicate-note-core.ts', 'score-first.ts', 'description-wiring.ts', 'chat-panel-dom.ts', 'dialog-core.ts'].includes(f) && /copyClick|duplicateArmed|duplicateClick/.test(SRC(f)));
  assert.deepEqual(offenders, [], 'no other surface (a bar\'s Beat Box tab, an arrangement or a composition Score, the rhythm Score) passes the copy click');
});
