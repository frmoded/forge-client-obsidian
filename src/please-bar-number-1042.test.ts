// 2026-11-25-1042 Part A: a bar NUMBER is a position, never a question; a politeness word is not part of the sentence.
// The driver (`music-playground`, `phrase_010`): `please duplicate bar 5` -> `The grammar did not accept this sentence (line 1, column 1: Expected "Make it N percent slower.", ... but found "please".)`, `Asking the sentence service...`,
// `The service asks: Bar 5 is made from bar_008, which is also bar 4 of this phrase: do you mean Copy bar 4. or Copy bar 5.?`. The plain `Duplicate bar 5` worked there.
// FOUND (a): the grammar reads no `please` before a plain number (COPY_HEAD / LINK_COPY in did-you-mean-core.ts read it only for the place-word Copy and for links), so the sentence was UNREADABLE and went to the service.
// FOUND (b) (forge-transpile): the 0.2.52 `bar_names` rule taught the model to ask `which one` for a NAME held at several positions; it applied that to a NUMBER (the python tests of 0.2.54).
// A: the REAL phrase tab (it paints the note of every drawn bar) + the REAL composer and dialog, the Score of the driver's shape (bars 4 and 5 are both bar_008), a fake service that answers the driver's question.
// B: the same through the shared service rig (a hand-drawn Score host), for every politeness shape and the other two kinds of note.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { registerBarSelectionHost } from './bar-selection-bus.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { installHostClock } from './test-support/host-workspace.ts';
import { planNewBar } from './score-first-core.ts';
import { emptyCompositionNote } from './empty-note-core.ts';
import { rig as lineRig } from './test-support/service-lines-rig.ts';

const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes><divisions>4</divisions></attributes><direction><sound tempo="100"/></direction><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });
const win: any = new Window({ url: 'http://localhost/' });
const REPEATED: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '4': 'bars/bar_008', '5': 'bars/bar_008' } };          // bar 4 and bar 5 are both bar_008: the table of names holds it twice
const QUESTION = 'Bar 5 is made from bar_008, which is also bar 4 of this phrase: do you mean Copy bar 4. or Copy bar 5.?';

async function rig() {
  const clock = installHostClock(win); const notePath = 'phrases/phrase_010.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], ['bars/bar_008.md', BAR], [notePath, noteContentFor('phrase_010', REPEATED)]]);
  const requests: Array<Record<string, unknown>> = []; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = []; const timers: Array<() => void> = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => [...files.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async (p: string, c: string) => { files.set(p, c); }, exists: (p: string) => files.has(p), isAlreadyExists: () => false,
  }, { askPlan: async (payload: unknown) => { requests.push(JSON.parse(JSON.stringify(payload))); return { status: 200, json: { ok: true, lines: [], question: QUESTION } }; }, planConfigured: () => true, composerAutoApply: () => true } as never));
  const off = registerBarSelectionHost({ appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }), duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar) });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_010', plan: 'score', readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; }, writePhrase: async () => ({ ok: true }),
    compute: async (_d: any, params) => { const bars = Array.from({ length: (params as any).bars ?? 8 }, (_, i) => barOf(i)); return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars }; },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); }); return true;
    },
    stopPlayers: () => {}, setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0, inspector: { openNote: () => {}, onPin: () => {} },
  } as never;
  const handle = mountPhrase(parent, ports); await handle.load(); await clock.advance(400);
  panes.push({ path: notePath, contentEl: parent, tab: true }); await ctl.inspect(notePath); for (let i = 0; i < 240; i++) await Promise.resolve();
  const field = () => parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); await clock.advance(20); };
  const say = async (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })); await flush(); };
  const list = () => (/# Description\n([\s\S]*?)# Recipe/.exec(files.get(notePath)!)?.[1] ?? '').split('\n').map((l) => l.replace(/^\d+\.\s+/, '').trim()).filter((l) => l !== '');
  return { parent, requests, say, list, texts: () => dialogEntries(parent).map((e) => e.text), names: () => [...parent.querySelectorAll('g.measure')].map((g: any) => g.getAttribute('data-forge-bar-note')), done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
}

// ---- A: the driver's phrase, through the real tab -----------------------------------------------------------------------------------------------------------------------------------------------------
test('A [real tab, bars 4 and 5 are the same note]: the Score says bar_008 twice, and `Duplicate bar 5` (the sentence he liked) is `Copy bar 5.` with no service', async () => {
  const r = await rig();
  assert.deepEqual(r.names(), ['bar_005', 'bar_005', 'bar_005', 'bar_008', 'bar_008', 'bar_005', 'bar_005', 'bar_005'], 'the table of names holds bar_008 at positions 4 and 5');
  await r.say('Duplicate bar 5'); assert.equal(r.requests.length, 0); assert.equal(r.list().at(-1), 'Copy bar 5.', r.texts().join(' | ')); r.done();
});
test('A [real tab]: `please duplicate bar 5`, `Please duplicate bar 5.` and `duplicate bar 5 please` write the SAME line as `Duplicate bar 5`, and the service is never asked (red before 1042: the grammar found "please", the service asked "do you mean bar 4 or bar 5")', async () => {
  for (const said of ['please duplicate bar 5', 'Please duplicate bar 5.', 'duplicate bar 5 please']) {
    const r = await rig(); await r.say(said);
    assert.equal(r.requests.length, 0, `${said}: the service is not asked (${r.texts().join(' | ')})`); assert.equal(r.list().at(-1), 'Copy bar 5.', said);
    assert.ok(!r.texts().some((x) => /service|grammar did not accept|do you mean/i.test(x)), `${said}: ${r.texts().join(' | ')}`); r.done();
  }
});

// ---- B: the composer, every shape of politeness, every kind of note ---------------------------------------------------------------------------------------------------------------------------------
const NAMES6 = ['bar_005', 'bar_005', 'bar_005', 'bar_008', 'bar_008', 'bar_005'];
const HEAD6 = 'Extend [[bar_005]] to 6 bars, repeating with fills.';
const never = async () => ({ status: 200, json: { ok: true, lines: [], question: QUESTION } });
async function phrase(said: string) { const r = lineRig({ service: never, drawn: 6, names: NAMES6 }); await r.ready(); r.type(HEAD6); await r.enter(); await r.say(said); return r; }

test('B: every politeness shape of `Duplicate bar 5` writes the plain sentence\'s own line (`Copy bar 5.`), the dialog says the same `Applied` line, the service is never asked', async () => {
  const plain = await phrase('Duplicate bar 5'); assert.deepEqual(plain.list(), [HEAD6, 'Copy bar 5.']); const applied = plain.texts().at(-1);
  for (const said of ['please duplicate bar 5', 'Please duplicate bar 5.', 'duplicate bar 5 please', 'Duplicate bar 5, please.', 'Please, duplicate bar 5.', 'PLEASE DUPLICATE BAR 5', 'please duplicate bar 5 please', 'please   copy bar 5.']) {
    const r = await phrase(said); assert.equal(r.requests.length, 0, `${said}: no service call`); assert.deepEqual(r.list(), [HEAD6, 'Copy bar 5.'], said); assert.equal(r.texts().at(-1), applied, said);
  }
});
test('B: `Please move bar 1 after bar 5.` is the Move (one line, the list shows the canonical line), `please keep bars 2 to 4` the Keep; the old sentences read as they did', async () => {
  const mv = await phrase('Please move bar 1 after bar 5.'); assert.equal(mv.requests.length, 0); assert.deepEqual(mv.list(), [HEAD6, 'Move bar 1 after bar 5.']);
  const plain = await phrase('Move bar 1 after bar 5.'); assert.deepEqual(plain.list(), mv.list());
  const keep = await phrase('please keep bars 2 to 4'); assert.equal(keep.requests.length, 0); assert.deepEqual(keep.list(), [HEAD6, 'Keep bars 2 to 4.']);
});
test('B: a composition and an arrangement drop the politeness word too (`Please play [[phrase_001]].`, `play [[phrase_001]] please.`); a note NAMED please keeps it', async () => {
  for (const said of ['Please play [[phrase_001]].', 'play [[phrase_001]] please.', 'Please, play [[phrase_001]] for 2 bars.']) {
    const r = lineRig({ path: 'compositions/comp_001.md', note: emptyCompositionNote('comp_001'), service: never }); await r.ready(); await r.say(said);
    assert.equal(r.requests.length, 0, said); assert.match(r.list()[0] ?? '', /^Play \[\[phrase_001\]\]( for 2 bars)?\.$/, `${said}: ${r.texts().join(' | ')}`);
  }
  const arr = lineRig({ path: 'arrangements/arr_001.md', service: never }); await arr.ready(); await arr.say('Please play phrase_001 on the rock kit.'); assert.equal(arr.requests.length, 0, arr.texts().join(' | ')); assert.equal(arr.list().length, 1);
  const named = lineRig({ path: 'compositions/comp_001.md', note: emptyCompositionNote('comp_001'), service: never }); await named.ready(); await named.say('Play [[please]].');
  assert.ok(!named.list().some((l) => /Play \.|^Play$/.test(l)), `a link named please is not a politeness word: ${named.list().join(' | ')}`);
});
test('B: P3: a sentence that reads today reads the same; `Please.` alone, `Pleased to meet you.` and a sentence with `please` in the middle are not touched (unreadable as before: the service is asked once, the words are kept as typed)', async () => {
  const r = await phrase('Delete bar 2.'); assert.deepEqual(r.list(), [HEAD6, 'Delete bar 2.']); assert.equal(r.requests.length, 0);
  for (const said of ['Please.', 'Pleased to meet you.', 'Delete please bar 2.']) {
    const w = await phrase(said); assert.equal(w.requests.length, 1, `${said}: asked once, as before`); assert.ok(w.list().every((l) => l === HEAD6 || l === `Waiting: ${said}`), `${said}: ${w.list().join(' | ')}`);
  }
});
