// 2026-11-19-0980 (mutation pass, 260 sampled mutants of the 0980 diff: 59 survived; ~/.forge-mem-evidence/0980-mutants.log) - the pure-core survivors, each killed by the smallest test that FAILS AGAINST THE MUTANT. Every test names the line it is about.
// Properties are asserted; the error MESSAGES that are user-facing wording are asserted exactly. Pure: no controller, no DOM. The survivors that no test can kill are classified in the feedback (equivalent / unreachable / covered elsewhere).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, type GrammarParams } from './phrase-grammar-core.ts';
import * as L from './sentence-list-core.ts';
import { phraseDescription, phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { barCount } from './structure-strip-core.ts';
import type { PhraseParams } from './phrase-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const ctx: L.ReplayCtx = { vault: V };
const K = 'phrase' as const;
const HEAD8 = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const okParams = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `${text}: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `should be refused: ${text}`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };
const refused = async (list: string[], typed: string[], kind: L.ListKind = K) => { const r = await L.planAppend(list, kind, typed, ctx); assert.ok(!r.ok, JSON.stringify(typed)); return r as Extract<typeof r, { ok: false }>; };

// ---- sentence-list-core.ts: planAppend (299, 306, 307, 308) -------------------------------------------------------------------------------------------------------------------------------------------------
test('sentence-list-core 299: a list that ALREADY has an unreadable line is blocked at THAT line (the line the person must fix), even when the typed sentence would move the stop earlier', async () => {
  const list = [HEAD8, 'Make it 8 bars long.', 'Bar 6 is replaced by [[bar_009]].', 'make it groovy'];
  const r = await refused(list, ['Make it 4 bars long.']);                       // in place: it would make line 3 (the fork) unreadable, but line 4 was already unreadable
  assert.equal(r.reason, 'blocked');
  assert.ok(r.message.startsWith('Line 4 is not a sentence I can read; the note shows lines 1 to 3.'), r.message);
  assert.equal(r.line, 4);
});

test('sentence-list-core 306: a typed line that makes a LATER line unreadable (a shorter length under a fork) is refused as `blocked`, naming that later line and what the note would show', async () => {
  const list = [HEAD8, 'Make it 8 bars long.', 'Bar 6 is replaced by [[bar_009]].'];
  const r = await refused(list, ['Make it 4 bars long.']);
  assert.equal(r.reason, 'blocked');
  assert.ok(r.message.startsWith('Line 3 is not a sentence I can read; the note shows lines 1 and 2.'), r.message);
});

test('sentence-list-core 307: the order refusal names the line IN THE TYPED TEXT (the second of two typed sentences is line 2)', async () => {
  const list = ['Take [[phrase_003]].'];
  const r = await refused(list, ['Thin out bar 2, by half, keeping the downbeat.', 'Keep bars 1 to 2.']);
  assert.equal(r.reason, 'order');
  assert.equal(r.line, 2);
  assert.equal(r.message, L.orderRefusal('Keep bars 1 to 2.'));
  assert.ok(r.message.startsWith('Do the structure steps first: "Keep bars 1 to 2."'), r.message);
  const first = await refused(list.concat('Thin out bar 2, by half, keeping the downbeat.'), ['Keep bar 1.']);
  assert.equal(first.line, 1);
});

test('sentence-list-core 308: `head` is only for a KNOWN line of a phrase typed where there is no head yet; every other unreadable sentence stays `unreadable` (the service may fix it)', async () => {
  const noHead = await refused([], ['Make it 3 bars long.']);
  assert.equal(noHead.reason, 'head'); assert.equal(noHead.line, 1);
  assert.ok(noHead.message.includes('Extend, Mix, Morph, Take or Play'), noHead.message);
  // a head is there: an unreadable known line is just unreadable
  const fork = await refused([HEAD8], ['Bar 99 is replaced by [[bar_009]].']);
  assert.equal(fork.reason, 'unreadable'); assert.equal(fork.line, 1);
  // empty list, the head itself is typed but cannot be read: unreadable, not `head`
  assert.equal((await refused([], ['Take [[nobody_here]].'])).reason, 'unreadable');
  // empty list, bad non-head in the SECOND place (the first is a good head)
  const third = await refused([], ['Take [[phrase_003]].', 'Keep bars 3 to 1.']);
  assert.equal(third.reason, 'unreadable'); assert.equal(third.line, 2);
  // other kinds never say `head`
  assert.equal((await refused([], ['Keep bars 1 to 2.'], 'arrangement')).reason, 'unreadable');
  assert.equal((await refused([], ['Keep bars 1 to 2.'], 'composition')).reason, 'unreadable');
});

// ---- sentence-list-core.ts: listAfterParams (355, 368, 369, 383) --------------------------------------------------------------------------------------------------------------------------------------
const paramsOfList = (list: string[]): Record<string, unknown> => { const rp = L.replayGrammar(list, K, ctx); assert.equal(rp.stop, null); return rp.params as unknown as Record<string, unknown>; };

test('sentence-list-core 355: params that change NOTHING leave the list as it is, modifier lines included (the head line keeps the head\'s OWN length and tempo, the modifier lines carry the rest)', () => {
  const list = [HEAD8.replace('8 bars', '4 bars'), 'Make it 8 bars long.', 'Make it 15 percent slower.'];
  assert.deepEqual(L.listAfterParams(list, paramsOfList(list) as unknown as GrammarParams, K, ctx), list);
  const morph = ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Make it 9 bars long.'];
  assert.deepEqual(L.listAfterParams(morph, paramsOfList(morph) as unknown as GrammarParams, K, ctx), morph);
});

test('sentence-list-core 368: the lines the strip edits BY NAME are only forks, threshold and ghost notes: a Thin out between other lines is not re-placed or duplicated', () => {
  const list = ['Take [[phrase_003]].', 'Bar 2 is replaced by [[bar_005]].', 'Thin out bars 3 to 5, by half, keeping the downbeat.'];
  assert.deepEqual(L.listAfterParams(list, paramsOfList(list) as unknown as GrammarParams, K, ctx), list, 'the order the person gave is the order kept');
  const withDouble = ['Take [[phrase_003]].', 'Double up bars 1 to 2.', 'Bar 2 is replaced by [[bar_005]].'];
  assert.deepEqual(L.listAfterParams(withDouble, paramsOfList(withDouble) as unknown as GrammarParams, K, ctx), withDouble);
});

test('sentence-list-core 369: a mix\'s threshold is replaced IN PLACE (between its other lines), not moved to the end', () => {
  const list = ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'With ghost notes.', 'Threshold 40 percent.', 'Keep bar 1.'];
  const p = { ...paramsOfList(list), threshold: 0.3 } as unknown as GrammarParams;
  assert.deepEqual(L.listAfterParams(list, p, K, ctx), ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'With ghost notes.', 'Threshold 30 percent.', 'Keep bar 1.']);
  const g = { ...paramsOfList(list), ghost: false } as unknown as GrammarParams;
  assert.deepEqual(L.listAfterParams(list, g, K, ctx), ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Threshold 40 percent.', 'Keep bar 1.'], 'ghost notes taken away: its line goes, the others stay');
});

test('sentence-list-core 383: params the minimal edit cannot reach (steps the list does not have) are written as the CANONICAL lines of the params, never as a list that says something else', () => {
  const list = [HEAD8];
  const p = { ...paramsOfList(list), ops: [{ op: 'keep', runs: [[1, 2]] }] } as unknown as GrammarParams;
  assert.deepEqual(L.listAfterParams(list, p, K, ctx), [HEAD8, 'Keep bars 1 to 2.']);
  const lines = L.listAfterParams(list, p, K, ctx);
  assert.deepEqual(L.replayGrammar(lines, K, ctx).params, p);
});

// ---- phrase-grammar-core.ts (300, 301, 321, 324, 331, 332, 427) -------------------------------------------------------------------------------------------------------------------------------------------------
const steps = (n: number): string => Array.from({ length: n }, () => 'Keep bars 1 to 2.').join(' ');

test('phrase-grammar-core 300 and 427: more than 16 steps after an Extend, a Morph or a Mix is refused with the grammar\'s words, at the head (a Mix) or at the first step (an Extend, a Morph); 16 are fine', () => {
  for (const head of [HEAD8, 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.']) {
    const e = bad(`${head} ${steps(17)}`);
    const at = head.startsWith('Mix') ? 1 : head.length + 2;                       // a Mix reports at its head; an Extend and a Morph at their first step (the tail is read from there)
    assert.deepEqual([e.message, e.line, e.column], ['Expected at most 16 changes, but found 17.', 1, at], head);
    assert.ok(parse(`${head} ${steps(16)}`, V).ok, `${head}: 16 steps are fine`);
  }
});

test('phrase-grammar-core 301: with exactly ONE step the forks number the bars AFTER it (bounded by nothing but the 64 of a phrase), not by the head\'s own length', () => {
  const p = okParams('Extend [[bar_005]] to 2 bars, repeating with fills. Copy bars 1 to 2. Bar 4 is replaced by [[bar_009]].') as unknown as { overrides: Record<string, string>; ops: unknown[] };
  assert.deepEqual(p.overrides, { '4': 'bars/bar_009' }); assert.equal(p.ops.length, 1);
  assert.match(bad('Extend [[bar_005]] to 2 bars, repeating with fills. Bar 4 is replaced by [[bar_009]].').message, /bar of this phrase \(1 to 2\)/, 'without a step the head\'s own length bounds a fork');
});

test('phrase-grammar-core 321: a length that is not a whole number is refused in words, at the number', () => {
  const e = bad(`${HEAD8} Make it 2.5 bars long.`);
  assert.equal(e.message, 'Expected a number of bars as a whole number, but found 2.5.');
  assert.deepEqual([e.line, e.column], [1, `${HEAD8} Make it `.length + 1]);
});

test('phrase-grammar-core 324: "Make it 8 bars." (no "long") is refused saying what was expected', () => {
  const e = bad(`${HEAD8} Make it 8 bars.`);
  assert.equal(e.message, 'Expected "long", as in "Make it 8 bars long.", but found the end of the sentence.');
  const e2 = bad(`${HEAD8} Make it 8 bars tall.`);
  assert.equal(e2.message, 'Expected "long", as in "Make it 8 bars long.", but found "tall".');
});

test('phrase-grammar-core 331 and 332: a Thin out or a Double up after a head that is not a Take is refused with ITS OWN name, the head named, and the code `head`', () => {
  const thin = bad(`${HEAD8} Thin out bars 1 to 2, by half, keeping the downbeat.`);
  assert.equal(thin.message, 'Expected "Thin out" only after a Take (after an Extend a phrase takes "Keep", "Delete", "Copy" and "Move"), but this phrase is an Extend.');
  assert.equal(thin.code, 'head');
  const dbl = bad('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Double up bar 1.');
  assert.equal(dbl.message, 'Expected "Double up" only after a Take (after a Morph a phrase takes "Keep", "Delete", "Copy" and "Move"), but this phrase is a Morph.');
  assert.equal(dbl.code, 'head');
  const mix = bad('Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote. Thin out bar 1.');
  assert.equal(mix.code, 'head'); assert.ok(mix.message.endsWith('but this phrase is a Mix.'), mix.message);
  // the refusals of a modifier a head cannot take carry the same code
  assert.equal(bad('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Make it 10 percent faster.').code, 'head');
  assert.equal(bad('Take [[phrase_003]]. Make it 3 bars long.').code, 'head');
});

// ---- phrase-notes-core.ts (36, 45, 77, 118, 122) --------------------------------------------------------------------------------------------------------------------------------------------------------------------
const EXT: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 6, style: 'repeat_with_fills', tempo_change_pct: 0, ops: [{ op: 'keep', runs: [[1, 2]] }] };
const MIXV: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false, ops: [{ op: 'keep', runs: [[1, 1]] }] };
const MIXP: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0, ops: [{ op: 'keep', runs: [[1, 1]] }] };

test('phrase-notes-core 36 and 45: ONE structure step after a head is said in the note\'s description ("Then keep bars 1 to 2."), and none says nothing', () => {
  assert.equal(phraseDescription('phrase_020', EXT), 'phrase_020 — [[bar_005]] extended to 6 bars: repeat with fills, no tempo change. Then keep bars 1 to 2.');
  assert.equal(phraseDescription('phrase_020', { ...EXT, ops: undefined } as PhraseParams), 'phrase_020 — [[bar_005]] extended to 6 bars: repeat with fills, no tempo change.');
  const two = phraseDescription('phrase_020', { ...EXT, ops: [{ op: 'keep', runs: [[1, 2]] }, { op: 'delete', runs: [[2, 2]] }] });
  assert.ok(two.endsWith(' Then keep bars 1 to 2; delete bar 2.'), two);
});

test('phrase-notes-core 77: the Recipe says a step after a head as a take\'s step is said: capital letter, the rest of the word kept ("Keep bars 1 to 2.")', () => {
  assert.deepEqual(phraseRecipeSteps(EXT).slice(-1), ['Keep bars 1 to 2.']);
  assert.deepEqual(phraseRecipeSteps({ ...EXT, ops: [{ op: 'move', runs: [[2, 3]], by: 1 }] } as PhraseParams).slice(-1), ['Move bars 2 to 3 one bar right.']);
  assert.deepEqual(phraseRecipeSteps(MIXV).slice(-1), ['Keep bar 1.']);
});

test('phrase-notes-core 118 and 122: a mix with a step has a Python that makes the list of bars, applies the step to it and RETURNS it (a vote, and a path)', () => {
  const vote = phrasePython(MIXV).split('\n');
  assert.equal(vote[vote.length - 2], '  return bars'); assert.ok(vote.includes('  bars = [mixed]'), vote.join('\n'));
  assert.ok(vote.indexOf('  bars = [mixed]') < vote.findIndex((l) => l.startsWith('  bars = [bars[i - 1] for')), 'the step comes after the bars exist');
  const path = phrasePython(MIXP).split('\n');
  assert.equal(path[path.length - 2], '  return bars'); assert.ok(path.includes('  bars = [bar]'), path.join('\n'));
  assert.ok(path.indexOf('  bars = [bar]') < path.findIndex((l) => l.startsWith('  bars = [bars[i - 1] for')));
  // one step is a step (the branch is for `ops.length > 0`, not for two or more)
  assert.equal(MIXV.kind === 'mix' && MIXV.ops!.length, 1);
  // and a mix with NO step is the Python it always had
  const plain = phrasePython({ ...MIXV, ops: undefined } as PhraseParams); assert.ok(plain.includes('  return [mixed]') && !plain.includes('bars = [mixed]'), plain);
  const plainPath = phrasePython({ ...MIXP, ops: undefined } as PhraseParams); assert.ok(plainPath.includes('  return [bar]') && !plainPath.includes('bars = [bar]'), plainPath);
});

// ---- structure-strip-core.ts (30, 32) ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('structure-strip-core 30: the Score\'s own count wins only for a head WITH steps; a head without steps has its own bars even when the Score says another number', () => {
  const bare: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
  assert.equal(barCount(bare, 3), 8);
  assert.equal(barCount({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 5, order: 'musical', seed: 0 }, 2), 5);
  assert.equal(barCount({ ...bare, ops: [] } as PhraseParams, 3), 8, 'an empty list of steps is no step');
  assert.equal(barCount(EXT, 2), 2);
  assert.equal(barCount(EXT), 6, 'with no count from the Score the head\'s own bars');
});

test('structure-strip-core 32: a transform with no Score count has the last bar any of its steps names; a Copy counts its runs like Keep, Delete and Move; a density step counts its `last`', () => {
  const t = (op: object): PhraseParams => ({ kind: 'transform', source: 'phrases/phrase_003', ops: [op as never] });
  assert.equal(barCount(t({ op: 'copy', runs: [[2, 4]] })), 4);
  assert.equal(barCount(t({ op: 'keep', runs: [[1, 2], [5, 7]] })), 7);
  assert.equal(barCount(t({ op: 'delete', runs: [[3, 3]] })), 3);
  assert.equal(barCount(t({ op: 'move', runs: [[2, 3]], by: -1 })), 3);
  assert.equal(barCount(t({ op: 'thin_out', first: 2, last: 9, amount: 0.5 })), 9);
});

test('sentence-list-core (found by 368): the strip\'s write of a TAKE phrase (a copy, steps, thin outs, forks) does not throw and keeps the list; a fork is added in place at the end', () => {
  const copy = ['Take [[phrase_003]].'];
  assert.deepEqual(L.listAfterParams(copy, paramsOfList(copy) as unknown as GrammarParams, K, ctx), copy);
  const p = { ...paramsOfList(copy), overrides: { '2': 'bars/bar_005' } } as unknown as GrammarParams;
  assert.deepEqual(L.listAfterParams(copy, p, K, ctx), ['Take [[phrase_003]].', 'Bar 2 is replaced by [[bar_005]].']);
});
