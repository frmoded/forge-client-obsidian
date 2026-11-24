// 2026-11-19-0999 (BAR WORDS: THE CLICK WITH NO HEAD YET) - written RED first (against b0fbb9d: the rule was literal, so `Morph` plus a click on a Score bar wrote ` bar 3` even in a phrase that has no head line yet, where `Morph [[a]] into [[b]]` needs the note link).
// New rule, for Extend, Mix and Morph ONLY: while the phrase's list (as the note says it now, `listOfNote`) has NO head line (Extend, Mix, Morph or Take), a click inserts the NOTE LINK as 0992a does (` [[bar_005]]`); once the list has a head line, ` bar N`.
// The six other verbs (Duplicate, Copy, Move, Delete, Remove, Keep) never need a head to be a bar step and keep today's behaviour byte for byte, and they do not read the note (their click stays synchronous). The decision is the CONTROLLER's (it has the note at click
// time: `phraseHasHead`); the pure core only answers `barWordVerb(text, hasHead)`.
// The REAL controller + composer + dialog + `mountPhrase` (happy-dom), the same rig as bar-words-click-wiring.test.ts; the empty list is the note swapped for a new empty phrase after the Score is drawn (the Score still shows its 8 bars).
// Every test marks the moved rule `2026-11-19-0999 (deliberate)`. A DOM element is never an assert operand.
// SECOND HALF (same file, same rig): bars clicked OUT OF ORDER. Under Delete a person clicks bar 5 and then bar 3: the field says what was clicked (`Delete bar 5 and bar 3`, the click appends ` and bar M` in click order), the first Enter previews the CANONICAL
// sentence (`Delete bar 3 and bar 5.`, sorted by the parser), the second Enter writes it as one line with one undo, and the Score draws the bars the sorted sentence leaves; a real overlap or touching bars were refused in words here (2026-11-20-1001 (deliberate): they are merged into one range now, see the test below).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, planNewEmptyPhrase, type PhraseParams } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { HEAD_BAR_VERBS, barWordVerb } from './duplicate-sentence-core.ts';
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
  const phraseWrites: unknown[] = []; const pins: unknown[] = []; let processCalls = 0; let serviceCalls = 0; const creates: string[] = []; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); creates.push(p); }, exists: (p: string) => files.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
  }, { askPlan: async () => { serviceCalls++; return { status: 200, json: {} }; }, planConfigured: () => true }));
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
  return { traces, serviceCalls: () => serviceCalls, handle, parent, files, pins, bars, click, field, type, press, flush, suggestion, count, creates, notePath, phraseWrites, calls: () => processCalls, ctl, buttons: () => dialogButtons(parent), entries: () => dialogEntries(parent), done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
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

const EMPTY_NOTE = (planNewEmptyPhrase({ existingBasenames: [], exists: () => false, name: 'phrase_020' }) as { content: string }).content;
/** The note on disk loses its list (no head line), while the Score the tab drew stays: what a click in a phrase that has no head yet meets. */
const noHead = (r: { files: Map<string, string>; notePath: string }): void => { r.files.set(r.notePath, EMPTY_NOTE); };
const HEAD_VERBS = ['Extend', 'Mix', 'Morph'];
const OTHER_VERBS = ['Duplicate', 'Copy', 'Move', 'Delete', 'Remove', 'Keep'];

// ---- the pure answer ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('2026-11-19-0999 (deliberate): barWordVerb(text, false) - no head yet - is null for Extend, Mix and Morph (any case) and unchanged for the six other verbs; the default (and `true`) is what 0996b did for all nine', () => {
  for (const v of HEAD_VERBS) for (const t of [v, v.toLowerCase(), v.toUpperCase(), `  ${v} bar 3`, `${v} [[bar_005]] into`]) {
    assert.equal(barWordVerb(t, false), null, `${t}: no head yet`);
    assert.equal(barWordVerb(t, true), v.toLowerCase(), `${t}: a head`);
    assert.equal(barWordVerb(t), v.toLowerCase(), `${t}: the default says there is a head`);
  }
  for (const v of OTHER_VERBS) for (const t of [v, v.toLowerCase(), v.toUpperCase(), `  ${v} bar 3 and`]) {
    assert.equal(barWordVerb(t, false), v.toLowerCase(), `${t}: never needs a head`);
    assert.equal(barWordVerb(t, true), v.toLowerCase()); assert.equal(barWordVerb(t), v.toLowerCase());
  }
  for (const t of ['', 'Foo', 'Take [[phrase_003]]', 'Duplicates', 'Mixed', 'Extended', 'Morphing']) { assert.equal(barWordVerb(t, false), null, t); assert.equal(barWordVerb(t, true), null, t); }
  assert.deepEqual([...HEAD_BAR_VERBS], ['morph', 'mix', 'extend']);
});

// ---- the click, through the real surface -------------------------------------------------------------------------------------------------------------------------------------------------------
for (const verb of HEAD_VERBS) {
  test(`2026-11-19-0999 (deliberate): ${verb} with NO head line yet: a plain click on a bar inserts the NOTE LINK of the note that made it (0992a), at the caret, focus back in the field, no preview, nothing pinned or written; the bars of the Score are numbered, the link is not`, async () => {
    const r = await rig(FORKED);
    try {
      noHead(r);
      const want = ['bar_005', 'bar_005', 'bar_009', 'bar_005', 'bar_005', 'bar_002', 'bar_005', 'bar_005'];      // FORKED: bars 3 and 6 are forks
      for (const text of [verb, verb.toLowerCase(), verb.toUpperCase()]) for (let i = 0; i < 8; i++) {
        r.type(text); r.click(r.bars()[i]); await r.flush();
        assert.equal(r.field().value, `${text} [[${want[i]}]]`, `${text}, bar ${i + 1}`);
        assert.ok(win.document.activeElement === r.field(), `${text}, bar ${i + 1}: focus is back in the field`);
        assert.equal(r.suggestion(), '', 'no preview'); assert.deepEqual(r.buttons(), []);
      }
      assert.deepEqual(r.pins, [], 'not one click pinned a bar'); assert.deepEqual(r.creates, []); assert.deepEqual(r.phraseWrites, []); assert.equal(r.calls(), 0, 'no write of the note');
      assert.equal(r.traces.filter((t) => /bar click/.test(t)).length, 0); assert.ok(r.traces.filter((t) => /link click/.test(t)).length >= 24, 'the link-click trace line, as 0992a');
    } finally { r.done(); }
  });
  test(`2026-11-19-0999 (deliberate): ${verb} once the list HAS a head line: bar N, as 0996b (the same eight bars)`, async () => {
    const r = await rig(PLAIN);
    try {
      for (let i = 0; i < 8; i++) { r.type(verb); r.click(r.bars()[i]); await r.flush(); assert.equal(r.field().value, `${verb} bar ${i + 1}`); assert.ok(win.document.activeElement === r.field()); }
      assert.deepEqual(r.pins, []); assert.equal(r.calls(), 0);
    } finally { r.done(); }
  });
}

for (const verb of OTHER_VERBS) {
  test(`P3: ${verb} with an EMPTY list is as 0996b: bar N on all 8 bars (it needs no head), the click is synchronous (it does not read the note), nothing pinned or written`, async () => {
    const r = await rig(FORKED);
    try {
      noHead(r);
      for (let i = 0; i < 8; i++) {
        r.type(verb); r.click(r.bars()[i]);
        assert.equal(r.field().value, `${verb} bar ${i + 1}`, 'inserted at once: no read of the note between the click and the text');
        await r.flush(); assert.equal(r.field().value, `${verb} bar ${i + 1}`); assert.ok(win.document.activeElement === r.field());
      }
      r.type(verb); r.click(r.bars()[2]); r.click(r.bars()[4]); await r.flush(); assert.equal(r.field().value, `${verb} bar 3 and bar 5`, 'a second click adds `and bar M`');
      assert.deepEqual(r.pins, []); assert.deepEqual(r.creates, []); assert.equal(r.calls(), 0); assert.equal(r.suggestion(), '');
    } finally { r.done(); }
  });
}

test('2026-11-19-0999 (deliberate): a head by clicks, end to end: `Morph` + click bar 1, " into" + click bar 3, "over 5 bars", Enter, Enter writes the HEAD line; the next `Morph` click is then a BAR step (` bar 2`), `Extend` the same', async () => {
  const r = await rig(FORKED);
  try {
    noHead(r);
    r.type('Morph'); r.click(r.bars()[0]); await r.flush();
    assert.equal(r.field().value, 'Morph [[bar_005]]');
    r.type(`${r.field().value} into`); r.click(r.bars()[2]); await r.flush();
    assert.equal(r.field().value, 'Morph [[bar_005]] into [[bar_009]]');
    r.type(`${r.field().value} over 5 bars, in musical order.`);
    await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Morph [[bar_005]] into [[bar_009]] over 5 bars, in musical order.']);
    assert.equal(r.field().value, ''); assert.deepEqual(r.pins, []);
    for (const verb of ['Morph', 'Extend', 'Mix']) { r.type(verb); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, `${verb} bar 2`, `${verb}: the list has a head now`); }
  } finally { r.done(); }
});

test('2026-11-19-0999 (deliberate): what counts as a head line is the list as `listOfNote` reads it: a list that is only "Make it 8 bars long." has NO head (the link), a legacy paragraph that opens with Take / Extend / Mix / Morph has one (bar N)', async () => {
  const r = await rig(PLAIN);
  try {
    const plain = r.files.get(r.notePath)!;
    r.files.set(r.notePath, plain.replace('Extend [[bar_005]] to 8 bars, repeating with fills.', 'Make it 8 bars long.'));
    assert.notEqual(r.files.get(r.notePath), plain, 'the fixture was edited');
    r.type('Extend'); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, 'Extend [[bar_005]]', 'no head line');
    for (const [line, want] of [['Take [[phrase_006]].', 'Extend bar 2'], ['Extend [[bar_005]] to 8 bars.', 'Extend bar 2'], ['Mix [[bar_005]] and [[bar_002]].', 'Extend bar 2'], ['Morph [[bar_005]] into [[bar_002]] over 5 bars, in musical order.', 'Extend bar 2']] as const) {
      r.files.set(r.notePath, plain.replace('Extend [[bar_005]] to 8 bars, repeating with fills.', line));
      r.type('Extend'); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, want, line);
    }
  } finally { r.done(); }
});

test('2026-11-19-0999 (deliberate): the controller\'s own answers on the head-less click: words and trace lines of the 0992a link click; a bar no note made is refused in the 0992a words; a note that cannot be read is treated as having a head (bar N, as 0996b)', async () => {
  const r = await rig(PLAIN);
  const errors: unknown[][] = []; const origErr = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    noHead(r);
    r.type('Extend'); r.field().blur();
    assert.deepEqual(await r.ctl.duplicateClick(r.notePath, 'bars/bar_005', 3), { ok: true, message: 'Added [[bar_005]] to the composer.' });
    assert.equal(r.field().value, 'Extend [[bar_005]]'); assert.ok(win.document.activeElement === r.field());
    assert.equal(r.traces.filter((t) => t === '[forge-promptbox] link click: bars/bar_005').length, 1);
    r.type('Mix'); assert.deepEqual(await r.ctl.duplicateClick(r.notePath, null, 3), { ok: false, message: 'I cannot tell which note made that bar, so I cannot copy it.' }, 'no source note: the 0992a refusal, not a bar number');
    r.type('Morph'); assert.deepEqual(await r.ctl.duplicateClick(r.notePath, 'kits/kit_001', 3), { ok: false, message: 'That bar comes from kits/kit_001, which is not a bar, a phrase, an arrangement or a composition I can copy.' });
    assert.equal(r.field().value, 'Morph');
    r.type('Delete'); assert.deepEqual(await r.ctl.duplicateClick(r.notePath, null, 4), { ok: true, message: 'Added bar 4 to the composer.' }, 'Delete: no source note needed');
    r.files.delete(r.notePath);
    r.type('Extend'); assert.deepEqual(await r.ctl.duplicateClick(r.notePath, 'bars/bar_005', 6), { ok: true, message: 'Added bar 6 to the composer.' }, 'the note cannot be read: as 0996b');
    assert.equal(r.field().value, 'Extend bar 6'); assert.ok(errors.some((e) => /phraseHasHead/.test(String(e[0]))), 'said on the console');
    assert.deepEqual(r.pins, []);
  } finally { console.error = origErr; r.done(); }
});

// 2026-11-24-1034 (deliberate): with an empty list too, any other text ("Foo", "Make it ...") gets the bar's POSITION, `Take` still gets the note link, an EMPTY composer writes `bar 2` AND pins.
test('P3: with an empty list too: any other text gets the position (Foo, Make it ...), Take the link, an EMPTY composer pins and writes `bar 2`, selection gestures are unchanged', async () => {
  const r = await rig(FORKED);
  try {
    noHead(r);
    for (const [t, link] of [['Foo', 'Foo bar 2'], ['Take', 'Take [[bar_005]]'], ['Make it 8 bars long.', 'Make it 8 bars long. bar 2'], ['Duplicates', 'Duplicates bar 2']] as const) { r.type(t); r.click(r.bars()[1]); await r.flush(); assert.equal(r.field().value, link, t); }
    assert.deepEqual(r.pins, []);
    r.type(''); r.click(r.bars()[1]); await r.flush(); assert.equal(r.pins.length, 1, 'empty: pinned as ever'); assert.equal(r.field().value, 'bar 2', 'and written (1034)');
    r.type('Extend'); r.click(r.bars()[2], { shiftKey: true }); r.click(r.bars()[4], { ctrlKey: true }); await r.flush();
    assert.equal(r.pins.length, 1); assert.equal(r.field().value, 'Extend', 'a selection gesture adds nothing');
  } finally { r.done(); }
});

// ---- bars clicked out of order ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('2026-11-19-0999 (deliberate): under Delete, click bar 5 then bar 3: the field says `Delete bar 5 and bar 3`; Enter previews the canonical `Delete bar 3 and bar 5.`; Enter again writes ONE sorted line (one write, one undo) and the Score loses bars 3 and 5; Cmd+Z and Shift+Cmd+Z', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Delete'); r.click(r.bars()[4]); await r.flush(); r.click(r.bars()[2]); await r.flush();
    assert.equal(r.field().value, 'Delete bar 5 and bar 3', 'the click appends in click order'); assert.deepEqual(r.pins, []);
    await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Delete bar 3 and bar 5.', 'the preview is the canonical sentence'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']); assert.equal(r.calls(), 0, 'the preview writes nothing'); assert.equal(r.serviceCalls(), 0, 'the grammar read it: the service was not asked');
    await r.press({ key: 'Enter' });
    assert.equal(r.calls(), 1, 'one apply, one write');
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Delete bar 3 and bar 5.']);
    assert.equal(r.field().value, ''); assert.equal(r.serviceCalls(), 0);
    assert.equal((await scoreOf(r) as number[]).length, 6, 'the Score draws the 8 bars minus bars 3 and 5');
    await r.press({ key: 'z', metaKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.']); assert.equal((await scoreOf(r) as number[]).length, 8);
    await r.press({ key: 'Z', metaKey: true, shiftKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Delete bar 3 and bar 5.']);
  } finally { r.done(); }
});
test('2026-11-19-0999 (deliberate): out of order for Copy, Keep and Move through the real composer: each writes the sorted canonical line (a repeated bar once)', async () => {
  for (const [click, typedTail, line] of [[[6, 2], '', 'Copy bar 2 and bar 6.'], [[7, 1, 4], '', 'Keep bar 1, bar 4 and bar 7.'], [[5, 2, 5], ' back', 'Move bar 2 and bar 5 one bar left.']] as const) {
    const verb = line.split(' ')[0];
    const r = await rig(PLAIN);
    try {
      r.type(verb); for (const n of click) { r.click(r.bars()[n - 1]); await r.flush(); }
      r.type(`${r.field().value}${typedTail}`);
      await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line, `${verb}: preview`); await r.press({ key: 'Enter' });
      assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), ['Extend [[bar_005]] to 8 bars, repeating with fills.', line], verb);
      assert.equal(r.calls(), 1); assert.equal(r.serviceCalls(), 0);
    } finally { r.done(); }
  }
});
test('2026-11-19-0999 (deliberate): out of order, typed (no clicks): `Remove bar 6 and bar 2` is written `Delete bar 2 and bar 6.`; a legacy paragraph list is not disturbed', async () => {
  const r = await rig(PLAIN);
  try { r.type('Remove bar 6 and bar 2'); await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' }); assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), 'Delete bar 2 and bar 6.'); assert.equal(r.serviceCalls(), 0); } finally { r.done(); }
});
test('2026-11-20-1001 (deliberate): a real overlap and touching bars are NO LONGER refused (it was "bar 4 is in both ..." and "say bars 3 to 4."): they preview and write the one merged range (bar-words-touching-wiring.test.ts has the clicks); the service is not asked', async () => {
  const r = await rig(PLAIN);
  try {
    for (const [typed, line] of [['Delete bars 3 to 5 and bar 4', 'Delete bars 3 to 5.'], ['Delete bar 4 and bars 3 to 5', 'Delete bars 3 to 5.'], ['Keep bar 4 and bar 3', 'Keep bars 3 to 4.'], ['Copy bar 3 and bar 4.', 'Copy bars 3 to 4.']] as const) {
      r.type(typed); await r.press({ key: 'Enter' });
      assert.equal(r.suggestion(), line, typed); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview'], typed); await r.press({ key: 'Enter' });
      assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), line, typed); assert.equal(r.serviceCalls(), 0, `${typed}: the service is not asked`);
    }
  } finally { r.done(); }
});
test('P3: bars in order are unchanged through the real composer: `Delete bar 3 and bar 5` previews and writes `Delete bar 3 and bar 5.`; `Delete bars 3 to 5 and bar 8` the same words; one bar one word', async () => {
  const r = await rig(PLAIN);
  try {
    for (const [typed, line] of [['Delete bar 3 and bar 5', 'Delete bar 3 and bar 5.'], ['Delete bars 1 to 2 and bar 8', 'Delete bars 1 to 2 and bar 8.'], ['Delete bar 2', 'Delete bar 2.']] as const) {
      r.type(typed); await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line); await r.press({ key: 'Enter' });
      assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), line);
    }
  } finally { r.done(); }
});
