// 2026-11-24-1031 (pitch in bars, Stage 1b) - a MELODY PHRASE through the REAL controller + composer + dialog (happy-dom, the in-memory vault of the phrase list tests): `Repeat [[bar_101]] for 4 bars.` opens it, `Bar N is replaced by [[bar_NNN]].`,
// Keep, Delete, Copy (with its place words) and Move are lines of its list, each in ONE write and one undo; what works on hits is refused in the dialog in plain words, nothing is written and the sentence service is never asked; the note says
// `melody: true`; a composition takes a melody phrase and an arrangement refuses it in words; a rhythm phrase in the same vault is byte for byte what it was.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { emptyCompositionNote, emptyPhraseNote, emptyArrangementNote } from './empty-note-core.ts';
import { readPhraseNote } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const VAULT = { ...PHRASE_VAULT, bars: [...(PHRASE_VAULT.bars as string[]), 'bar_101', 'bar_102', 'bar_103'], phrases: [...(PHRASE_VAULT.phrases as string[]), 'phrase_101'], melody: ['bar_101', 'bar_102', 'bar_103'], melodyPhrases: ['phrase_101'] };
const win: any = new Window({ url: 'http://localhost/' });
const lines = (text: string): string[] => extractDescription(text).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));

function rig(path: string, note: string) {
  const store = new Map<string, string>([[path, note]]);
  let processCalls = 0, serviceCalls = 0; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    vault: () => VAULT, barNames: () => VAULT.bars as string[], phraseNames: () => VAULT.phrases as string[],
    setTimer: () => 0, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    askPlan: async () => { serviceCalls++; return { status: 200, json: {} }; }, configured: () => true,
    composerMenu: () => ({ items: [], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const say = async (s: string) => { field().value = s; field().dispatchEvent(new win.Event('input', { bubbles: true })); await press({ key: 'Enter' }); await press({ key: 'Enter' }); };
  const undo = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  return { store, el, say, undo, text: () => store.get(path)!, list: () => lines(store.get(path)!), params: () => { const r = readPhraseNote(store.get(path)!); return r.ok ? (r.value as any) : null; }, calls: () => processCalls, service: () => serviceCalls, said: () => dialogLast(el), ready: async () => { await ctl.inspect(path); await flush(); } };
}

test('a NEW melody phrase: Repeat [[bar_101]] for 4 bars. is its head (ONE write); the note says `melody: true`, has the list, the json (style repeat), Recipe and Python', async () => {
  const r = rig('phrases/phrase_101.md', emptyPhraseNote('phrase_101')); await r.ready();
  await r.say('Repeat [[bar_101]] for 4 bars.');
  assert.deepEqual(r.list(), ['Repeat [[bar_101]] for 4 bars.']);
  assert.deepEqual(r.params(), { kind: 'extend', source: 'bar_101', bars: 4, style: 'repeat', tempo_change_pct: 0 });
  assert.match(r.text(), /\nmelody: true\n/); assert.match(r.text(), /Take \[\[bar_101\]\]\.\nRepeat it for 4 bars\./); assert.equal(r.calls(), 1);
  assert.equal(r.service(), 0);
});

test('Bar N is replaced by [[bar]], Keep, Copy with a place, Move and Delete are lines of the list, each one write and ONE undo; the Score\'s bars are what the list says', async () => {
  const r = rig('phrases/phrase_101.md', emptyPhraseNote('phrase_101')); await r.ready();
  await r.say('Repeat [[bar_101]] for 4 bars.');
  await r.say('Bar 2 is replaced by [[bar_102]].'); await r.say('Bar 3 is replaced by [[bar_103]].');
  assert.deepEqual(r.list(), ['Repeat [[bar_101]] for 4 bars.', 'Bar 2 is replaced by [[bar_102]].', 'Bar 3 is replaced by [[bar_103]].']);
  assert.deepEqual(r.params().overrides, { 2: 'bars/bar_102', 3: 'bars/bar_103' });
  const before = r.text();
  for (const [sentence, op] of [['Copy bar 1 and put it at the end.', 'copy'], ['Move bar 2 one bar right.', 'move'], ['Delete bar 1.', 'delete'], ['Keep bars 1 to 3.', 'keep']] as const) {
    const was = r.text(); const calls = r.calls();
    await r.say(sentence);
    assert.equal(r.calls(), calls + 1, `${sentence}: ONE write`);
    assert.equal(r.params().ops.at(-1).op, op, sentence);
    assert.equal(r.list().at(-1), sentence.replace('bar 1 and put it', 'bar 1 and put it'), sentence);
    await r.undo(); assert.equal(r.text(), was, `${sentence}: ONE undo takes it back`);
    await r.undo(true); assert.equal(r.params().ops.at(-1).op, op, `${sentence}: redo`);
    await r.undo();                                                  // back to before this step, so the next one starts from the same list
  }
  assert.equal(r.text(), before);
  assert.match(r.text(), /\nmelody: true\n/);
  assert.equal(r.service(), 0);
});

test('what works on hits is refused in the dialog in plain words: nothing is written, the service is never asked, and no word of the Beat Box is said', async () => {
  const r = rig('phrases/phrase_101.md', emptyPhraseNote('phrase_101')); await r.ready();
  await r.say('Repeat [[bar_101]] for 4 bars.');
  const written = r.text(); const calls = r.calls();
  for (const s of ['Make it 20 percent slower.', 'Make it 8 bars long.', 'Thin out bars 1 to 2, by half, keeping the downbeat.', 'Double up bars 1 to 2.', 'Mix bars 1 and 2.', 'Morph bars 1 and 2 across 5 bars.', 'Extend bar 2 to 4 bars, repeating with fills.', 'Extend [[bar_101]] to 4 bars, repeating with fills.', 'Mix [[bar_101]] and [[bar_102]], 50 percent [[bar_101]], as a vote.', 'Morph [[bar_101]] into [[bar_102]] over 4 bars, in musical order.', 'Bar 2 is replaced by [[bar_001]].', 'Take [[phrase_101]].']) {
    await r.say(s);
    assert.match(r.said(), /That works on beats, not on notes\.|A phrase is all rhythm bars or all melody bars/, `${s}: ${r.said()}`);
    assert.doesNotMatch(r.said(), /Not rhythm data|channels|Beat Box|Rhythm Box|cannot be used in a phrase yet/i, s);
    assert.equal(r.text(), written, `${s}: nothing was written`);
  }
  assert.equal(r.calls(), calls); assert.equal(r.service(), 0, 'a refusal in these words is the person\'s to change: the service is not asked');
});

test('a rhythm bar in a melody phrase\'s head, and a head that is not a melody bar, are refused in words that say what to say instead', async () => {
  const r = rig('phrases/phrase_101.md', emptyPhraseNote('phrase_101')); await r.ready();
  await r.say('Repeat [[bar_001]] for 4 bars.');
  assert.match(r.said(), /Repeat is for melody bars, and bar_001 is a rhythm bar\..*Extend \[\[bar_001\]\] to 4 bars, repeating with fills/); assert.equal(r.text(), emptyPhraseNote('phrase_101'));
  assert.equal(r.service(), 0);
});

test('a COMPOSITION plays a melody phrase through the existing sentence; an ARRANGEMENT refuses it in words; beats and notes in one composition are refused', async () => {
  const c = rig('compositions/comp_101.md', emptyCompositionNote('comp_101')); await c.ready();
  await c.say('Play [[phrase_101]] for 4 bars.'); await c.say('Repeat that once more.');
  assert.deepEqual(c.list(), ['Play [[phrase_101]] for 4 bars.', 'Repeat that once more.']);
  await c.say('Then play [[phrase_001]] for 2 bars.');
  assert.match(c.said(), /A composition plays beats or notes, not both/); assert.deepEqual(c.list(), ['Play [[phrase_101]] for 4 bars.', 'Repeat that once more.']);
  const a = rig('arrangements/arr_101.md', emptyArrangementNote('arr_101')); await a.ready();
  await a.say('Play [[phrase_101]] on the [[rock]] kit.');
  assert.match(a.said(), /A melody phrase cannot be played on a kit: a kit plays beats.*track of its own/); assert.deepEqual(a.list(), []);
  assert.equal(a.service() + c.service(), 0);
});

test('P3: a rhythm phrase in the same vault takes every sentence it took, byte for byte (the playground\'s phrase_014 plus a fork, a step and a tempo line)', async () => {
  const r = rig('phrases/phrase_014.md', PLAYGROUND_PHRASES['phrase_014']); await r.ready();
  await r.say('Bar 2 is replaced by [[bar_003]].'); await r.say('Keep bars 1 to 3.'); await r.say('Make it 20 percent slower.');
  assert.deepEqual(r.list(), ['Extend [[bar_001]] to 4 bars, repeating with fills.', 'Bar 2 is replaced by [[bar_003]].', 'Keep bars 1 to 3.', 'Make it 20 percent slower.']);
  assert.equal(r.params().tempo_change_pct, -20);
  assert.doesNotMatch(r.text(), /melody/);
});
