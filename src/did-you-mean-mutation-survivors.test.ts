// 2026-11-20-1002 mutation survivors: tests for what the mutation pass of prompt 1002 left alive (exact-string goldens of every message and dialog line, boundary tables of the typed Undo/Redo reader and runner, of the
// Did-you-mean repairs, of the settings read and of the composer's 'resolved' rule). Each test names its mutants in a comment `// 2026-11-20-1002 mutation survivor: <file>:<line> <mutation>`.
// Written to FAIL against the mutant and PASS on the real code (verified on a scratch copy of src, ~/.forge-mem-evidence/p1002/scratch-src/).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyTyped, previewTyped, readStepText, stepForms, MAX_STEPS, type StepPorts } from './typed-step-core.ts';
import { closeLinks, didYouMeanQuestion, moveRepair, offerRepair, typoOfVerb, verbsOf } from './did-you-mean-core.ts';
import { Window } from 'happy-dom';
import { dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import { mountChatPanel } from './chat-panel-dom.ts';
import { createBarList } from './bar-list-controller.ts';
import { append, fromOutcome, memoryStore, type DialogEntry } from './dialog-core.ts';
import { step as composerStep } from './composer-core.ts';
import { DEFAULT_UI_FLAGS, COMPOSER_AUTO_APPLY, PREVIEW_BEFORE_APPLYING, composerAutoApplyOf, readUiFlags } from './ui-flags-core.ts';

// ================================================================================================================================================================================================
// A. typed-step-core: the runner and the previewer, through recording ports
// ================================================================================================================================================================================================
/** `avail`: how many steps the stack can take; `fail`: the 1-based step that answers `ok: false`. Every port call is recorded, in order, as one string. */
function rigPorts(avail: number, fail = 0) {
  const log: string[] = []; let left = avail, n = 0;
  const p: StepPorts = {
    you: (path, text) => { log.push(`you ${path} ${JSON.stringify(text)}`); },
    canStep: (path, which) => { log.push(`can ${path} ${which}`); return left > 0; },
    step: async (path, which) => { n++; log.push(`step ${path} ${which}`); if (n === fail) return { ok: false, message: `step ${n} failed` }; left--; return { ok: true, message: 'ok' }; },
    say: (path, kind, message) => { log.push(`say ${path} ${kind} ${JSON.stringify(message)}`); },
    note: (path, message) => { log.push(`note ${path} ${JSON.stringify(message)}`); },
    pb: (line) => { log.push(`pb ${JSON.stringify(line)}`); },
  };
  return { p, log, steps: () => log.filter((l) => l.startsWith('step ')).length };
}
const FORMS_UNDO = 'Undo, Undo that, Undo 3 or Undo three', FORMS_REDO = 'Redo, Redo that, Redo 3 or Redo three';
const REFUSAL_UNDO = `Undo takes only a number: write ${FORMS_UNDO}.`;

test('previewTyped: a text that is not a step is null (the caller goes on); no port is touched', () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:53 eq-flip#1/empty-string#1 ('none' -> '' / !==), early-return#1
  const r = rigPorts(1);
  assert.equal(previewTyped('phrases/p.md', 'Keep bars 1 to 2.', r.p), null); assert.equal(previewTyped('phrases/p.md', '', r.p), null);
  assert.deepEqual(r.log, []);
});
test('previewTyped: Undo and Redo (any form that reads) are a proposal applied at once: description, via, now', () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:53 empty-string#3-#6 ('undo','Undo','Redo','grammar'), bool-flip#1/#2 (ok, now), eq-flip#3
  const r = rigPorts(1);
  assert.deepEqual(previewTyped('phrases/p.md', 'Undo', r.p), { ok: true, proposal: { description: 'Undo', via: 'grammar', now: true } });
  assert.deepEqual(previewTyped('phrases/p.md', 'Undo 3.', r.p), { ok: true, proposal: { description: 'Undo', via: 'grammar', now: true } });
  assert.deepEqual(previewTyped('phrases/p.md', 'redo two', r.p), { ok: true, proposal: { description: 'Redo', via: 'grammar', now: true } });
  assert.deepEqual(r.log, [], 'the preview writes and says nothing');
});
test('previewTyped: a refusal returns the words and says them in the console, the dialog and under the card, exactly', () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:48 (refused: pb, say, note, return) and :53 eq-flip#2/empty-string#2 ('refused')
  const r = rigPorts(1);
  const res = previewTyped('bars/b.md', 'Undo the delete', r.p);
  assert.deepEqual(res, { ok: false, message: `Refused: ${REFUSAL_UNDO}` });
  assert.deepEqual(r.log, [`pb ${JSON.stringify(`step refused: ${REFUSAL_UNDO}`)}`, `say bars/b.md refused ${JSON.stringify(REFUSAL_UNDO)}`, `note bars/b.md ${JSON.stringify(`Refused: ${REFUSAL_UNDO}`)}`]);
  const r2 = rigPorts(1);
  assert.deepEqual(previewTyped('p', 'Undo. Undo.', r2.p), { ok: false, message: 'Refused: Undo and Redo have to be on their own: empty the box, then write Undo (or Redo) by itself.' });
  assert.equal(r2.log.length, 3);
  const r3 = rigPorts(1);
  assert.deepEqual(previewTyped('p', 'Redo please', r3.p), { ok: false, message: `Refused: Redo takes only a number: write ${FORMS_REDO}.` });
});

test('applyTyped: null (not a Promise) for a text that is not a step; a Promise for every step text', () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:59 early-return#1, eq-flip#1, empty-string#1
  const r = rigPorts(1);
  assert.equal(applyTyped('p', 'Keep bars 1 to 2.', false, r.p), null); assert.equal(applyTyped('p', 'Delete bar 2.', true, r.p), null); assert.deepEqual(r.log, []);
  const pr = applyTyped('p', 'Undo', false, r.p); assert.ok(pr instanceof Promise);
});
test('applyTyped: the typed text is said in the dialog unless it was said already', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:62 if-false#1, if-true#1, drop-not#1, drop-statement#1
  const a = rigPorts(1); await applyTyped('notes/n.md', 'Undo 1', false, a.p)!;
  assert.equal(a.log[0], `you notes/n.md ${JSON.stringify('Undo 1')}`);
  const b = rigPorts(1); await applyTyped('notes/n.md', 'Undo 1', true, b.p)!;
  assert.equal(b.log.filter((l) => l.startsWith('you ')).length, 0);
  const c = rigPorts(1); await applyTyped('notes/n.md', 'Undo then', false, c.p)!;
  assert.equal(c.log[0], `you notes/n.md ${JSON.stringify('Undo then')}`, 'a refused text is said too');
});
test('applyTyped: a refusal is returned, said (console, dialog, card) once, and no step is taken', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:63 if-false#1, if-true#1, eq-flip#1, empty-string#1, early-return#1
  const r = rigPorts(5);
  const res = await applyTyped('p.md', 'Undo 101', true, r.p)!;
  assert.deepEqual(res, { ok: false, message: 'Refused: Undo takes up to 100 at a time.' });
  assert.deepEqual(r.log, [`pb ${JSON.stringify('step refused: Undo takes up to 100 at a time.')}`, `say p.md refused ${JSON.stringify('Undo takes up to 100 at a time.')}`, `note p.md ${JSON.stringify('Refused: Undo takes up to 100 at a time.')}`]);
  assert.equal(MAX_STEPS, 100);
});

test('applyTyped: Undo N takes up to N steps, one after the other, asking the stack before each, and sums up in one line', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:64 number+1#1 (done = 0), :65 boundary#1 (< count), logic#1 (&& canStep), :68 drop-statement#1 (done++), :70 pb, :72 summary
  const r = rigPorts(5);
  const res = await applyTyped('p.md', 'Undo 3', true, r.p)!;
  assert.deepEqual(res, { ok: true, disk: '' });
  assert.deepEqual(r.log, [
    'can p.md undo', 'step p.md undo', 'can p.md undo', 'step p.md undo', 'can p.md undo', 'step p.md undo',
    `pb ${JSON.stringify('typed undo: 3 of 3')}`, `say p.md notice ${JSON.stringify('Undid 3 sentences.')}`,
  ]);
});
test('applyTyped: fewer steps than asked say how many were done and why it stopped (singular and plural, undo and redo)', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:72 eq-flip#1/#2, number+1#2, empty-string#4-#7, boundary#2 (done < count)
  const one = rigPorts(1); await applyTyped('p', 'Undo 3', true, one.p)!;
  assert.deepEqual(one.log.slice(-2), [`pb ${JSON.stringify('typed undo: 1 of 3')}`, `say p notice ${JSON.stringify('Undid 1 sentence: there was nothing more to undo.')}`]);
  const two = rigPorts(2); await applyTyped('p', 'Undo ten', true, two.p)!;
  assert.deepEqual(two.log.slice(-2), [`pb ${JSON.stringify('typed undo: 2 of 10')}`, `say p notice ${JSON.stringify('Undid 2 sentences: there was nothing more to undo.')}`]);
  const redo = rigPorts(2); await applyTyped('p', 'Redo 2', true, redo.p)!;
  assert.deepEqual(redo.log.slice(-2), [`pb ${JSON.stringify('typed redo: 2 of 2')}`, `say p notice ${JSON.stringify('Redid 2 sentences.')}`]);
  const redo1 = rigPorts(1); await applyTyped('p', 'Redo five', true, redo1.p)!;
  assert.deepEqual(redo1.log.slice(-2), [`pb ${JSON.stringify('typed redo: 1 of 5')}`, `say p notice ${JSON.stringify('Redid 1 sentence: there was nothing more to redo.')}`]);
  assert.equal(redo1.steps(), 1, 'it stops when the stack is empty');
});
test('applyTyped: a count of one says nothing more (the stack\'s own words stand); the count is never exceeded', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:72 if-false#1, if-true#1, boundary#1 (count > 1), number+1#1 (count > 2)
  const a = rigPorts(5); const ra = await applyTyped('p', 'Undo', true, a.p)!;
  assert.deepEqual(ra, { ok: true, disk: '' }); assert.deepEqual(a.log, ['can p undo', 'step p undo', `pb ${JSON.stringify('typed undo: 1 of 1')}`]);
  const b = rigPorts(5); await applyTyped('p', 'Redo 1', true, b.p)!; assert.deepEqual(b.log, ['can p redo', 'step p redo', `pb ${JSON.stringify('typed redo: 1 of 1')}`]);
  const c = rigPorts(5); await applyTyped('p', 'Undo 2', true, c.p)!; assert.equal(c.steps(), 2); assert.equal(c.log.at(-1), `say p notice ${JSON.stringify('Undid 2 sentences.')}`);
});
test('applyTyped: nothing to undo or redo is said in words, in the dialog and under the card, and is a success with nothing written', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:71 (done === 0: if-false/if-true/eq-flip/number+1, the message, say, note, return, bool-flip)
  for (const [text, which, count] of [['Undo', 'undo', 1], ['Redo', 'redo', 1], ['Undo 3', 'undo', 3], ['Redo two', 'redo', 2]] as const) {
    const r = rigPorts(0); const res = await applyTyped('p.md', text, true, r.p)!;
    assert.deepEqual(res, { ok: true, disk: '' }, text);
    assert.deepEqual(r.log, [`can p.md ${which}`, `pb ${JSON.stringify(`typed ${which}: 0 of ${count}`)}`, `say p.md notice ${JSON.stringify(`There is nothing to ${which}.`)}`, `note p.md ${JSON.stringify(`There is nothing to ${which}.`)}`], text);
  }
});
test('applyTyped: a step that fails ends it: its words go under the card, the result is not ok, nothing is summed up', async () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:67 if-false#1, if-true#1, drop-not#1, drop-statement#1, early-return#1, bool-flip#1
  const r = rigPorts(5, 2); const res = await applyTyped('p.md', 'Undo 3', true, r.p)!;
  assert.deepEqual(res, { ok: false, message: 'step 2 failed' });
  assert.deepEqual(r.log, ['can p.md undo', 'step p.md undo', 'can p.md undo', 'step p.md undo', `note p.md ${JSON.stringify('step 2 failed')}`]);
  const f1 = rigPorts(5, 1); assert.deepEqual(await applyTyped('p.md', 'Redo', true, f1.p)!, { ok: false, message: 'step 1 failed' });
  assert.deepEqual(f1.log, ['can p.md redo', 'step p.md redo', `note p.md ${JSON.stringify('step 1 failed')}`]);
});

test('readStepText: the refusals and counts, exact (Undo 0/1/100/101, the number words one..ten and eleven, the lone-sentence rule)', () => {
  // 2026-11-20-1002 mutation survivor: src/typed-step-core.ts:28 (the regex always reads a single sentence that opens with the word: m === null is unreachable; the goldens pin the neighbours)
  assert.equal(stepForms('Undo'), FORMS_UNDO); assert.equal(stepForms('Redo'), FORMS_REDO);
  const REF = (m: string) => ({ kind: 'refused', message: m, step: true });
  assert.deepEqual(readStepText('Undo 0'), REF(REFUSAL_UNDO)); assert.deepEqual(readStepText('Undo 1'), { kind: 'undo', count: 1 });
  assert.deepEqual(readStepText('Undo 100'), { kind: 'undo', count: 100 }); assert.deepEqual(readStepText('Undo 101'), REF('Undo takes up to 100 at a time.'));
  assert.deepEqual(readStepText('Redo 101'), REF('Redo takes up to 100 at a time.')); assert.deepEqual(readStepText('Redo 0'), REF(`Redo takes only a number: write ${FORMS_REDO}.`));
  ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].forEach((w, i) => assert.deepEqual(readStepText(`Undo ${w}`), { kind: 'undo', count: i + 1 }, w));
  assert.deepEqual(readStepText('Undo eleven'), REF(REFUSAL_UNDO)); assert.deepEqual(readStepText('Undo zero'), REF(REFUSAL_UNDO));
  const ALONE = 'Undo and Redo have to be on their own: empty the box, then write Undo (or Redo) by itself.';
  assert.deepEqual(readStepText('Undo. Redo.'), REF(ALONE)); assert.deepEqual(readStepText('Undo\nKeep bars 1 to 2.'), REF(ALONE));
  assert.deepEqual(readStepText('Delete bar 2. Undo.'), REF(ALONE));
  assert.deepEqual(readStepText('Undo\n'), { kind: 'undo', count: 1 }); assert.deepEqual(readStepText('Undo 3!'), { kind: 'undo', count: 3 });
});

// ================================================================================================================================================================================================
// B. did-you-mean-core
// ================================================================================================================================================================================================
test('typoOfVerb: a word is letters only: a one-edit neighbour that holds a digit or a dash is never mended', () => {
  // 2026-11-20-1002 mutation survivor: src/did-you-mean-core.ts:44 if-false#1 (the letters-only guard)
  const v = verbsOf('phrase');
  assert.equal(typoOfVerb('Dele-e', v), null); assert.equal(typoOfVerb('Delet3', v), null); assert.equal(typoOfVerb('De1ete', v), null); assert.equal(typoOfVerb('Mov3', v), null);
  assert.equal(typoOfVerb('Delet', v), 'Delete', 'the same word without the stray character is mended');
});
test('typoOfVerb: distance 0 is no typo, distance 1 is mended, distance 2 is not; one nearest verb is mended, two are a guess and are not (the verbs of the grammar\'s own tables)', () => {
  // 2026-11-20-1002 mutation survivor: src/did-you-mean-core.ts:24-29 (the Damerau distance; the mutants that survive are the equivalent ones) and :47-48 (unique match)
  const phrase = verbsOf('phrase'), bar = verbsOf('bar');
  for (const [word, fixed] of [['Delete', null], ['Delet', 'Delete'], ['Delt', null], ['Deelte', 'Delete'], ['Dlxete', null], ['Deleet', 'Delete'], ['Deleteee', null], ['Mvoe', 'Move'], ['Mvoee', null]] as const) assert.equal(typoOfVerb(word, phrase), fixed, word);
  for (const [word, fixed] of [['Clear', null], ['Clera', 'Clear'], ['Cler', 'Clear'], ['Clr', null], ['Clearr', 'Clear'], ['Clearrr', null], ['Hti', 'Hit'], ['Hitt', 'Hit'], ['Hxx', null]] as const) assert.equal(typoOfVerb(word, bar), fixed, word);
  assert.equal(typoOfVerb('Bat', ['bar', 'bat', 'cat']), null, 'a verb already'); assert.equal(typoOfVerb('Bot', ['bat', 'bit']), null, 'two verbs one edit away: no guess');
  assert.equal(typoOfVerb('Bot', ['bat', 'cart']), 'Bat', 'one verb one edit away, the other two away: the one');
  assert.equal(typoOfVerb('Bxt', ['bat', 'bar']), 'Bat', 'one nearest (bar is two away)');
});
test('closeLinks: a one-letter name with its one bracket is closed (the empty-link rule looks at the whole name)', () => {
  // 2026-11-20-1002 mutation survivor: src/did-you-mean-core.ts:62 number+1#2 (rest.slice(0, one) -> slice(1, one))
  assert.equal(closeLinks('Play [[x]'), 'Play [[x]]'); assert.equal(closeLinks('Play [[x] now.'), 'Play [[x]] now.'); assert.equal(closeLinks('Take [[]'), 'Take [[]');
});
test('moveRepair: places are counted exactly (one, two, three and more; before and after; left and right) and the hint says them exactly', () => {
  // 2026-11-20-1002 mutation survivor: src/did-you-mean-core.ts:75 (place arithmetic) - the equal-bar case is an equivalent mutant (boundary#1), pinned here as null
  const ONE = 'Move takes one bar one place at a time.';
  const cases: Array<[string, string, string]> = [
    ['Move bar 4 before bar 2.', 'Move bar 4 one bar left.', `${ONE} Bar 4 before bar 2 is 2 places left: say it twice (the second time for bar 3).`],
    ['Move bar 4 before bar 3.', 'Move bar 4 one bar left.', ONE],
    ['Move bar 5 before bar 2.', 'Move bar 5 one bar left.', `${ONE} Bar 5 before bar 2 is 3 places left: say it 3 times (the next time for bar 4).`],
    ['Move bar 4 after bar 2.', 'Move bar 4 one bar left.', ONE],
    ['Move bar 5 after bar 2.', 'Move bar 5 one bar left.', `${ONE} Bar 5 after bar 2 is 2 places left: say it twice (the second time for bar 4).`],
    ['Move bar 6 after bar 2.', 'Move bar 6 one bar left.', `${ONE} Bar 6 after bar 2 is 3 places left: say it 3 times (the next time for bar 5).`],
    ['Move bar 2 before bar 4.', 'Move bar 2 one bar right.', ONE],
    ['Move bar 2 before bar 5.', 'Move bar 2 one bar right.', `${ONE} Bar 2 before bar 5 is 2 places right: say it twice (the second time for bar 3).`],
    ['Move bar 2 before bar 6.', 'Move bar 2 one bar right.', `${ONE} Bar 2 before bar 6 is 3 places right: say it 3 times (the next time for bar 3).`],
    ['Move bar 2 after bar 3.', 'Move bar 2 one bar right.', ONE],
    ['Move bar 2 after bar 4.', 'Move bar 2 one bar right.', `${ONE} Bar 2 after bar 4 is 2 places right: say it twice (the second time for bar 3).`],
    ['Move bar 2 after bar 6.', 'Move bar 2 one bar right.', `${ONE} Bar 2 after bar 6 is 4 places right: say it 4 times (the next time for bar 3).`],
  ];
  for (const [t, sentence, hint] of cases) assert.deepEqual(moveRepair(t), { sentence, hint }, t);
  for (const t of ['Move bar 3 before bar 3.', 'Move bar 3 after bar 3.', 'Move bar 4 after bar 3.', 'Move bar 4 before bar 5.', 'Move bar 4 before bar 4.']) assert.equal(moveRepair(t), null, t);
});
test('offerRepair: no repair says nothing and gives null; a repair the grammar reads is SAID as a question with its hint and handed back as the proposal', async () => {
  // 2026-11-20-1002 mutation survivor: src/did-you-mean-core.ts:117 (fix === null: if-false, if-true, eq-flip, early-return), :118 (say, 'suggestion', 'repair'), :119 (return, ok, 'grammar')
  const said: unknown[] = []; const say = (ev: unknown) => { said.push(ev); };
  assert.equal(await offerRepair('Banana split.', 'phrase', () => true, say as never), null); assert.equal(await offerRepair('Delete bar 2.', 'phrase', () => true, say as never), null);
  assert.equal(await offerRepair('Delet bar 2.', 'phrase', () => false, say as never), null); assert.deepEqual(said, []);
  const res = await offerRepair('delet bar 2', 'phrase', () => true, say as never);
  assert.deepEqual(res, { ok: true, proposal: { description: 'Delete bar 2.', via: 'grammar', instead: 'Delete bar 2.' } });
  assert.deepEqual(said, [{ type: 'suggestion', description: 'Delete bar 2.', recipe: '', via: 'repair', question: 'Did you mean: Delete bar 2?' }]);
  said.length = 0;
  const mv = await offerRepair('Move bar 4 before bar 2.', 'phrase', async () => true, say as never);
  assert.deepEqual(mv, { ok: true, proposal: { description: 'Move bar 4 one bar left.', via: 'grammar', instead: 'Move bar 4 one bar left.' } });
  assert.deepEqual(said, [{ type: 'suggestion', description: 'Move bar 4 one bar left.', recipe: '', via: 'repair', question: 'Did you mean: Move bar 4 one bar left? Move takes one bar one place at a time. Bar 4 before bar 2 is 2 places left: say it twice (the second time for bar 3).' }]);
  assert.equal(didYouMeanQuestion({ sentence: 'Play [[a]].' }), 'Did you mean: Play [[a]]?');
});

// ================================================================================================================================================================================================
// C. the controller on the surface a person uses (the real controller, composer and dialog in happy-dom over an in-memory vault): the DIRECT calls of the controller's own members (applyFromBox, previewFromBox)
//    and the exact words of the dialog
// ================================================================================================================================================================================================
const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', COMP = 'compositions/song_1.md', BAR = 'bars/bar_001.md';
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const kitNote = '---\ntype: data\ncontent_type: json\n---\n';
function rig(opts: { path?: string; note?: string; preview?: boolean; failReadNo?: { at: number } } = {}) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set('arrangements/arr_001.md', emptyArrangementNote('arr_001')); store.set('compositions/song_1.md', emptyCompositionNote('song_1'));
  for (const k of ['rock', 'latin', 'jazz']) store.set(`kits/${k}.md`, kitNote);
  store.set(path, opts.note ?? (path.startsWith('arrangements/') ? emptyArrangementNote('x') : path.startsWith('compositions/') ? emptyCompositionNote('x') : path.startsWith('bars/') ? PLAYGROUND_BARS['bar_001'] : emptyPhraseNote('x')));
  const creates: string[] = []; const writes: string[] = []; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = []; const timers: Array<() => void> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { if (opts.failReadNo !== undefined && --opts.failReadNo.at === 0) throw new Error('gone'); const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); creates.push(p); }, exists: (p: string) => store.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
    trash: async (p: string) => { store.delete(p); },
  }, { composerAutoApply: () => opts.preview !== true, composerMenu: () => ({ items: [{ id: 'new_phrase', label: 'New phrase' }], run: () => {} }) });
  const ctl: any = createDescriptionController({ ...ports, drawSeed: () => 99 });
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  const texts = () => dialogEntries(el).map((e) => `${e.kind}: ${e.text.replace(/^✓\s*/, '')}`);
  const suggestionLines = () => [...el.querySelectorAll('.forge-chat-suggestion-description')].map((n) => n.textContent);
  return { ctl, store, creates, writes, el, flush, type, enter, texts, suggestionLines, ready: async () => { await ctl.inspect(path); await flush(); }, path, last: () => dialogLast(el) };
}

test('applyFromBox (the controller\'s own apply, no preview before it): the typed sentence is said as "you", then the dialog says "Applied (<the change>): <the line>" in the two-Enter words (a phrase and a bar)', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:304 bool-flip#1 (said = true), bool-flip#2 (instant = true), :306 if-false#2/drop-statement#1/empty-string#1 ('you' in a bar)
  const r = rig(); await r.ready();
  assert.deepEqual(await r.ctl.applyFromBox(PH, EXTEND), { ok: true, disk: '' });
  assert.deepEqual(r.texts(), [`you: ${EXTEND}`, `applied: Applied (now extend): 1. ${EXTEND}`]);
  const b = rig({ path: BAR }); await b.ready();
  assert.deepEqual(await b.ctl.applyFromBox(BAR, 'Set the tempo to 96.'), { ok: true, disk: '' });
  assert.deepEqual(b.texts(), ['you: Set the tempo to 96.', 'applied: Applied (1 line): Set the tempo to 96.']);
});
test('applyFromBox: an action sentence is a phrase\'s alone (an arrangement never copies a note), and a refused Duplicate is said in words by the action, not read as a list line', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:309 if-true#1 (family === phrase), empty-string#3 ('refused')
  const a = rig({ path: ARR }); await a.ready();
  await a.ctl.applyFromBox(ARR, 'Duplicate [[bar_007]].'); assert.deepEqual(a.creates, [], 'no copy is made from an arrangement');
  const p = rig(); await p.ready();
  const res = await p.ctl.applyFromBox(PH, 'Duplicate.');
  assert.equal(res.ok, false); assert.equal(p.last(), 'Refused: Duplicate what? Click a bar on the Score, or write its link, for example: Duplicate [[bar_007]].'); assert.deepEqual(p.creates, []);
});
test('previewFromBox (the controller\'s own first Enter, no third argument): the preview is SHOWN ("This is what would be written"), the proposal is not instant', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:874 bool-flip#1 (instant = true), :640 eq-flip#1 (replaces), :574 empty-string#2 ('grammar'), :575 bool-flip (action, instant)
  const r = rig(); await r.ready();
  const res = await r.ctl.previewFromBox(PH, EXTEND);
  assert.deepEqual(res, { ok: true, proposal: { description: EXTEND, via: 'grammar' } });
  assert.deepEqual(r.texts(), [`you: ${EXTEND}`, 'suggestion: The grammar read your sentence. This is what would be written.']);
  assert.deepEqual(r.suggestionLines(), [EXTEND]);
});
test('previewFromBox of a Duplicate: the proposal is an action (and instant only when asked); the dialog line says "The grammar read your sentence"', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:574 empty-string#2, :575 empty-string#1 ('grammar'), bool-flip#2 (action: true), bool-flip#3 (instant: true), :562 bool-flip#1 (default instant)
  const r = rig(); await r.ready();
  assert.deepEqual(await r.ctl.previewFromBox(PH, 'Duplicate [[bar_007]].'), { ok: true, proposal: { description: 'Copy [[bar_007]] to a new bar.', via: 'grammar', action: true } });
  assert.deepEqual(r.texts().slice(1), ['suggestion: The grammar read your sentence. This is what would be written.']); assert.deepEqual(r.suggestionLines(), ['Copy [[bar_007]] to a new bar.']);
  const q = rig(); await q.ready();
  assert.deepEqual(await q.ctl.previewFromBox(PH, 'Duplicate [[bar_007]].', true), { ok: true, proposal: { description: 'Copy [[bar_007]] to a new bar.', via: 'grammar', action: true, instant: true } });
  assert.deepEqual(q.texts().filter((t) => t.startsWith('suggestion')), [], 'applied at once: nothing is shown first');
});
test('previewFromBox of a sentence that replaces an earlier line: the proposal carries `replaces`, and an instant one says nothing in the dialog', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:640 eq-flip#1 (replaces !== \'\')
  const r = rig({ path: ARR }); await r.ready();
  await r.ctl.applyFromBox(ARR, 'Play [[phrase_001]] on the [[rock]] kit.');
  const res = await r.ctl.previewFromBox(ARR, 'Play [[phrase_002]] on the [[rock]] kit.');
  assert.equal(res.ok, true); assert.equal(res.proposal.replaces, 'Play [[phrase_001]] on the [[rock]] kit.');
  const none = await r.ctl.previewFromBox(ARR, 'Play [[phrase_002]] on the [[latin]] kit.');
  assert.equal(none.ok, true); assert.equal('replaces' in none.proposal, false, 'nothing replaced: no key at all');
});

test('the instant words after the fact: several sentences are joined with one space, and several replaced lines too ("This replaces: A B")', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:666 empty-string#4 (the join of the replaced sentences; the join of the added ones is pinned by instant-apply-wiring.test.ts)
  const r = rig({ path: ARR }); await r.ready();
  const A = 'Play the [[rock]] kit at 60 percent volume.', B = 'Play the [[latin]] kit at 60 percent volume.';
  await r.ctl.applyFromBox(ARR, 'Play [[phrase_001]] on the [[rock]] kit.'); await r.ctl.applyFromBox(ARR, 'Play [[phrase_002]] on the [[latin]] kit.');
  await r.ctl.applyFromBox(ARR, A); await r.ctl.applyFromBox(ARR, B);
  const A2 = 'Play the [[rock]] kit at 80 percent volume.', B2 = 'Play the [[latin]] kit at 80 percent volume.';
  r.type(`${A2} ${B2}`); await r.enter();
  const last = r.texts().filter((t) => t.startsWith('applied: ')).pop();
  assert.equal(last, `applied: Applied. ${A2} ${B2} This replaces: ${A} ${B}`);
});
test('applyFromBox when the note cannot be read back after the write: the dialog still says the whole list, its lines joined with one space', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:666 empty-string#3 (plan.list.join(\' \') when the description cannot be read)
  const arm = { at: -1 }; const r = rig({ failReadNo: arm }); await r.ready();
  await r.ctl.applyFromBox(PH, EXTEND); arm.at = 2;       // the second read of the next apply: the one that reads the Description back
  const res = await r.ctl.applyFromBox(PH, 'Keep bars 1 to 3.');
  assert.equal(res.ok, true);
  const last = r.texts().filter((t) => t.startsWith('applied: ')).pop();
  assert.equal(last, `applied: Applied (ops changed): ${EXTEND} Keep bars 1 to 3.`);
});

test('a typed Undo or Redo in the dialog: the refusals and the nothing-to-undo notice are said in exact words, as "you", "refused" and "notice" lines; under the card the same words', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:760 empty-string#1 ('you'), #2 ('refused'), #4 ('plugin'); the notice kind (#3) is pinned here too
  const r = rig(); await r.ready();
  r.type('Undo the delete'); await r.enter();
  assert.deepEqual(r.texts(), ['you: Undo the delete', 'refused: Refused: Undo takes only a number: write Undo, Undo that, Undo 3 or Undo three.']);
  assert.equal((r.el.querySelector('.forge-composer-error') as HTMLElement).textContent, 'Refused: Undo takes only a number: write Undo, Undo that, Undo 3 or Undo three.');
  r.type('Redo 101'); await r.enter();
  assert.equal(r.texts().at(-1), 'refused: Refused: Redo takes up to 100 at a time.');
  r.type('Undo. Redo.'); await r.enter();
  assert.equal(r.texts().at(-1), 'refused: Refused: Undo and Redo have to be on their own: empty the box, then write Undo (or Redo) by itself.');
  assert.deepEqual(r.writes, []);
});
test('applyFromBox of a typed Undo (no preview before it): the typed word is said as "you", then the notice; Undo N says how many', async () => {
  // 2026-11-20-1002 mutation survivor: src/description-apply.ts:760 empty-string#1 ('you': the runner says the typed text when it was not said yet)
  const r = rig(); await r.ready();
  assert.deepEqual(await r.ctl.applyFromBox(PH, 'Undo'), { ok: true, disk: '' });
  assert.deepEqual(r.texts(), ['you: Undo', 'notice: There is nothing to undo.']);
  assert.equal((r.el.querySelector('.forge-composer-error') as HTMLElement).textContent, 'There is nothing to undo.');
  await r.ctl.applyFromBox(PH, 'Redo 2'); assert.equal(r.texts().at(-1), 'notice: There is nothing to redo.');
  await r.ctl.applyFromBox(PH, EXTEND); await r.ctl.applyFromBox(PH, 'Keep bars 1 to 3.'); await r.ctl.applyFromBox(PH, 'Delete bar 2.');
  const w = r.writes.length;
  await r.ctl.applyFromBox(PH, 'Undo 5'); assert.equal(r.texts().at(-1), 'notice: Undid 3 sentences: there was nothing more to undo.'); assert.equal(r.writes.length, w + 3);
  await r.ctl.applyFromBox(PH, 'Redo two'); assert.equal(r.texts().at(-1), 'notice: Redid 2 sentences.');
  await r.ctl.applyFromBox(PH, 'redo 9'); assert.equal(r.texts().at(-1), 'notice: Redid 1 sentence: there was nothing more to redo.');
});

// ================================================================================================================================================================================================
// D. the dialog panel, the composer's rules, the prompt box and the settings read
// ================================================================================================================================================================================================
test('the dialog panel draws "Use this" (a button) on an OPEN did-you-mean suggestion and on no other; the button does what Enter does (applies the suggestion)', async () => {
  // 2026-11-20-1002 mutation survivor: src/chat-panel-dom.ts:145 empty-string#3 ('button' type), #5 ('Use this'), if-false/if-true/eq-flip/logic/drop-statement (the condition and the click)
  const applied: Array<{ text: string; instead?: string }> = [];
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const h = mountChatPanel(host, { box: { preview: async () => ({ ok: true as const, proposal: { description: 'Delete bar 2.', via: 'grammar' as const, instead: 'Delete bar 2.' } }), apply: async (text: string, p: { instead?: string }) => { applied.push({ text, instead: p.instead }); return { ok: true }; } }, store: memoryStore() }, '');
  const repair = fromOutcome({ type: 'suggestion', description: 'Delete bar 2.', recipe: '', via: 'repair', question: 'Did you mean: Delete bar 2?' });
  let l: DialogEntry[] = append([], repair, 1);
  h.render(l, '');
  const btns = [...host.querySelectorAll('.forge-chat-repair')] as HTMLButtonElement[];
  assert.equal(btns.length, 1); assert.equal(btns[0]!.textContent, 'Use this'); assert.equal(btns[0]!.type, 'button'); assert.equal(btns[0]!.getAttribute('type'), 'button'); assert.equal(btns[0]!.className, 'forge-chat-link forge-chat-repair');
  assert.equal(host.querySelector('.forge-chat-chosen')!.textContent, 'Press Enter to apply, Esc to discard');
  // a plain grammar suggestion and an open repair that is no longer open have no button
  h.render(append([], fromOutcome({ type: 'suggestion', description: 'Delete bar 2.', recipe: '', via: 'grammar' }), 1), ''); assert.equal(host.querySelectorAll('.forge-chat-repair').length, 0);
  h.render([{ ...l[0]!, suggestion: { ...l[0]!.suggestion!, state: 'discarded' } } as DialogEntry], ''); assert.equal(host.querySelectorAll('.forge-chat-repair').length, 0, 'a discarded suggestion has no button');
  h.render([{ ...l[0]!, suggestion: { ...l[0]!.suggestion!, state: 'applied' } } as DialogEntry], ''); assert.equal(host.querySelectorAll('.forge-chat-repair').length, 0, 'an applied suggestion has no button');
  // the button is Enter: with the composer previewing a suggestion it applies it
  h.render(l, '');
  const field = host.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  field.value = 'Delet bar 2.'; field.dispatchEvent(new win.Event('input', { bubbles: true }));
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); for (let i = 0; i < 60; i++) await Promise.resolve();
  assert.deepEqual(applied, [], 'a suggestion with `instead` waits: nothing applied by the first Enter');
  (host.querySelector('.forge-chat-repair') as HTMLElement).click(); for (let i = 0; i < 60; i++) await Promise.resolve();
  assert.deepEqual(applied, [{ text: 'Delet bar 2.', instead: 'Delete bar 2.' }], 'the button applies what Enter applies');
  h.dispose();
});

test('composer-core: a first answer is applied at once when the box applies at once (grammar, no `instead`), or the proposal is instant, or now; every other proposal waits for the second Enter', () => {
  // 2026-11-20-1002 mutation survivor: src/composer-core.ts:88 (the resolved condition: autoApply, via grammar, instead, instant, now) - all killed by composer-core.test.ts; the table pins every cell
  const working = { phase: 'working' as const, text: 'Keep bars 1 to 3.', seq: 4 };
  const cell = (proposal: Record<string, unknown>, autoApply: boolean | undefined) => composerStep(working, { type: 'resolved', seq: 4, proposal: { description: 'd', via: 'grammar', ...proposal } as never, autoApply }).state.phase;
  assert.equal(cell({}, true), 'applying'); assert.equal(cell({}, false), 'previewing'); assert.equal(cell({}, undefined), 'previewing');
  assert.equal(cell({ via: 'service' }, true), 'previewing', 'a service plan is always shown first');
  assert.equal(cell({ instead: 'Delete bar 2.' }, true), 'previewing', 'a "did you mean" is never applied by the setting: only Enter says yes');
  assert.equal(cell({ instead: 'Delete bar 2.', instant: true }, false), 'applying'); assert.equal(cell({ instant: true }, false), 'applying'); assert.equal(cell({ now: true }, false), 'applying');
  assert.equal(cell({ via: 'service', now: true }, false), 'applying', 'a typed Undo acts at the first Enter whatever the setting says');
  assert.equal(cell({ action: true }, true), 'applying', 'an action sentence applies at once with the rest');
  assert.equal(composerStep(working, { type: 'resolved', seq: 3, proposal: { description: 'd', via: 'grammar' }, autoApply: true }).state, working, 'a late answer changes nothing');
  const applying = composerStep(working, { type: 'resolved', seq: 4, proposal: { description: 'd', via: 'grammar', now: true }, autoApply: false });
  assert.deepEqual(applying.effect, { do: 'apply', text: 'Keep bars 1 to 3.', proposal: { description: 'd', via: 'grammar', now: true }, seq: 4 });
});

test('the setting `Preview before applying`: off by default (one Enter applies); a stored old `composerAutoApply` is ignored; a stored non-boolean is the default; only a real boolean counts', () => {
  assert.equal(COMPOSER_AUTO_APPLY, true); assert.equal(PREVIEW_BEFORE_APPLYING, false); assert.equal(DEFAULT_UI_FLAGS.previewBeforeApplying, false);
  assert.equal(readUiFlags(undefined).previewBeforeApplying, false); assert.equal(readUiFlags(null).previewBeforeApplying, false); assert.equal(readUiFlags({}).previewBeforeApplying, false);
  assert.equal(composerAutoApplyOf(readUiFlags({})), true, 'default: a sentence the grammar reads applies on the first Enter');
  assert.equal(readUiFlags({ previewBeforeApplying: true }).previewBeforeApplying, true); assert.equal(composerAutoApplyOf(readUiFlags({ previewBeforeApplying: true })), false);
  assert.equal(readUiFlags({ previewBeforeApplying: false }).previewBeforeApplying, false);
  for (const old of [true, false]) { const f = readUiFlags({ composerAutoApply: old } as never); assert.equal(f.previewBeforeApplying, false, `an old stored composerAutoApply=${old} is ignored`); assert.equal('composerAutoApply' in f, false); assert.equal(composerAutoApplyOf(f), true); }
  for (const bad of ['true', 'yes', 1, 0, null, {}, []]) assert.equal(readUiFlags({ previewBeforeApplying: bad }).previewBeforeApplying, false, `a stored ${JSON.stringify(bad)} is the default`);
  assert.deepEqual(readUiFlags({ previewBeforeApplying: true }), { ...DEFAULT_UI_FLAGS, previewBeforeApplying: true });
});

test('prompt-box-dom: a preview that throws is said under the card as "Could not ask: <why>" and logged; a text that is not an Error is said as it is; the box stays usable', async () => {
  // 2026-11-20-1002 mutation survivor: src/prompt-box-dom.ts:159 drop-statement#2, bool-flip#1, empty-string#1/#2, drop-statement#3 (console.error)
  const { mountPromptBox } = await import('./prompt-box-dom.ts');
  const logged: unknown[][] = []; const orig = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    for (const [thrown, said] of [[new Error('boom'), 'Could not ask: boom'], ['plain words', 'Could not ask: plain words']] as const) {
      const parent = win.document.createElement('div'); win.document.body.appendChild(parent); const seen: unknown[] = [];
      const h = mountPromptBox(parent, { preview: async (t: string, o?: { instant?: boolean }) => { seen.push([t, o]); throw thrown; }, apply: async () => ({ ok: true }) }, '');
      const f = parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement; f.value = 'Keep bars 1 to 3.'; f.dispatchEvent(new win.Event('input', { bubbles: true }));
      f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); for (let i = 0; i < 60; i++) await Promise.resolve();
      assert.equal((parent.querySelector('.forge-composer-error') as HTMLElement).textContent, said);
      assert.deepEqual(seen, [['Keep bars 1 to 3.', { instant: false }]], 'no autoApply port: the preview is told it is not instant');
      assert.equal(f.value, 'Keep bars 1 to 3.', 'the text stays');
      h.dispose();
    }
    assert.equal(logged.length, 2); assert.equal(logged[0]![0], '[forge-composer] preview threw');
    // the preview is told when the box applies at once
    const parent = win.document.createElement('div'); win.document.body.appendChild(parent); const told: unknown[] = [];
    mountPromptBox(parent, { preview: async (_t: string, o?: { instant?: boolean }) => { told.push(o); return { ok: false as const, message: 'x' }; }, apply: async () => ({ ok: true }), autoApply: () => true }, '');
    const f = parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement; f.value = 'a'; f.dispatchEvent(new win.Event('input', { bubbles: true }));
    f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); for (let i = 0; i < 60; i++) await Promise.resolve();
    assert.deepEqual(told, [{ instant: true }]);
  } finally { console.error = orig; }
});

test('the settings page: `Preview before applying` is a toggle that reads and writes previewBeforeApplying (default off), with its two description sentences exactly', async () => {
  // 2026-11-20-1002 mutation survivor: src/settings.ts:243 empty-string#1, :244 plus-minus#1/empty-string#1 (the description is the two sentences joined), DEFAULT_SETTINGS.previewBeforeApplying
  // `obsidian` has no runtime module here: a loader hook gives settings.ts a recording stand-in for App, PluginSettingTab and Setting (its own code is what runs).
  const { register } = await import('node:module');
  const stub = `export class App {}
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = chain(); } }
const chain = () => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : chain()), apply: () => chain() });
export class Setting { constructor() { const rec = { name: '', desc: '', toggle: null }; (globalThis.__forgeSettingsSeen ??= []).push(rec);
  const self = new Proxy({}, { get: (_t, k) => k === 'setName' ? (n) => { rec.name = n; return self; } : k === 'setDesc' ? (d) => { rec.desc = d; return self; } :
    k === 'addToggle' ? (cb) => { const tg = { setValue(v) { rec.value = v; return tg; }, onChange(f) { rec.onChange = f; return tg; } }; rec.toggle = tg; cb(tg); return self; } : () => self });
  return self; } }`;
  const hooks = `export async function resolve(s, c, next) { if (s === 'obsidian') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true }; return next(s, c); }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);
  const { ForgeSettingTab, DEFAULT_SETTINGS } = await import('./settings.ts');
  assert.equal(DEFAULT_SETTINGS.previewBeforeApplying, false, 'default off: one Enter applies'); assert.equal('composerAutoApply' in DEFAULT_SETTINGS, false, 'the old key is gone');
  let saves = 0; const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: async () => { saves++; } };
  const tab: any = new (ForgeSettingTab as any)({ vault: { getName: () => 'v' } }, plugin);
  tab.display();
  const seen = (globalThis as any).__forgeSettingsSeen as Array<{ name: string; desc: string; value?: unknown; onChange?: (v: boolean) => Promise<void> }>;
  const row = seen.filter((s) => s.name === 'Preview before applying'); assert.equal(row.length, 1);
  assert.equal(row[0]!.desc, 'Off (default): one Enter applies a sentence the grammar reads completely (a sentence the sentence service translated is still shown first). On: the first Enter shows what would be written and a second Enter applies it. Takes effect at the next Enter.');
  assert.equal(row[0]!.value, false, 'the toggle shows the stored value');
  await row[0]!.onChange!(true); assert.equal(plugin.settings.previewBeforeApplying, true); assert.equal(saves, 1);
  await row[0]!.onChange!(false); assert.equal(plugin.settings.previewBeforeApplying, false); assert.equal(saves, 2);
  assert.equal(seen.some((s) => /apply a sentence the grammar reads exactly without a preview/.test(s.name)), false, 'the old setting row is gone');
  const again: any = new (ForgeSettingTab as any)({ vault: { getName: () => 'v' } }, { settings: { ...DEFAULT_SETTINGS, previewBeforeApplying: true }, saveSettings: async () => {} }); (globalThis as any).__forgeSettingsSeen.length = 0; again.display();
  assert.equal((globalThis as any).__forgeSettingsSeen.find((s: { name: string }) => s.name === 'Preview before applying').value, true);
});

// ================================================================================================================================================================================================
// E. the bar's list controller (bar-list-controller.ts), on its own ports: the dialog events it says, exactly (the runner's map names no test for it: these are its direct tests)
// ================================================================================================================================================================================================
function barRig(start: string = PLAYGROUND_BARS['bar_001']) {
  let note = start; const said: unknown[] = []; const boxNotes: Array<string | null> = []; const pbs: string[] = [];
  const bar = createBarList({ proc: async (_p, fn) => { note = fn(note); }, say: (_p, ev) => { said.push(ev); }, pb: (l) => { pbs.push(l); }, pbWarn() {}, trace() {}, setBoxNote: (_p, m) => { boxNotes.push(m); }, endSuggestion() {}, basename: (p) => p });
  return { bar, said, boxNotes, pbs, note: () => note };
}
test('bar appendBar: a loud line says "applied" with its count of lines; instant adds what it replaces; a take-back says what it takes back; a quiet gesture says nothing', async () => {
  // 2026-11-20-1002 mutation survivor: src/bar-list-controller.ts:127-130 (the instant words, uncovered by the runner's pool)
  const q = barRig(); await q.bar.appendBar('b.md', 'Set the tempo to 96.', { loud: true }); await q.bar.appendBar('b.md', 'Set the tempo to 120.', { loud: true });
  assert.deepEqual(q.said, [{ type: 'applied', change: '1 line', description: 'Set the tempo to 96.' }, { type: 'applied', change: '1 line', description: 'Set the tempo to 120.' }]);
  const i = barRig(); await i.bar.appendBar('b.md', 'Set the tempo to 96.', { loud: true, instant: true }); await i.bar.appendBar('b.md', 'Set the tempo to 120.', { loud: true, instant: true });
  assert.deepEqual(i.said, [{ type: 'applied', change: '1 line', description: 'Set the tempo to 96.', instant: { replaces: '' } }, { type: 'applied', change: '1 line', description: 'Set the tempo to 120.', instant: { replaces: 'Set the tempo to 96.' } }]);
  const two = barRig(); await two.bar.appendBar('b.md', 'Set the tempo to 96. Set the swing to 20 percent.', { loud: true, instant: true });
  assert.deepEqual(two.said, [{ type: 'applied', change: '2 lines', description: 'Set the tempo to 96. Set the swing to 20 percent.', instant: { replaces: '' } }], 'a plural count, the added lines joined by one space');
  const tb = barRig(); await tb.bar.appendBar('b.md', 'Hit snare on steps 2.', { loud: true, instant: true }); const back = await tb.bar.appendBar('b.md', 'Clear snare on step 2.', { loud: true, instant: true });
  assert.equal(back.message, 'Took back: Hit snare on step 2.');
  assert.deepEqual(tb.said.at(-1), { type: 'applied', change: '0 lines', description: 'Takes back: Hit snare on step 2.', instant: { replaces: '' } });
  const tl = barRig(); await tl.bar.appendBar('b.md', 'Hit snare on steps 2.', { loud: true }); await tl.bar.appendBar('b.md', 'Clear snare on step 2.', { loud: true });
  assert.deepEqual(tl.said.at(-1), { type: 'applied', change: '0 lines', description: '' }, 'the two-Enter words are as they were');
  const quiet = barRig(); await quiet.bar.appendBar('b.md', 'Set the tempo to 96.', { instant: true }); assert.deepEqual(quiet.said, [], 'a gesture is quiet');
});
test('bar previewBar: a read line is SHOWN as a suggestion (with what it replaces) unless it applies at once; the proposal carries `instant` only then', async () => {
  // 2026-11-20-1002 mutation survivor: src/bar-list-controller.ts:141 bool-flip#1 (instant = false), :157-158 (the suggestion event and the proposal)
  const a = barRig(); await a.bar.applyBar('b.md', 'Set the tempo to 96.'); a.said.length = 0;
  const shown = await a.bar.previewBar('b.md', 'Set the tempo to 120.', a.note());
  assert.deepEqual(shown, { ok: true, proposal: { description: 'Set the tempo to 120.', via: 'grammar', replaces: 'Set the tempo to 96.' } });
  assert.deepEqual(a.said, [{ type: 'suggestion', description: 'Set the tempo to 120.', recipe: '', via: 'grammar', replaces: 'Set the tempo to 96.' }]);
  assert.deepEqual(a.pbs.at(-1), 'grammar verdict: accepted (preview, nothing written)');
  a.said.length = 0;
  const now = await a.bar.previewBar('b.md', 'Set the tempo to 120.', a.note(), true);
  assert.deepEqual(now, { ok: true, proposal: { description: 'Set the tempo to 120.', via: 'grammar', replaces: 'Set the tempo to 96.', instant: true } }); assert.deepEqual(a.said, [], 'applied at once: nothing is shown first');
  const fresh = barRig(); const plain = await fresh.bar.previewBar('b.md', 'Set the tempo to 96.', fresh.note());
  assert.deepEqual(plain, { ok: true, proposal: { description: 'Set the tempo to 96.', via: 'grammar' } }); assert.equal('replaces' in (plain as { proposal: object }).proposal, false);
  assert.deepEqual(fresh.said, [{ type: 'suggestion', description: 'Set the tempo to 96.', recipe: '', via: 'grammar' }]);
  const tb = barRig(); await tb.bar.applyBar('b.md', 'Hit snare on steps 2.'); tb.said.length = 0;
  assert.deepEqual(await tb.bar.previewBar('b.md', 'Clear snare on step 2.', tb.note()), { ok: true, proposal: { description: 'Takes back: Hit snare on step 2.', via: 'grammar', replaces: 'Hit snare on step 2.' } });
});
test('bar previewBar: a sentence the grammar cannot read gets "Did you mean" when a repair is read, else today\'s message and the "rejected" line', async () => {
  // 2026-11-20-1002 mutation survivor: src/bar-list-controller.ts:146-149 (offerRepair in the bar, the rejected line and the box note)
  const r = barRig(); const res = await r.bar.previewBar('b.md', 'Clera kick.', r.note());
  assert.deepEqual(res, { ok: true, proposal: { description: 'Clear kick.', via: 'grammar', instead: 'Clear kick.' } });
  assert.deepEqual(r.said, [{ type: 'suggestion', description: 'Clear kick.', recipe: '', via: 'repair', question: 'Did you mean: Clear kick?' }]); assert.deepEqual(r.boxNotes, []);
  const n = barRig(); const bad = await n.bar.previewBar('b.md', 'Banana split.', n.note());
  assert.equal(bad.ok, false); assert.equal(n.said.length, 1); assert.equal((n.said[0] as { type: string }).type, 'rejected'); assert.match((bad as { message: string }).message, /^The grammar did not accept this sentence \(line 1, column \d+: /);
  assert.deepEqual(n.boxNotes, [(bad as { message: string }).message]);
  const nb = barRig('---\ntype: note\n---\nno fence here'); const none = await nb.bar.previewBar('b.md', 'Set the tempo to 96.', nb.note());
  assert.deepEqual(none, { ok: false, message: 'This note is not a bar the Beat Box can read.' }); assert.deepEqual(nb.said, [{ type: 'notice', message: 'This note is not a bar the Beat Box can read.' }]);
});
test('bar applyBar: the words of an apply that is not instant are the two-Enter ones; instant says "applied" with its `instant` mark; the box says "Applied."', async () => {
  // 2026-11-20-1002 mutation survivor: src/bar-list-controller.ts:162-163 (applyBar's instant default and its pass-through)
  const a = barRig(); assert.deepEqual(await a.bar.applyBar('b.md', 'Set the tempo to 96.'), { ok: true, disk: '' });
  assert.deepEqual(a.said, [{ type: 'applied', change: '1 line', description: 'Set the tempo to 96.' }]); assert.equal(a.boxNotes.at(-1), 'Applied.');
  const b = barRig(); await b.bar.applyBar('b.md', 'Set the tempo to 96.', true);
  assert.deepEqual(b.said, [{ type: 'applied', change: '1 line', description: 'Set the tempo to 96.', instant: { replaces: '' } }]);
});

test('bar: several lines replaced or taken back are told joined with one space; several added lines too, with the two-Enter words as well; an empty text is a notice, not a "rejected" line', async () => {
  // 2026-11-20-1002 mutation survivor: src/bar-list-controller.ts:129 empty-string#1 (the join of the old lines), :130 empty-string#2 (the join of the added lines, two-Enter words), :146 if-true#1 (reason === 'unreadable')
  const w = barRig(); await w.bar.applyBar('b.md', 'Hit snare on steps 2.'); await w.bar.applyBar('b.md', 'Hit snare on steps 6.'); w.said.length = 0;
  const r = await w.bar.appendBar('b.md', 'Hit snare on steps 2, 6 and 10.', { loud: true, instant: true });
  assert.deepEqual(r.replaced?.map((x) => x.sentence), ['Hit snare on step 2.', 'Hit snare on step 6.']);
  assert.deepEqual(w.said, [{ type: 'applied', change: '1 line', description: 'Hit snare on steps 2, 6 and 10.', instant: { replaces: 'Hit snare on step 2. Hit snare on step 6.' } }]);
  const t = barRig(); await t.bar.applyBar('b.md', 'Hit snare on steps 2.'); await t.bar.applyBar('b.md', 'Hit snare on steps 6.'); t.said.length = 0;
  await t.bar.appendBar('b.md', 'Clear snare on steps 2 and 6.', { loud: true, instant: true });
  assert.deepEqual(t.said, [{ type: 'applied', change: '0 lines', description: 'Takes back: Hit snare on step 2. Hit snare on step 6.', instant: { replaces: '' } }]);
  const p = barRig(); await p.bar.appendBar('b.md', 'Set the tempo to 96. Set the swing to 20 percent.', { loud: true });
  assert.deepEqual(p.said, [{ type: 'applied', change: '2 lines', description: 'Set the tempo to 96. Set the swing to 20 percent.' }]);
  const e = barRig(); const none = await e.bar.previewBar('b.md', '   ', e.note());
  assert.deepEqual(none, { ok: false, message: 'There is no sentence to add.' }); assert.deepEqual(e.said, [{ type: 'notice', message: 'There is no sentence to add.' }]); assert.deepEqual(e.boxNotes, ['There is no sentence to add.']);
});
