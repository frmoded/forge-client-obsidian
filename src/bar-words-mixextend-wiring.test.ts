// 2026-11-19-0999b (MIX AND EXTEND AS STEPS INSIDE A PHRASE) - THE CONTROLLER PATH, end to end on the surface a person uses (happy-dom): the REAL phrase tab (mountPhrase) and the REAL composer + dialog (the description controller) in the SAME tab element, the same rig as bar-words-0999-wiring.test.ts.
// Written RED first (against 1fa4685: `Mix bars 2 and 3.` was unreadable, so the service was asked). Pinned here:
//   * a typed `Mix bars 2 and 3.` / `Extend bar 2 to 4 bars.` is previewed as its CANONICAL sentence (the place always said for a Mix; for an Extend a place only when it inserts) by the first Enter and NEVER applied by it; the second Enter appends ONE line in ONE write, the note draws the bars the
//     sentence says (a Mix adds ONE bar, an Extend replaces bar 2 by 4 or, with a place word, inserts 4), the composer is empty, ONE undo (Cmd+Z) takes the whole step back and Shift+Cmd+Z puts it back;
//   * the sentence service is NOT asked for a sentence the grammar reads, nor for a refusal it read in words (the order, the head, Extend of several bars); it IS asked when the grammar cannot read the sentence;
//   * a random mix path draws its seed ONCE, at the preview: the line written is the line previewed;
//   * the click: with Mix or Extend in the composer and a head in the list, a click on a bar writes ` bar N` (the click rule is untouched), and the line the clicks and a few typed words make is applied.
// A DOM element is never an assert operand.
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
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] };
const PLAIN: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const HEAD_LINE = 'Extend [[bar_005]] to 8 bars, repeating with fills.';

/** The stub engine the tab and the check below share: the head's extend 100 - i, a mixed bar 300 (as `mixed_bar` only, like the real engine), an Extend step's bars 700 + i (its source label is `bar_a`), a take's bars as they are. */
const engineStub = async (data: any, params: any): Promise<any> => {
  if (params.kind === 'mix') { const m = { ...data.a, tempo_bpm: 300 }; return { type: 'musicxml', content: xmlFor(1), multi_staff_content: xmlFor(1), kit_content: xmlFor(1), mixed_bar: m }; }
  const bars = params.kind === 'transform' ? data.bars : params.kind === 'extend' && params.source === 'bar_a' ? Array.from({ length: params.bars }, (_, i) => ({ ...data, tempo_bpm: 700 + i })) : Array.from({ length: params.bars ?? 8 }, (_, i) => barOf(i));
  return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
};

async function rig(phrase: PhraseParams) {
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_020.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], ['bars/bar_002.md', BAR], ['bars/bar_009.md', BAR], ['phrases/phrase_006.md', noteContentFor('phrase_006', { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 })], [notePath, noteContentFor('phrase_020', phrase)]]);
  const traces: string[] = [];
  let processCalls = 0; let serviceCalls = 0; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    create: async (p: string, c: string) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); }, exists: (p: string) => files.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
  }, { askPlan: async () => { serviceCalls++; return { status: 200, json: {} }; }, planConfigured: () => true }));
  const off = registerBarSelectionHost({ appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }), duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar) });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_020', plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: engineStub,
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: () => {} },
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
  const scoreText = () => parent.textContent ?? '';
  return { traces, serviceCalls: () => serviceCalls, files, bars, click, field, type, press, flush, suggestion, notePath, calls: () => processCalls, buttons: () => dialogButtons(parent), entries: () => dialogEntries(parent), scoreText, done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
}
const descriptionLines = (text: string): string[] => extractDescription(text).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
/** What the Score would draw for the note as it is on disk (the same stub engine): the tempo of each bar tells the bars apart. */
const scoreOf = async (r: { files: Map<string, string>; notePath: string }): Promise<number[] | string> => {
  const out = await producePhraseNote({ readNote: async (p: string) => { const t = r.files.get(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: engineStub as never }, r.files.get(r.notePath)!, 't');
  return out.kind === 'score' ? (barsOfPayload(out.payload) as Array<{ tempo_bpm: number }>).map((b) => b.tempo_bpm) : out.message;
};
const HEAD_TEMPOS = [100, 99, 98, 97, 96, 95, 94, 93];
const EMPTY_NOTE = (planNewEmptyPhrase({ existingBasenames: [], exists: () => false, name: 'phrase_020' }) as { content: string }).content;

test('typed `Mix bars 2 and 3.`: the first Enter PREVIEWS the canonical sentence (the place said) and writes nothing; the second applies ONE line in ONE write; the note draws ONE bar more between bars 2 and 3; the composer is empty; the service was never asked', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Mix bars 2 and 3.'); await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.');
    assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']); assert.equal(r.calls(), 0, 'the preview writes nothing, and nothing applies it by itself');
    await r.flush(); await r.flush(); assert.equal(r.calls(), 0, 'never auto-applied');
    await r.press({ key: 'Enter' });
    assert.equal(r.calls(), 1, 'one apply, one write');
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE, 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.']);
    assert.equal(r.field().value, ''); assert.equal(r.serviceCalls(), 0, 'the grammar read it: the service is not asked');
    assert.deepEqual(await scoreOf(r), [100, 99, 300, 98, 97, 96, 95, 94, 93], 'the mixed bar sits between bar 2 and bar 3; both stay');
  } finally { r.done(); }
});

test('typed `Extend bar 2 to 4 bars.`: the preview says it REPLACES (no place), the apply is ONE line; the note draws bar 2 replaced by 4 bars (3 more in all); Cmd+Z takes it back in ONE step, Shift+Cmd+Z puts it back', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('extend bar 2 to 4 bars'); await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Extend bar 2 to 4 bars, repeating with fills.'); assert.equal(r.calls(), 0);
    await r.press({ key: 'Enter' }); assert.equal(r.calls(), 1);
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE, 'Extend bar 2 to 4 bars, repeating with fills.']);
    assert.deepEqual(await scoreOf(r), [100, 700, 701, 702, 703, 98, 97, 96, 95, 94, 93]);
    await r.press({ key: 'z', metaKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE]); assert.deepEqual(await scoreOf(r), HEAD_TEMPOS);
    await r.press({ key: 'Z', metaKey: true, shiftKey: true });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE, 'Extend bar 2 to 4 bars, repeating with fills.'])
    assert.equal(r.serviceCalls(), 0);
  } finally { r.done(); }
});

test('typed `Extend bar 2 to 4 bars and put them at the end.`: a place word means INSERT: the canonical sentence says the place, the original bar stays, 4 bars come after the last (4 more in all)', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Extend bar 2 to 4 bars and put them at the end.'); await r.press({ key: 'Enter' });
    assert.equal(r.suggestion(), 'Extend bar 2 to 4 bars, repeating with fills, and put them at the end.');
    await r.press({ key: 'Enter' }); assert.equal(r.calls(), 1);
    assert.deepEqual(await scoreOf(r), [...HEAD_TEMPOS, 700, 701, 702, 703]);
    await r.press({ key: 'z', metaKey: true }); assert.deepEqual(await scoreOf(r), HEAD_TEMPOS, 'one undo takes the whole step back');
    assert.equal(r.serviceCalls(), 0);
  } finally { r.done(); }
});

test('a Mix and an Extend stack with the other steps in the order of the lines (one line each, one undo each)', async () => {
  const r = await rig(PLAIN);
  try {
    for (const t of ['Mix bars 1 and 2.', 'Extend bar 3 to 2 bars.', 'Copy bar 1.']) { r.type(t); await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' }); }
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE, 'Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it between bars 1 and 2.', 'Extend bar 3 to 2 bars, repeating with fills.', 'Copy bar 1.']);
    assert.deepEqual(await scoreOf(r), [100, 100, 300, 700, 701, 98, 97, 96, 95, 94, 93], 'the mix between bars 1 and 2, bar 3 (the old bar 2) replaced by its 2 bars, then bar 1 copied');
  } finally { r.done(); }
});

test('a random mix path draws its seed ONCE, at the preview: the line applied is the line previewed, and it replays to the same bars', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Mix bars 2 and 3, as a path, in seeded order.'); await r.press({ key: 'Enter' });
    const said = r.suggestion();
    assert.match(said, /^Mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed \d+, and put it between bars 2 and 3\.$/);
    await r.press({ key: 'Enter' });
    assert.equal(descriptionLines(r.files.get(r.notePath)!)[1], said, 'the written line is the previewed one');
    const a = await scoreOf(r), b = await scoreOf(r); assert.deepEqual(a, b);
  } finally { r.done(); }
});

test('refusals in words, the service NOT asked: a Mix after a Thin out ("Do the structure steps first"), a Mix or an Extend as the first line (no head), Extend of several bars; nothing is written and there is nothing to apply', async () => {
  const t = await rig(TRANSFORM);
  try {
    t.type('Mix bars 1 and 2.'); await t.press({ key: 'Enter' });
    assert.ok(t.entries().some((e) => /Do the structure steps first/.test(e.text)), JSON.stringify(t.entries().map((e) => e.text)));
    assert.deepEqual(t.buttons(), []); assert.equal(t.calls(), 0); assert.equal(t.serviceCalls(), 0);
    t.type('Extend bar 1 to 3 bars and put them at the end.'); await t.press({ key: 'Enter' });
    assert.ok(t.entries().filter((e) => /Do the structure steps first/.test(e.text)).length >= 2); assert.equal(t.serviceCalls(), 0);
  } finally { t.done(); }
  const h = await rig(PLAIN);
  try {
    h.files.set(h.notePath, EMPTY_NOTE);
    for (const text of ['Mix bars 2 and 3.', 'Extend bar 2 to 4 bars.']) {
      h.type(text); await h.press({ key: 'Enter' });
      assert.ok(h.entries().some((e) => /A phrase starts with Extend, Mix, Morph or Take/.test(e.text)), `${text}: ${JSON.stringify(h.entries().map((e) => e.text))}`);
      assert.deepEqual(h.buttons(), []); assert.equal(h.serviceCalls(), 0, text);
    }
    assert.equal(h.calls(), 0);
  } finally { h.done(); }
  const s = await rig(PLAIN);
  try {
    s.type('Extend bars 2 and 3 to 4 bars.'); await s.press({ key: 'Enter' });
    assert.ok(s.entries().some((e) => /Say "Extend bar 2 to 4 bars\."/.test(e.text)), JSON.stringify(s.entries().map((e) => e.text)));
    assert.deepEqual(s.buttons(), []); assert.equal(s.calls(), 0); assert.equal(s.serviceCalls(), 0);
  } finally { s.done(); }
});

test('the service IS asked when the grammar cannot read the sentence (a damaged Extend, the same bar twice): the person is not left with a refusal the service might fix', async () => {
  for (const text of ['Extend bar ZZZ to 4 bars.', 'Mix bars 2 and 2.']) {
    const r = await rig(PLAIN);
    try { r.type(text); await r.press({ key: 'Enter' }); assert.ok(r.serviceCalls() >= 1, `${text}: the service was asked`); assert.ok(r.calls() <= 1, 'at most the waiting line was written (2026-11-21-1015, deliberate)'); } finally { r.done(); }
  }
});

test('a bar the phrase does not have is a refusal in words on the Score (written as a line, said at draw time), as for every other step: `Mix bars 2 and 9.`', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Mix bars 2 and 9.'); await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' });
    assert.equal(descriptionLines(r.files.get(r.notePath)!)[1], 'Mix bars 2 and 9, 50 percent bar 2, as a vote, and put it after bar 9.');
    assert.match(await scoreOf(r) as string, /bar 9 asked for, but there are 8 bars\./);
  } finally { r.done(); }
});

test('the click: `Mix` plus a click on bar 2 and bar 3 writes `Mix bar 2 and bar 3`; Enter, Enter applies the canonical Mix; `Extend` plus a click on bar 4 and the words "to 3 bars" applies an Extend; the click rule itself is untouched', async () => {
  const r = await rig(PLAIN);
  try {
    r.type('Mix'); r.click(r.bars()[1]); await r.flush(); r.click(r.bars()[2]); await r.flush();
    assert.equal(r.field().value, 'Mix bar 2 and bar 3');
    await r.press({ key: 'Enter' }); assert.equal(r.suggestion(), 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.');
    await r.press({ key: 'Enter' });
    r.type('Extend'); r.click(r.bars()[3]); await r.flush(); assert.equal(r.field().value, 'Extend bar 4');
    r.type(`${r.field().value} to 3 bars`); await r.press({ key: 'Enter' }); await r.press({ key: 'Enter' });
    assert.deepEqual(descriptionLines(r.files.get(r.notePath)!), [HEAD_LINE, 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.', 'Extend bar 4 to 3 bars, repeating with fills.']);
    assert.equal(r.serviceCalls(), 0);
    assert.deepEqual(await scoreOf(r), [100, 99, 300, 700, 701, 702, 97, 96, 95, 94, 93], 'the mix between bars 2 and 3, then bar 4 (the old bar 3, 98) replaced by its 3 bars');
  } finally { r.done(); }
});
