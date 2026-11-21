// 2026-11-20-1001 (TOUCHING BARS CLICKED OUT OF ORDER BECOME ONE RANGE) - the controller half, written RED first (against 97496cc: `Delete bar 4 and bar 3` was refused in words, "say bars 3 to 4").
// The REAL controller + composer + dialog + `mountPhrase` (happy-dom), the same rig as bar-words-0999-wiring.test.ts. Under Delete a person clicks bar 4 and then bar 3: the field says what was clicked (`Delete bar 4 and bar 3`: the click rule is untouched),
// the first Enter previews the canonical RANGE (`Delete bars 3 to 4.`), the second Enter writes it as ONE line with one undo, and the Score draws the bars that range leaves; the service is never asked. Copy, Keep and Move through the same path; an inverted range
// and the Extend sentence without "to N bars" are refused in words (nothing written, the service not asked); sentences that were fine stay byte for byte (P3). No MutationObserver.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, planNewEmptyPhrase, type PhraseParams } from './phrase-core.ts';
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
    duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar),
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


const HEAD = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const TEMPOS = [100, 99, 98, 97, 96, 95, 94, 93];           // the stub engine: bar n has tempo 100 - (n - 1), so the tempo list says WHICH bars the Score draws, in order

// ---- Delete: click 4 then 3 ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('2026-11-20-1001: under Delete, click bar 4 then bar 3: the field says `Delete bar 4 and bar 3`; Enter previews the canonical RANGE `Delete bars 3 to 4.`; Enter again writes ONE line (one write, one undo), the Score loses bars 3 and 4; Cmd+Z and Shift+Cmd+Z; the service is never asked', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Delete'); r.click(r.bars()[3]); await r.flush(); r.click(r.bars()[2]); await r.flush();
    assert.equal(r.field().value, 'Delete bar 4 and bar 3', 'the click appends in click order: the click rule is untouched'); assert.deepEqual(r.pins, []);
    await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Delete bars 3 to 4.', 'the preview is the canonical range'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
    assert.equal(r.calls(), 0, 'the preview writes nothing'); assert.equal(r.serviceCalls(), 0, 'the grammar read it: the service was not asked');
    await r.press({ key: 'Enter' });
    assert.equal(r.calls(), 1, 'one apply, one write');
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD, 'Delete bars 3 to 4.']);
    assert.equal(r.field().value, ''); assert.equal(r.serviceCalls(), 0);
    assert.deepEqual(await scoreOf(r), [100, 99, 96, 95, 94, 93], 'the Score draws the 8 bars minus bars 3 and 4');
    await r.press({ key: 'z', metaKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD]); assert.deepEqual(await scoreOf(r), TEMPOS, 'one Cmd+Z takes it all back');
    await r.press({ key: 'Z', metaKey: true, shiftKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD, 'Delete bars 3 to 4.']);
    assert.equal(r.serviceCalls(), 0);
  } finally { r.done(); }
});
test('2026-11-20-1001: three bars clicked 5, 3, 4 under Keep are one range `Keep bars 3 to 5.`; clicked 1, 2, 3 in order, `Keep bars 1 to 3.`; a repeated click (3 twice) is read once', async () => {
  for (const [clicks, line, tempos] of [[[5, 3, 4], 'Keep bars 3 to 5.', [98, 97, 96]], [[1, 2, 3], 'Keep bars 1 to 3.', [100, 99, 98]], [[3, 4, 3], 'Keep bars 3 to 4.', [98, 97]]] as const) {
    const r = await rig(PLAIN);
    try {
      r.type('Keep'); for (const n of clicks) { r.click(r.bars()[n - 1]); await r.flush(); }
      await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line, `${clicks}: preview`); await r.press({ key: 'Enter' });
      assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD, line], `${clicks}`);
      assert.deepEqual(await scoreOf(r), tempos, `${clicks}: the Score`); assert.equal(r.calls(), 1); assert.equal(r.serviceCalls(), 0);
    } finally { r.done(); }
  }
});
test('2026-11-20-1001: Copy, Duplicate, Remove and Move through the real composer: touching clicks write the one range (Copy: the block again after itself; Move: the block, one bar left)', async () => {
  const cases: Array<[string, number[], string, string, number[]]> = [
    ['Copy', [4, 3], '', 'Copy bars 3 to 4.', [100, 99, 98, 97, 98, 97, 96, 95, 94, 93]],
    ['Duplicate', [6, 5, 7], '', 'Copy bars 5 to 7.', [100, 99, 98, 97, 96, 95, 94, 96, 95, 94, 93]],
    ['Remove', [8, 7], '', 'Delete bars 7 to 8.', [100, 99, 98, 97, 96, 95]],
    ['Move', [4, 3], ' back', 'Move bars 3 to 4 one bar left.', [100, 98, 97, 99, 96, 95, 94, 93]],
    ['Move', [3, 4], ' forward', 'Move bars 3 to 4 one bar right.', [100, 99, 96, 98, 97, 95, 94, 93]],
  ];
  for (const [verb, clicks, tail, line, tempos] of cases) {
    const r = await rig(PLAIN);
    try {
      r.type(verb); for (const n of clicks) { r.click(r.bars()[n - 1]); await r.flush(); }
      r.type(`${r.field().value}${tail}`);
      await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line, `${verb}: preview`); await r.press({ key: 'Enter' });
      assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD, line], verb);
      assert.deepEqual(await scoreOf(r), tempos, `${verb} ${clicks}: the Score`); assert.equal(r.calls(), 1); assert.equal(r.serviceCalls(), 0);
    } finally { r.done(); }
  }
});
test('2026-11-20-1001: typed, an overlap is one range too: `Delete bars 3 to 5 and bar 4` previews `Delete bars 3 to 5.` and writes it', async () => {
  const r = await rig(PLAIN);
  try {
    for (const [typed, line] of [['Delete bars 3 to 5 and bar 4', 'Delete bars 3 to 5.'], ['Keep bar 4 and bars 3 to 5', 'Keep bars 3 to 5.']] as const) {
      r.type(typed); await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line); await r.press({ key: 'Enter' });
      assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), line); assert.equal(r.serviceCalls(), 0);
    }
  } finally { r.done(); }
});
test('2026-11-20-1001: what is still refused in words: an inverted range (the grammar says so, as ever; the service is then asked, as ever, and cannot plan it) and (P3) the Extend sentence of a real second bar (code refused: the service is not asked); nothing is previewed or written', async () => {
  for (const [typed, words, asked] of [['Delete bars 5 to 3', /^The grammar did not accept this sentence \(line 1, column 18: Expected the last bar to be 5 or more, but found 3\.\)\.$/, true], ['Delete bar 4 and bars 5 to 3', /Expected the last bar to be 5 or more, but found 3\./, true], ['Extend bars 2 and 3 to 4 bars', /^Extend takes one bar at a time\. Say "Extend bar 2 to 4 bars\." for one bar, and again for the next\.$/, false]] as const) {
    const r = await rig(PLAIN); // a fresh note per sentence (2026-11-21-1015, deliberate): a failed sentence now leaves a waiting line, which holds the later ones
    try {
      const before = r.serviceCalls();
      r.type(typed); await r.press({ key: 'Enter' });
      assert.ok(r.entries().some((e) => words.test(e.text)), `${typed}: ${JSON.stringify(r.entries().map((e) => e.text))}`);
      assert.deepEqual(r.buttons(), [], typed); assert.ok(r.calls() <= 1, `${typed}: at most a waiting line was written (2026-11-21-1015, deliberate)`);
      assert.equal(r.serviceCalls() - before, asked ? 1 : 0, `${typed}: the service ${asked ? 'is asked, as before' : 'is not asked'}`);
      assert.ok(descriptionLines(r.files.get(r.notePath)!).filter((l) => !/Waiting:/.test(l)).length === 1, 'the list is as it was (a waiting line may sit after it: 2026-11-21-1015, deliberate)');
    } finally { r.done(); }
  }
});
test('2026-11-20-1001: `Extend bar 2, 20 percent slower` (no "to N bars") through the real composer: refused with the form to say, nothing previewed or written, the service not asked; `Extend bar 2 to 4 bars, 20 percent slower` previews and writes', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Extend bar 2, 20 percent slower'); await r.press({ key: 'Enter' });
    assert.ok(r.entries().some((e) => e.text === 'Expected "to N bars" after the bar, for example "Extend bar 2 to 4 bars, 20 percent slower."'), JSON.stringify(r.entries().map((e) => e.text)));
    assert.ok(!r.entries().some((e) => /one bar at a time/.test(e.text)));
    assert.deepEqual(r.buttons(), []); assert.equal(r.calls(), 0); assert.equal(r.serviceCalls(), 0); assert.equal(descriptionLines(r.files.get(r.notePath)!).length, 1);
    r.type('Extend bar 2 to 4 bars, 20 percent slower'); await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Extend bar 2 to 4 bars, repeating with fills, 20 percent slower.');
  } finally { r.done(); }
});
test('P3: sentences that were fine are byte for byte the same through the real composer: `Delete bar 5 and bar 3` writes `Delete bar 3 and bar 5.`, `Keep bars 1 to 2 and bar 8`, one bar one word', async () => {
  const r = await rig(PLAIN);
  try {
    for (const [typed, line] of [['Delete bar 5 and bar 3', 'Delete bar 3 and bar 5.'], ['Keep bars 1 to 2 and bar 8', 'Keep bars 1 to 2 and bar 8.'], ['Delete bar 2', 'Delete bar 2.'], ['Copy bar 3 and bar 5', 'Copy bar 3 and bar 5.']] as const) {
      r.type(typed); await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), line); await r.press({ key: 'Enter' });
      assert.equal(descriptionLines(r.files.get(r.notePath)!).pop(), line);
    }
  } finally { r.done(); }
});
