// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - THE CLICK, end to end on the surface a person uses (happy-dom): the REAL phrase tab (mountPhrase: the Score area, the inspector, the click handlers) and the REAL composer + dialog (the description controller) in the
// SAME tab element, joined by the one host the plugin registers (bar-selection-bus.ts). With a bar word in the composer (the FIRST word of the text is Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix or Extend, any case) a plain click on a bar of the
// Score inserts its POSITION, ` bar 3` (the bar as the Score shows it now), at the caret, and a later click adds ` and bar 5`; any other text keeps 0992a (the note link, ` [[name]]`); an empty composer still pins; Shift / Ctrl / Cmd clicks and the click
// after a drag are unchanged. Enter then applies ONE line (`Copy bar 3.`), one write, one undo, and the note says what the Score draws. `Duplicate [[bar_007]].` typed is still the 0992 note copy, `Duplicate bar 3.` typed is a sentence of the LIST.
// Written RED first. A DOM element is never an assert operand.
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
import { barsOfPayload, producePhraseNote } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';

const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const KICK = (at: number[]) => Array.from({ length: 16 }, (_, i) => at.includes(i));
const MIX_BAR_DATA = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: KICK([0, 8]) } };
const KICK_BAR_NOTE = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(MIX_BAR_DATA)}\n\`\`\`\n`;
const MIX_XML = '<score-partwise><part-list/><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration></note><note><rest/><duration>7</duration></note><note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration></note><note><rest/><duration>7</duration></note></measure></part></score-partwise>';
/** What the engine returns for the ONE_BAR mix: the mixed bar, the two parents, the MusicXML (the plugin annotates it: ids on the bar and on its hits). */
const MIX_PAYLOAD = { type: 'musicxml', content: MIX_XML, multi_staff_content: MIX_XML, kit_content: MIX_XML, bars_data: [MIX_BAR_DATA], mixed_bar: MIX_BAR_DATA, forge_mix: { a: MIX_BAR_DATA, b: MIX_BAR_DATA } };
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
const FORKED: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '3': 'bars/bar_009', '6': 'bars/bar_002' } };
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };

async function rig(phrase: PhraseParams, opts: { host?: boolean; composer?: boolean } = {}) {
  const barNote = phrase.kind === 'mix' ? KICK_BAR_NOTE : BAR;          // a mix is tied to the hits of its two bars: kick-only bars keep the stub MusicXML small
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_020.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', barNote], ['bars/bar_002.md', barNote], ['bars/bar_009.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], [notePath, noteContentFor('phrase_020', phrase)]]);
  const traces: string[] = [];
  const phraseWrites: unknown[] = []; const pins: unknown[] = []; let processCalls = 0; const creates: string[] = []; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); creates.push(p); }, exists: (p: string) => files.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
  }, {}));
  const off = opts.host === false ? () => {} : registerBarSelectionHost({
    appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }),
    duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateEmpty: (p) => ctl.duplicateEmpty(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar),
  });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_020', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async (p: unknown) => { phraseWrites.push(p); return { ok: true }; },
    compute: async (data: any, params) => {
      if (params.kind === 'mix') return MIX_PAYLOAD;
      const bars = params.kind === 'transform' ? data.bars : Array.from({ length: (params as any).bars ?? (params.kind === 'mix' ? 1 : 8) }, (_, i) => barOf(i));
      return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      const hits = [...first.matchAll(/<note id="([^"]+)"/g)].map((m) => `<g class="note" id="${m[1]}"></g>`).join('');          // a mix's hits carry their ids (mix-lineage-core.ts annotateMixXml)
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g>${hits}</g>`).join('')}</svg>`;
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
  return { traces, handle, parent, files, pins, bars, click, field, type, press, flush, suggestion, count, creates, notePath, phraseWrites, calls: () => processCalls, ctl, buttons: () => dialogButtons(parent), entries: () => dialogEntries(parent), done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
}

const descriptionLines = (text: string): string[] => extractDescription(text).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
const PLAIN: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const ONE_BAR: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false };
/** What the Score would draw for the note as it is on disk (the same stub engine the tab uses): the tempo of bar i tells the bars apart (100 - i for the extend's own bars). */
const scoreOf = async (r: { files: Map<string, string>; notePath: string }): Promise<number[] | string> => {
  const stub = async (data: any, params: any) => { const bars = params.kind === 'transform' ? data.bars : params.kind === 'morph' ? Array.from({ length: params.bars }, (_, i) => ({ ...data.a, tempo_bpm: 500 + i })) : Array.from({ length: (params as any).bars ?? 1 }, (_, i) => barOf(i)); return { type: 'musicxml', content: xmlFor(bars.length), bars_data: bars }; };
  const out = await producePhraseNote({ readNote: async (p: string) => { const t = r.files.get(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: stub as never }, r.files.get(r.notePath)!, 't');
  return out.kind === 'score' ? (barsOfPayload(out.payload) as Array<{ tempo_bpm: number }>).map((b) => b.tempo_bpm) : out.message;
};
const VERBS = ['Duplicate', 'Copy', 'Move', 'Delete', 'Remove', 'Keep', 'Morph', 'Mix', 'Extend'];

for (const verb of VERBS) {
  test(`${verb}: a plain click on ANY of the 8 bars inserts " bar N" (the bar's number in the Score), at the end of the text, focus back in the field, no preview, NOTHING pinned, nothing written or created`, async () => {
    const r = await rig(PLAIN);
    try {
      assert.equal(r.bars().length, 8);
      for (const text of [verb, verb.toLowerCase(), verb.toUpperCase()]) for (let i = 0; i < 8; i++) {
        r.type(text); r.click(r.bars()[i]); await r.flush();
        assert.equal(r.field().value, `${text} bar ${i + 1}`, `${text}, bar ${i + 1}`);
        assert.ok(win.document.activeElement === r.field(), `${text}, bar ${i + 1}: focus is back in the field`);
        assert.equal(r.suggestion(), '', 'no preview'); assert.deepEqual(r.buttons(), []);
      }
      assert.deepEqual(r.pins, [], 'not one click pinned a bar'); assert.deepEqual(r.creates, []); assert.deepEqual(r.phraseWrites, []); assert.equal(r.calls(), 0, 'no write of the note');
    } finally { r.done(); }
  });
}

test('a later click after a bar reference adds " and bar M" (and again); a click goes at the CARET; the numbers are the Score\'s', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Delete'); r.click(r.bars()[2]); await r.flush(); r.click(r.bars()[4]); await r.flush(); r.click(r.bars()[6]); await r.flush();
    assert.equal(r.field().value, 'Delete bar 3 and bar 5 and bar 7'); assert.deepEqual(r.pins, []);
    r.type('Keep and bar 8.'); r.field().setSelectionRange(4, 4); r.click(r.bars()[1]); await r.flush();
    assert.equal(r.field().value, 'Keep bar 2 and bar 8.', 'at the caret, one space');
    r.type('Move'); r.click(r.bars()[3]); await r.flush(); r.type(`${r.field().value} back`); r.click(r.bars()[5]); await r.flush();
    assert.equal(r.field().value, 'Move bar 4 back bar 6', 'after a direction word it is a new bar word, the person types the rest');
  } finally { r.done(); }
});

test('Morph: click bar 2, click bar 3, type "across 5 bars": the line is "Morph bar 2 and bar 3 across 5 bars"', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Morph'); r.click(r.bars()[1]); await r.flush(); r.click(r.bars()[2]); await r.flush();
    assert.equal(r.field().value, 'Morph bar 2 and bar 3'); r.type(`${r.field().value} across 5 bars`);
    await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.']);
    assert.equal((await scoreOf(r) as number[]).length, 13, 'the Score draws 8 + 5 bars');
  } finally { r.done(); }
});

// 2026-11-24-1034 (deliberate): "any other text" no longer gets the note link: it gets the bar's POSITION (`Foo bar 2`); the link stays where a line needs one (`replaced by`, `Take`, a head: Take and `Bar 3 is replaced by` below). The EMPTY composer writes `bar 2` and still pins.
test('any other text gets the bar\'s POSITION at the caret ("Foo", "Make it ...", "Duplicates"), the NOTE link only where the line needs one (Take, replaced by); an EMPTY composer pins AND writes `bar 2`; Shift and Ctrl/Cmd clicks are the selection gestures with a bar word in the field', async () => {
  const r = await rig(FORKED);
  try {
    for (const [t, link] of [['Foo', 'Foo bar 2'], ['Take', 'Take [[bar_005]]'], ['Make it 8 bars long.', 'Make it 8 bars long. bar 2'], ['Duplicates', 'Duplicates bar 2'], ['Bar 3 is replaced by', 'Bar 3 is replaced by [[bar_005]]']] as const) {
      r.type(t); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, link, t);
    }
    assert.deepEqual(r.pins, []);
    r.type(''); r.click(r.bars()[1]); await r.flush(); assert.equal(r.pins.length, 1, 'empty: pinned as ever'); assert.equal(r.field().value, 'bar 2', 'and written (1034)');
    r.type('Duplicate'); r.click(r.bars()[2], { shiftKey: true }); r.click(r.bars()[4], { ctrlKey: true }); r.click(r.bars()[5], { metaKey: true }); await r.flush();
    assert.equal(r.pins.length, 1); assert.equal(r.field().value, 'Duplicate', 'a selection gesture adds no bar word'); assert.match(r.count() ?? '', /bars? selected/);
  } finally { r.done(); }
});

test('a text that only ENDS with the word Duplicate is not a bar-word text: it is any other text, the click inserts the position (2026-11-24-1034, deliberate: it was the note link; the 0992 branch that appended ` [[name]].` and previewed is gone)', async () => {
  const r = await rig(FORKED);
  try { r.type('Please duplicate'); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, 'Please duplicate bar 2'); assert.equal(r.suggestion(), ''); assert.deepEqual(r.pins, []); } finally { r.done(); }
});

test('a transform\'s bars are numbered by their place in the Score (the number is the bar\'s, whatever note made it)', async () => {
  const t = await rig(TRANSFORM);
  try { for (const i of [0, 3, 7]) { t.type('Delete'); t.click(t.bars()[i]); await t.flush(); assert.equal(t.field().value, `Delete bar ${i + 1}`); } assert.deepEqual(t.pins, []); } finally { t.done(); }
});

test('the click then ENTER: `Duplicate bar 3` is previewed as the canonical `Copy bar 3.`, applied as ONE line in ONE write (one undo), the note draws one bar more, the composer is empty; Cmd+Z takes it back in one step, Shift+Cmd+Z puts it back', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Duplicate'); r.click(r.bars()[2]); await r.flush();
    await r.press({ key: 'Enter' });
    assert.match(r.suggestion(), /Copy bar 3\./); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']); assert.equal(r.calls(), 0, 'the preview writes nothing'); assert.deepEqual(r.creates, [], 'it is not the 0992 note copy');
    await r.press({ key: 'Enter' });
    assert.equal(r.calls(), 1, 'one apply, one write');
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Copy bar 3.']);
    assert.equal(r.field().value, ''); assert.deepEqual(r.creates, []);
    const bars = await scoreOf(r) as number[]; assert.equal(bars.length, 9); assert.equal(bars[3], bars[2], 'bar 4 is the copy of bar 3');
    await r.press({ key: 'z', metaKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.']); assert.equal((await scoreOf(r) as number[]).length, 8);
    await r.press({ key: 'Z', metaKey: true, shiftKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Copy bar 3.']);
  } finally { r.done(); }
});

test('typed words: `Duplicate bar 3.` goes to the LIST (not the 0992 action reader, no "Duplicate what?"), `Remove bar 2` is written `Delete bar 2.`, `Move bar 3 back` is written `Move bar 3 one bar left.`; the 0992 `Duplicate [[bar_005]].` is still the note copy', async () => {
  const r = await rig(PLAIN);
  try {
    for (const [typed, line] of [['Duplicate bar 3.', 'Copy bar 3.'], ['Remove bar 2', 'Delete bar 2.'], ['Move bar 3 back', 'Move bar 3 one bar left.'], ['move bar 4 later.', 'Move bar 4 one bar right.']] as const) {
      r.type(typed); await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' });
      assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), line, typed); assert.equal(r.field().value, '', typed);
    }
    assert.deepEqual(r.creates, [], 'none of them copied a note');
    const before = r.files.get(r.notePath)!; const calls = r.calls();
    r.type('Duplicate [[bar_005]].'); await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), 'Copy [[bar_005]] to a new bar.'); await r.press({ key: 'Enter' });
    assert.deepEqual(r.creates, ['bars/bar_010.md']); assert.equal(r.files.get(r.notePath), before, 'the phrase is untouched'); assert.equal(r.calls(), calls);
  } finally { r.done(); }
});

test('a Move of several places is READ and REFUSED in words with the hint; nothing is written; the service is not asked (the preview says it, no proposal)', async () => {
  const r = await rig(PLAIN);
  try {
    await r.ctl.inspect(r.notePath);
    r.type('Move bar 3 two bars left.'); await r.press({ key: 'Enter' });
    assert.ok(r.entries().some((e) => /Say "Move bar 3 one bar left\." twice\./.test(e.text)), JSON.stringify(r.entries().map((e) => e.text)));
    assert.deepEqual(r.buttons(), []); assert.equal(r.calls(), 0);
    assert.equal(descriptionLines(r.files.get(r.notePath)!).length, 1, 'the list is as it was (the legacy paragraph is one sentence)');
  } finally { r.done(); }
});

test('the click names a bar by NUMBER even when no note made it (a bar of a composition has no source note: the 0992a link click says so, the bar word does not need one); a click with no number says so in words and inserts nothing', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Delete'); const said = await r.ctl.duplicateClick(r.notePath, null, null); assert.equal(said.ok, false); assert.equal(r.field().value, 'Delete', 'nothing inserted');
    assert.ok(r.entries().some((e) => /which bar/i.test(e.text)), JSON.stringify(r.entries().map((e) => e.text)));
    const ok = await r.ctl.duplicateClick(r.notePath, null, 4); assert.equal(ok.ok, true); assert.equal(r.field().value, 'Delete bar 4');
    r.type('Take'); const link = await r.ctl.duplicateClick(r.notePath, null, 4); assert.equal(link.ok, false, 'a link click with no note is still refused as 0992a (where the line needs a link: 2026-11-24-1034, deliberate: "Foo" gets the position now)');
  } finally { r.done(); }
});

// ---- 2026-11-19-0996b mutation triage: the controller's own click handler, called directly (the words it answers with, the trace line it leaves, the focus it gives back) ----------------------------------------------------------------
// 2026-11-19-0996b mutation survivor: src/description-apply.ts:599 "||" -> "&&" (two mutants: a bar that is 0, 2.5 or negative must not be written as "bar 0")
// 2026-11-19-0996b mutation survivor: src/description-apply.ts:601 drop `box.handle.focus();` (a refused click gives the focus back to the field)
test('a click with NO usable bar number (0, a negative, a fraction, NaN, infinity, a string, null, undefined, nothing) inserts nothing, refuses in the same exact words every time, says it in the dialog and gives the focus back to the field', async () => {
  const r = await rig(PLAIN);
  const WORDS = 'I cannot tell which bar that is, so I cannot write its number.';
  try {
    for (const bad of [0, -1, -3, 0.5, 2.5, NaN, Infinity, -Infinity, '3', '', true, false, {}, [], null, undefined]) {
      r.type('Delete'); r.field().blur(); assert.ok(win.document.activeElement !== r.field(), 'the field starts without the focus');
      const seen = r.entries().filter((e) => e.text === WORDS).length;
      const said = await r.ctl.duplicateClick(r.notePath, 'bars/bar_005', bad as never);
      assert.deepEqual(said, { ok: false, message: WORDS }, `bar = ${String(bad)}`);
      assert.equal(r.field().value, 'Delete', `bar = ${String(bad)}: nothing inserted`);
      assert.ok(win.document.activeElement === r.field(), `bar = ${String(bad)}: the focus is back in the field`);
      assert.equal(r.entries().filter((e) => e.text === WORDS).length, seen + 1, `bar = ${String(bad)}: the dialog says it`);
    }
    r.field().blur(); const none = await r.ctl.duplicateClick(r.notePath, 'bars/bar_005'); assert.deepEqual(none, { ok: false, message: WORDS }, 'no third argument at all');
    assert.ok(win.document.activeElement === r.field()); assert.deepEqual(r.traces.filter((t) => /bar click/.test(t)), [], 'a refused click leaves no "bar click" trace');
    assert.deepEqual(r.pins, []); assert.equal(r.calls(), 0);
  } finally { r.done(); }
});

// 2026-11-19-0996b mutation survivor: src/description-apply.ts:604 drop `pb(\`bar click: bar ${bar}\`);` and "`bar click: bar ${bar}`" -> "''"
// 2026-11-19-0996b mutation survivor: src/description-apply.ts:606 "`Added bar ${bar} to the composer.`" -> "''"
// 2026-11-19-0996b mutation survivor: src/description-apply.ts:614 drop `pb(\`link click: ${noteId}\`);` and "`link click: ${noteId}`" -> "''"
// 2026-11-19-0996b mutation survivor: src/description-apply.ts:616 "`Added [[${parts.name}]] to the composer.`" -> "''"
test('the two accepted clicks answer in exact words and leave exact trace lines for the console: a bar word -> "Added bar N to the composer." and "[forge-promptbox] bar click: bar N"; any other text -> "Added [[name]] to the composer." and "[forge-promptbox] link click: <lineage id>"; the field and the focus are right; nothing else is written', async () => {
  const r = await rig(PLAIN);
  try {
    for (const n of [1, 2, 7, 8, 64]) {
      r.type('Delete'); r.field().blur();
      const said = await r.ctl.duplicateClick(r.notePath, null, n);
      assert.deepEqual(said, { ok: true, message: `Added bar ${n} to the composer.` });
      assert.equal(r.field().value, `Delete bar ${n}`); assert.ok(win.document.activeElement === r.field(), `bar ${n}: focus is back in the field`);
      assert.equal(r.traces.filter((t) => t === `[forge-promptbox] bar click: bar ${n}`).length, 1, `bar ${n}: exactly one trace line, in these words`);
    }
    r.type('Take'); r.field().blur();          // 2026-11-24-1034 (deliberate): it was "Foo" (any other text got the link); the link is for `Take`, `replaced by` and a head now
    const link = await r.ctl.duplicateClick(r.notePath, 'bars/bar_005', 3);
    assert.deepEqual(link, { ok: true, message: 'Added [[bar_005]] to the composer.' });
    assert.equal(r.field().value, 'Take [[bar_005]]'); assert.ok(win.document.activeElement === r.field(), 'the link click gives the focus back too');
    assert.equal(r.traces.filter((t) => t === '[forge-promptbox] link click: bars/bar_005').length, 1, 'the link click leaves one trace line, in these words');
    assert.equal(r.traces.filter((t) => /bar click/.test(t) && /Foo|link/.test(t)).length, 0);
    // the words of the refusals that stayed: no composer for this note, an empty composer, a bar no note made, a bar from a note that cannot be copied
    assert.deepEqual(await r.ctl.duplicateClick('phrases/phrase_777.md', 'bars/bar_005', 3), { ok: false, message: 'There is no composer open for this note.' });
    r.type('Take'); assert.deepEqual(await r.ctl.duplicateClick(r.notePath, null, 3), { ok: false, message: 'I cannot tell which note made that bar, so I cannot copy it.' });
    assert.deepEqual(await r.ctl.duplicateClick(r.notePath, 'kits/kit_001', 3), { ok: false, message: 'That bar comes from kits/kit_001, which is not a bar, a phrase, an arrangement or a composition I can copy.' });
    assert.equal(r.field().value, 'Take', 'no refusal changed the text'); assert.deepEqual(r.creates, []); assert.equal(r.calls(), 0);
  } finally { r.done(); }
});

// 2026-11-19-0996b mutation survivor: src/phrase-dom.ts:835 (a MIX is one bar and has none: the click on it, on its bar or on a note of it, says bar 1; barNumberOf's second argument), :838 (the console line), :839 (the bar goes to the host)
test('a click on a MIX (one bar: bar 1) with a bar word in the composer writes " bar 1" whichever part of the bar was clicked; the console line says the bar; the host gets the number', async () => {
  const infos: string[] = []; const orig = console.info; console.info = (...a: unknown[]) => { infos.push(a.map(String).join(' ')); };
  const r = await rig(ONE_BAR);
  try {
    assert.equal(r.bars().length, 1);
    r.type('Delete'); r.click(r.bars()[0]); await r.flush();
    assert.equal(r.field().value, 'Delete bar 1', 'the bar of a mix');
    const note = r.parent.querySelector('[id="mx_kick_0"]') as any; assert.ok(note, 'the mix has a hit (a note of the mixed bar, mx_kick_0) to click');
    r.type('Copy'); r.click(note); await r.flush();
    assert.equal(r.field().value, 'Copy bar 1', 'a note of the mix (its hit) is the same bar');
    assert.deepEqual(r.pins, [], 'nothing pinned');
    const lines = infos.filter((l) => l.startsWith('[forge-duplicate] copy click on ')); assert.equal(lines.length, 2, JSON.stringify(lines));
    for (const l of lines) assert.match(l, /^\[forge-duplicate\] copy click on \S+: (bars\/)?bar_00[25] \(bar 1\)$/, l);
  } finally { console.info = orig; r.done(); }
});
test('the console line of a copy click names the element, the note that made the bar and the bar number as the host is given it ("(bar N)"), one line per click', async () => {
  const infos: string[] = []; const orig = console.info; console.info = (...a: unknown[]) => { infos.push(a.map(String).join(' ')); };
  const r = await rig(PLAIN); const seen: Array<[string, string | null, unknown]> = [];
  try {
    registerBarSelectionHost({ appendLine: async () => ({ ok: true, message: '' }), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }), duplicateArmed: () => true, duplicateClick: async (p, id, bar) => { seen.push([p, id, bar]); return { ok: true, message: '' }; } } as never);
    for (const i of [0, 4, 7]) { r.type('Delete'); r.click(r.bars()[i]); await r.flush(); }
    assert.deepEqual(infos.filter((l) => l.startsWith('[forge-duplicate]')), [1, 5, 8].map((n) => `[forge-duplicate] copy click on ph_bar_${n}: bars/bar_005 (bar ${n})`));
    assert.ok(seen.length >= 3, 'the last registered host got the clicks'); assert.deepEqual(seen.slice(-3).map(([, , b]) => b), [1, 5, 8]);
    assert.deepEqual(seen.slice(-3).map(([p, id]) => [p, id]), [['phrases/phrase_020.md', 'bars/bar_005'], ['phrases/phrase_020.md', 'bars/bar_005'], ['phrases/phrase_020.md', 'bars/bar_005']]);
  } finally { console.info = orig; r.done(); }
});
