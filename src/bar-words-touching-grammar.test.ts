// 2026-11-20-1001 (TOUCHING BARS BECOME ONE RANGE, and one refusal that told the wrong story) - the GRAMMAR half, written RED first (against 97496cc: `Delete bar 3 and bar 4.` and `Copy bars 3 to 5 and bar 4.` were refused in words).
// A person who clicks bar 4 and then bar 3 under Delete says `Delete bar 4 and bar 3`. The parser now reads bars that TOUCH (3 and 4) or OVERLAP (3 to 5 and 4), in any order, a repeat once, and writes the canonical RANGE:
//   `Delete bar 3 and bar 4.` / `Delete bar 4 and bar 3.` -> `Delete bars 3 to 4.`   `Copy bars 3 to 5 and bar 8.` stays   `Copy bars 3 to 5 and bar 4.` -> `Copy bars 3 to 5.`   `Keep bar 1, bar 2 and bar 3` -> `Keep bars 1 to 3.`
// for Copy, Duplicate, Delete, Remove, Keep and Move (Move merges too, see the Move test: the unmerged reading of two touching bars has no meaning). An INVERTED range (`bars 5 to 3`) is still refused in words; the json cache validator is as strict as ever
// (the file holds the merged form: runs ascending and APART); Mix `bars 2 and 3` is two bars (not a range), Morph-between and Extend keep their own rules.
// SECOND HALF: `Extend bar 2, 20 percent slower.` (no "to N bars") was refused as "one bar at a time", which is not what is wrong. It is refused with the form to say; a REAL second bar after a comma keeps the one-bar-at-a-time words, byte for byte.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { formatPhraseJson, readPhraseNote, validatePhrase, type PhraseParams } from './phrase-core.ts';
import { applyStructure } from './bar-structure-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const TAKE = 'Take [[phrase_003]].';
const ok = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `"${text}" should read: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `"${text}" should be refused`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };
const opsOf = (p: GrammarParams): unknown[] => ((p as { ops?: unknown[] }).ops ?? []);
const runsOf = (text: string): unknown => (opsOf(ok(text))[0] as { runs: unknown }).runs;

/** Each verb as a person types it, the op it is, the canonical word, and what follows the bars. */
const VERBS: Array<{ say: string; op: 'keep' | 'delete' | 'copy' | 'move'; word: string; tail: string; by?: -1 | 1 }> = [
  { say: 'Keep', op: 'keep', word: 'Keep', tail: '' },
  { say: 'Delete', op: 'delete', word: 'Delete', tail: '' },
  { say: 'Remove', op: 'delete', word: 'Delete', tail: '' },
  { say: 'Copy', op: 'copy', word: 'Copy', tail: '' },
  { say: 'Duplicate', op: 'copy', word: 'Copy', tail: '' },
  { say: 'Move', op: 'move', word: 'Move', tail: ' back', by: -1 },
  { say: 'Move', op: 'move', word: 'Move', tail: ' forward', by: 1 },
];
const canonTail = (by?: -1 | 1): string => (by === undefined ? '' : by === -1 ? ' one bar left' : ' one bar right');
const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
const extra = (by?: -1 | 1): object => (by === undefined ? {} : { by });

/** [typed bars, the runs they become, the canonical words of those runs]: touching singles, touching range + single, overlaps, chains, repeats, and what must NOT merge. */
const CASES: Array<[string, unknown, string]> = [
  ['bar 3 and bar 4', [[3, 4]], 'bars 3 to 4'],
  ['bar 4 and bar 3', [[3, 4]], 'bars 3 to 4'],
  ['bar 3, bar 4', [[3, 4]], 'bars 3 to 4'],
  ['bar 4, bar 3', [[3, 4]], 'bars 3 to 4'],
  ['bars 3 to 5 and bar 6', [[3, 6]], 'bars 3 to 6'],
  ['bar 6 and bars 3 to 5', [[3, 6]], 'bars 3 to 6'],
  ['bar 2 and bars 3 to 5', [[2, 5]], 'bars 2 to 5'],
  ['bars 3 to 5 and bar 2', [[2, 5]], 'bars 2 to 5'],
  ['bars 3 to 4 and bars 5 to 6', [[3, 6]], 'bars 3 to 6'],
  ['bars 5 to 6 and bars 3 to 4', [[3, 6]], 'bars 3 to 6'],
  ['bars 3 to 5 and bar 4', [[3, 5]], 'bars 3 to 5'],
  ['bar 4 and bars 3 to 5', [[3, 5]], 'bars 3 to 5'],
  ['bars 3 to 5 and bars 5 to 7', [[3, 7]], 'bars 3 to 7'],
  ['bars 5 to 7 and bars 3 to 5', [[3, 7]], 'bars 3 to 7'],
  ['bars 2 to 6 and bars 3 to 4', [[2, 6]], 'bars 2 to 6'],
  ['bars 3 to 4 and bars 2 to 6', [[2, 6]], 'bars 2 to 6'],
  ['bar 3 and bars 3 to 5', [[3, 5]], 'bars 3 to 5'],
  ['bars 3 to 5 and bar 3', [[3, 5]], 'bars 3 to 5'],
  ['bars 3 to 5 and bar 5', [[3, 5]], 'bars 3 to 5'],
  ['bar 3 and bar 3', [[3, 3]], 'bar 3'],
  ['bars 3 to 5 and bars 3 to 5', [[3, 5]], 'bars 3 to 5'],
  ['bar 1, bar 2 and bar 3', [[1, 3]], 'bars 1 to 3'],
  ['bar 3, bar 1 and bar 2', [[1, 3]], 'bars 1 to 3'],
  ['bar 3 and bar 5 and bar 4', [[3, 5]], 'bars 3 to 5'],
  ['bar 1, bar 5, bar 3, bar 2 and bar 4', [[1, 5]], 'bars 1 to 5'],
  ['bar 9, bar 4 and bar 3', [[3, 4], [9, 9]], 'bars 3 to 4 and bar 9'],
  ['bar 1 and bar 3 and bar 2 and bar 7', [[1, 3], [7, 7]], 'bars 1 to 3 and bar 7'],
  ['bar 8 and bar 4 and bar 5 and bar 1', [[1, 1], [4, 5], [8, 8]], 'bar 1, bars 4 to 5 and bar 8'],
  ['bars 3 to 5 and bar 8', [[3, 5], [8, 8]], 'bars 3 to 5 and bar 8'],
  ['bar 8 and bars 3 to 5', [[3, 5], [8, 8]], 'bars 3 to 5 and bar 8'],
  ['bar 3 and bar 5', [[3, 3], [5, 5]], 'bar 3 and bar 5'],
  ['bar 5 and bar 3', [[3, 3], [5, 5]], 'bar 3 and bar 5'],
  ['bars 1 to 2, bar 4 and bar 6', [[1, 2], [4, 4], [6, 6]], 'bars 1 to 2, bar 4 and bar 6'],
];

for (const v of VERBS) {
  test(`${v.say}${v.tail}: touching, overlapping, chained and repeated bars become the canonical ranges (${CASES.length} sentences, any order, "and" and commas)`, () => {
    for (const [typed, runs, words] of CASES) {
      const text = `${TAKE} ${v.say} ${typed}${v.tail}.`;
      const p = ok(text);
      assert.deepEqual(opsOf(p), [{ op: v.op, runs, ...extra(v.by) }], text);
      assert.equal(describe(p), `${TAKE} ${v.word} ${words}${canonTail(v.by)}.`, text);
      assert.equal(describe(ok(text.replace(/\.$/, ''))), describe(p), `${text}: the full stop is optional`);
    }
  });
}

test('the driver\'s five examples, word for word', () => {
  assert.equal(describe(ok(`${TAKE} Delete bar 3 and bar 4.`)), `${TAKE} Delete bars 3 to 4.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 4 and bar 3.`)), `${TAKE} Delete bars 3 to 4.`);
  assert.equal(describe(ok(`${TAKE} Copy bars 3 to 5 and bar 8.`)), `${TAKE} Copy bars 3 to 5 and bar 8.`);
  assert.equal(describe(ok(`${TAKE} Copy bars 3 to 5 and bar 4.`)), `${TAKE} Copy bars 3 to 5.`);
  assert.equal(describe(ok(`${TAKE} Keep bar 1, bar 2 and bar 3`)), `${TAKE} Keep bars 1 to 3.`);
  assert.equal(describe(ok(`${TAKE} delete BAR 4 and Bar 3`)), `${TAKE} Delete bars 3 to 4.`, 'any case, no full stop');
});

test('a chain of three touching bars, in ALL SIX orders, in every verb, is the one range', () => {
  for (const v of VERBS) for (const order of permutations([4, 5, 6])) {
    const text = `${TAKE} ${v.say} ${order.map((n) => `bar ${n}`).join(' and ')}${v.tail}.`;
    assert.deepEqual(opsOf(ok(text)), [{ op: v.op, runs: [[4, 6]], ...extra(v.by) }], text);
    assert.equal(describe(ok(text)), `${TAKE} ${v.word} bars 4 to 6${canonTail(v.by)}.`, text);
  }
});

test('a bar that BRIDGES two ranges joins them into one (said last, in the middle of the sentence, in either order)', () => {
  assert.deepEqual(runsOf(`${TAKE} Delete bars 1 to 2, bars 5 to 6 and bars 3 to 4.`), [[1, 6]]);
  assert.deepEqual(runsOf(`${TAKE} Keep bar 1, bar 3, bar 5, bar 2 and bar 4.`), [[1, 5]]);
  assert.deepEqual(runsOf(`${TAKE} Keep bar 1, bar 3, bar 7, bar 2 and bar 9.`), [[1, 3], [7, 7], [9, 9]]);
  assert.deepEqual(runsOf(`${TAKE} Delete bar 2, bar 4, bar 6, bar 3 and bar 8.`), [[2, 4], [6, 6], [8, 8]], 'bar 3 bridges 2 and 4 but not 6');
});

test('one bar apart is NOT touching: bars 3 and 5 stay two ranges, in any order', () => {
  for (const v of VERBS) for (const t of ['bar 3 and bar 5', 'bar 5 and bar 3', 'bars 1 to 2 and bars 4 to 5', 'bars 4 to 5 and bars 1 to 2']) {
    const p = ok(`${TAKE} ${v.say} ${t}${v.tail}.`);
    assert.equal((opsOf(p)[0] as { runs: unknown[] }).runs.length, 2, `${v.say} ${t}`);
  }
});

test('the old refusals are GONE (2026-11-20-1001 deliberate): the words of the 0999 refusals are never said now, whatever the bars', () => {
  for (const v of VERBS) for (const [typed] of CASES) {
    const r = parse(`${TAKE} ${v.say} ${typed}${v.tail}.`, V);
    assert.ok(r.ok, `${v.say} ${typed}`);
  }
  for (const t of ['Delete bar 3 and bar 4', 'Keep bars 3 to 5 and bar 4', 'Delete bar 4 and bars 3 to 5', 'Copy bars 1 to 2 and bar 3']) {
    const r = parse(`${TAKE} ${t}.`, V);
    assert.ok(r.ok, t);
  }
});

// ---- what stays refused ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an INVERTED range is still refused in words, alone or among merged bars, every verb', () => {
  for (const v of VERBS) {
    for (const t of ['bars 5 to 3', 'bar 1 and bars 5 to 3', 'bars 5 to 3 and bar 4', 'bars 4 to 3 and bar 3']) {
      const e = bad(`${TAKE} ${v.say} ${t}${v.tail}.`);
      assert.match(e.message, /^Expected the last bar to be \d or more, but found \d\.$/, `${v.say} ${t}: ${e.message}`);
    }
  }
  assert.equal(bad(`${TAKE} Delete bars 5 to 3.`).message, 'Expected the last bar to be 5 or more, but found 3.');
  assert.equal(bad(`${TAKE} Delete bar 1 and bars 5 to 3.`).message, 'Expected the last bar to be 5 or more, but found 3.');
});
test('the other refusals of a bar step are unchanged: bar 0, no bar, junk after, more than 16 ranges (after merging), a step after a Thin out', () => {
  assert.match(bad(`${TAKE} Delete bar 0.`).message, /^Expected a bar number, 1 or more, but found 0\.$/);
  assert.match(bad(`${TAKE} Delete.`).message, /^Expected "bar N" or "bars N to M"/);
  assert.equal(bad(`${TAKE} Keep bars 3 to 5 please.`).message, 'Expected the end of the sentence, but found "please".');
  assert.match(bad(`${TAKE} Thin out bar 1. Delete bar 3 and bar 4.`).message, /^Expected "Delete" to come before any "Thin out" or "Double up"/);
  const odd = (n: number): string => Array.from({ length: n }, (_, i) => `bar ${2 * i + 1}`).reverse().join(' and ');
  assert.ok(parse(`${TAKE} Delete ${odd(16)}.`, V).ok, '16 ranges apart, said backwards');
  assert.equal(bad(`${TAKE} Delete ${odd(17)}.`).message, 'Expected at most 16 ranges of bars, but found more.');
  const run = Array.from({ length: 30 }, (_, i) => `bar ${30 - i}`).join(', ');
  assert.deepEqual(runsOf(`${TAKE} Delete ${run}.`), [[1, 30]], '30 touching bars are ONE range (the limit counts ranges, after merging)');
  assert.equal(bad(`${TAKE} Move bar 3 and bar 4.`).message.startsWith('Expected "one bar left"'), true, 'a Move still needs its direction');
  assert.match(bad(`${TAKE} Move bar 3 and bar 4 two bars left.`).message, /^Move takes one bar at a time\. Say "Move bars 3 to 4 one bar left\." twice\.$/, 'the sentence to say is the merged one');
});

// ---- Move: the decision ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('MOVE merges too: `Move bar 3 and bar 4 back` is `Move bars 3 to 4 one bar left.`: the block moves, bar 2 goes after it (unmerged, each range would swap with "the bar next to it", and the neighbour of bar 4 is bar 3, which is moving itself: no meaning)', () => {
  assert.equal(describe(ok(`${TAKE} Move bar 3 and bar 4 back.`)), `${TAKE} Move bars 3 to 4 one bar left.`);
  assert.equal(describe(ok(`${TAKE} Move bar 4 and bar 3 forward.`)), `${TAKE} Move bars 3 to 4 one bar right.`);
  const bars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const run = (t: string): string => { const op = opsOf(ok(`${TAKE} ${t}`))[0] as never; const r = applyStructure(bars, op); return r.ok ? r.items.join('') : r.message; };
  assert.equal(run('Move bar 4 and bar 3 back'), run('Move bars 3 to 4 one bar left'));
  assert.equal(run('Move bar 4 and bar 3 back'), 'acdbefgh', 'bar b (bar 2) now comes after the moved block');
  assert.equal(run('Move bar 3 and bar 4 forward'), 'abecdfgh', 'bar e (bar 5) now comes before the moved block');
  assert.equal(run('Move bars 3 to 5 and bar 4 back'), 'acdebfgh', 'an overlap is one range');
  assert.equal(run('Move bar 3 and bar 5 back'), 'acbedfgh', 'bars 3 and 5 are apart: each swaps with the bar before it (bar 2, bar 4), as before');
  assert.equal(run('Move bar 1 and bar 2 back'), run('Move bars 1 to 2 back'), 'the same refusal as the range');
  assert.match(run('Move bar 1 and bar 2 back'), /bars 1 to 2 cannot move left: the range starts at bar 1\./);
  assert.match(run('Move bar 7 and bar 8 forward'), /bars 7 to 8 cannot move right: the range ends at the last bar \(bar 8\)\./);
});

test('the steps DO the same as the ranges they merge to (Delete, Keep: the set of bars; Copy: the block is played again after itself)', () => {
  const bars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const run = (t: string): string => { const op = opsOf(ok(`${TAKE} ${t}`))[0] as never; const r = applyStructure(bars, op); return r.ok ? r.items.join('') : r.message; };
  assert.equal(run('Delete bar 4 and bar 3'), 'abefgh');
  assert.equal(run('Delete bars 3 to 5 and bar 4'), 'abfgh');
  assert.equal(run('Keep bar 4 and bar 3 and bar 5'), 'cde');
  assert.equal(run('Copy bar 4 and bar 3'), 'abcdcdefgh', 'Copy bars 3 to 4: the block, then the block again (not c c d d)');
  assert.equal(run('Copy bars 3 to 5 and bar 4'), 'abcdecdefgh');
  assert.equal(run('Delete bar 7 and bar 8'), 'abcdef');
  assert.equal(run('Delete bar 8 and bar 7 and bar 6 and bar 5 and bar 4 and bar 3 and bar 2 and bar 1'), 'deleting bars 1 to 8 would leave no bars.');
});

// ---- only the runs of Copy / Delete / Keep / Move are merged ----------------------------------------------------------------------------------------------------------------------------------
test('Mix `bars 2 and 3` is two bars, not a range; Morph-between names two bars; Extend takes one bar: none of them is merged, and their words are unchanged', () => {
  const mix = opsOf(ok(`${TAKE} Mix bars 2 and 3.`))[0] as { op: string; a: number; b: number };
  assert.deepEqual([mix.op, mix.a, mix.b], ['mix_bars', 2, 3]);
  assert.equal(describe(ok(`${TAKE} Mix bars 2 and 3.`)), `${TAKE} Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.`);
  assert.equal(describe(ok(`${TAKE} Mix bar 3 and bar 2.`)), `${TAKE} Mix bars 3 and 2, 50 percent bar 3, as a vote, and put it between bars 2 and 3.`, 'the order of the two bars is kept: a is the first said');
  const morph = opsOf(ok(`${TAKE} Morph bars 2 and 3 across 5 bars.`))[0] as { op: string; a: number; b: number };
  assert.deepEqual([morph.op, morph.a, morph.b], ['morph_between', 2, 3]);
  assert.equal(describe(ok(`${TAKE} Morph bars 2 and 3 across 5 bars.`)), `${TAKE} Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.`);
  assert.equal(bad(`${TAKE} Mix bars 3 and 3.`).code, undefined, 'the same bar twice stays the Mix\'s own refusal (not merged to one bar)');
  assert.match(bad(`${TAKE} Mix bars 3 and 3.`).message, /twice|different|same/i);
  assert.equal(describe(ok(`${TAKE} Mix bars 2 and 3. Delete bar 4 and bar 3.`)), `${TAKE} Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3. Delete bars 3 to 4.`, 'a Delete after a Mix still merges: only the runs of Copy, Delete, Keep and Move do');
});

// ---- the canonical round trip -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the canonical sentence of every merged form reads back to the same params, and reading it again changes nothing (a fixed point)', () => {
  for (const v of VERBS) for (const [typed] of CASES) {
    const p = ok(`${TAKE} ${v.say} ${typed}${v.tail}.`);
    const text = describe(p);
    assert.deepEqual(ok(text), p, `${v.say} ${typed}: ${text}`);
    assert.equal(describe(ok(text)), text, 'a fixed point');
    assert.deepEqual(canonical(ok(text)), canonical(p));
  }
});
test('an ascending, apart sentence is unchanged byte for byte (P3), every verb', () => {
  assert.equal(describe(ok(`${TAKE} Keep bars 3 to 5 and bar 8.`)), `${TAKE} Keep bars 3 to 5 and bar 8.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 2.`)), `${TAKE} Delete bar 2.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 3 and bar 5.`)), `${TAKE} Delete bar 3 and bar 5.`);
  assert.equal(describe(ok(`${TAKE} Copy bars 3 to 5.`)), `${TAKE} Copy bars 3 to 5.`);
  assert.equal(describe(ok(`${TAKE} Move bars 3 to 5 one bar left.`)), `${TAKE} Move bars 3 to 5 one bar left.`);
  assert.equal(describe(ok(`${TAKE} Keep  BARS 1 to 2, bar 4 and bar 6.`)), `${TAKE} Keep bars 1 to 2, bar 4 and bar 6.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 5 and bar 3.`)), `${TAKE} Delete bar 3 and bar 5.`, 'out of order and apart: sorted (0999)');
});

// ---- every derived part says the merged form ----------------------------------------------------------------------------------------------------------------------------------------------------
test('the json cache holds the MERGED form; the validator is as strict as before (the file is canonical: ascending and APART)', () => {
  const p = ok(`${TAKE} Delete bar 4 and bar 3. Keep bars 3 to 5 and bar 4. Move bar 8 and bar 7 back.`) as PhraseParams;
  const json = formatPhraseJson(p);
  assert.match(json, /"op": "delete", "runs": \[\[3,4\]\]/);
  assert.match(json, /"op": "keep", "runs": \[\[3,5\]\]/);
  assert.match(json, /"op": "move", "runs": \[\[7,8\]\], "by": -1/);
  const back = readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  assert.ok(back.ok); assert.deepEqual(back.ok && canonical(back.value as GrammarParams), canonical(p as GrammarParams));
  const v = (runs: unknown[]) => validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'delete', runs }] });
  assert.ok(v([[3, 4]]).ok); assert.ok(v([[3, 3], [5, 5]]).ok);
  for (const runs of [[[3, 3], [4, 4]], [[4, 4], [3, 3]], [[3, 5], [4, 4]], [[3, 4], [5, 6]], [[5, 5], [3, 3]], [[3, 3], [3, 3]]]) {
    const r = v(runs); assert.equal(r.ok, false, JSON.stringify(runs)); assert.match((r as { message: string }).message, /the ranges must be in order and apart/, JSON.stringify(runs));
  }
});
test('the Recipe says the merged form', () => {          // 2026-11-26-1047 (deliberate): a Recipe is no longer read back
  const p = ok(`${TAKE} Keep bar 4 and bar 3 and bars 6 to 7. Delete bar 6 and bar 5.`) as PhraseParams;
  const steps = phraseRecipeSteps(p);
  assert.ok(steps.includes('Keep bars 3 to 4 and bars 6 to 7.'), steps.join(' | '));
  assert.ok(steps.includes('Delete bars 5 to 6.'), steps.join(' | '));
});
test('the Python says the merged form: the same text as the range sentence\'s Python, for every verb', () => {
  for (const v of VERBS) {
    const a = phrasePython(ok(`${TAKE} ${v.say} bar 4 and bar 3 and bar 8${v.tail}.`) as PhraseParams);
    const b = phrasePython(ok(`${TAKE} ${v.say} bars 3 to 4 and bar 8${v.tail}.`) as PhraseParams);
    assert.equal(a, b, v.say);
    assert.match(a, /\[\[3,4\],\[8,8\]\]/, v.say);
  }
});

// ---- never throws ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('never throws: every shuffle, repeat, touch and overlap of bars 1 to 6 is READ to ascending, apart runs (inverted ranges are the only refusal)', () => {
  const pieces = ['bar 1', 'bar 2', 'bar 3', 'bar 5', 'bar 6', 'bars 1 to 2', 'bars 2 to 3', 'bars 3 to 5', 'bars 5 to 6', 'bars 1 to 6'];
  let seed = 11; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const n = 1 + rnd(5);
    const parts = Array.from({ length: n }, () => pieces[rnd(pieces.length)]);
    const verb = ['Keep', 'Delete', 'Copy', 'Move'][rnd(4)];
    const r = parse(`${TAKE} ${verb} ${parts.join(rnd(2) === 0 ? ' and ' : ', ')}${verb === 'Move' ? ' back' : ''}.`, V);
    assert.ok(r.ok, `${verb} ${parts.join('|')}: ${r.ok ? '' : r.error.message}`);
    const runs = (opsOf(r.params as GrammarParams)[0] as { runs: Array<[number, number]> }).runs;
    runs.forEach((x, k) => { assert.ok(x[0] <= x[1]); if (k > 0) assert.ok(x[0] > runs[k - 1][1] + 1, `${parts.join('|')}: apart`); });
    const want = new Set<number>(); for (const p of parts) { const m = /(\d)(?: to (\d))?$/.exec(p)!; for (let b = +m[1]; b <= +(m[2] ?? m[1]); b++) want.add(b); }
    const got = new Set<number>(); for (const [a, b] of runs) for (let k = a; k <= b; k++) got.add(k);
    assert.deepEqual([...got].sort(), [...want].sort(), `${parts.join('|')}: the merged runs hold exactly the bars that were named`);
  }
});

// ---- Extend: the refusal that told the wrong story ------------------------------------------------------------------------------------------------------------------------------------------
const SAY = (bar: number, tail: string): string => `Expected "to N bars" after the bar, for example "Extend bar ${bar} to 4 bars${tail}."`;
test('`Extend bar 2, 20 percent slower.` (no "to N bars") is refused with the form to say, named in the sentence (code refused: the service cannot fix it), at the figure', () => {
  const e = bad(`${TAKE} Extend bar 2, 20 percent slower.`);
  assert.equal(e.message, SAY(2, ', 20 percent slower'));
  assert.equal(e.message, 'Expected "to N bars" after the bar, for example "Extend bar 2 to 4 bars, 20 percent slower."');
  assert.equal(e.code, 'refused');
  assert.deepEqual([e.line, e.column], [1, 36], 'at the "20"');
  assert.equal(bad(`${TAKE} extend BAR 7, 10% faster`).message, SAY(7, ', 10% faster'));
  assert.equal(bad(`${TAKE} Extend bar 3 and 5 percent faster.`).message, SAY(3, ', 5 percent faster'));
  assert.equal(bad(`${TAKE} Extend bar 12,  15   percent   slower.`).message, SAY(12, ', 15 percent slower'), 'the words are said once, single spaced');
  assert.equal(bad(`Extend [[bar_005]] to 8 bars, repeating with fills. Extend bar 2, 20 percent slower.`).message, SAY(2, ', 20 percent slower'), 'after any head');
  assert.doesNotMatch(bad(`${TAKE} Extend bar 2, 20 percent slower.`).message, /one bar at a time/);
});
test('the refusal says the sentence to say, and the sentence it names is READ (the example is a form that works)', () => {
  const m = /for example "(.*)"$/.exec(bad(`${TAKE} Extend bar 2, 20 percent slower.`).message);
  assert.ok(m); const p = ok(`${TAKE} ${m[1]}`);
  assert.deepEqual(opsOf(p), [{ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: -20 }]);
});
test('with "to N bars" anywhere the sentence is read, in any order (it used to be refused as "one bar at a time"); a style or a bare "20 percent" is the segments\' own business', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Extend bar 2, 20 percent slower, to 4 bars.`)), [{ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: -20 }]);
  assert.deepEqual(opsOf(ok(`${TAKE} Extend bar 2, 10% faster, to 6 bars, building up.`)), [{ op: 'extend_bar', bar: 2, bars: 6, style: 'building', tempo_change_pct: 10 }]);
  assert.deepEqual(opsOf(ok(`${TAKE} Extend bar 2 to 4 bars, 20 percent slower.`)), [{ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: -20 }]);
  assert.equal(describe(ok(`${TAKE} Extend bar 2, building up.`)), `${TAKE} Extend bar 2 to 4 bars, building up.`, 'no "to N bars" and no tempo: the head\'s default 4 bars, as before');
  assert.equal(describe(ok(`${TAKE} Extend bar 2.`)), `${TAKE} Extend bar 2 to 4 bars, repeating with fills.`);
  assert.equal(bad(`${TAKE} Extend bar 2, 20 percent.`).message, 'Expected "slower" or "faster", but found the end of the sentence.', 'a figure with no direction is the tempo segment\'s own refusal');
  assert.equal(bad(`${TAKE} Extend bar 2, 20 percent.`).code, undefined);
});
test('a REAL second bar after a comma or "and" keeps the one-bar-at-a-time refusal, byte for byte (code refused, at the bar)', () => {
  const one = (n: number, k = 4): string => `Extend takes one bar at a time. Say "Extend bar ${n} to ${k} bars." for one bar, and again for the next.`;
  for (const [t, want] of [
    ['Extend bars 2 and 3 to 4 bars.', one(2)], ['Extend bar 2 and bar 3 to 4 bars.', one(2)], ['Extend bar 2, bar 3 to 6 bars.', one(2, 6)], ['Extend bar 2, 3 to 4 bars.', one(2)],
    ['Extend bar 2 and 3.', one(2)], ['Extend bar 2, 3.', one(2)], ['Extend bars 2, 3, 4 to 8 bars.', one(2, 8)], ['Extend bar 5, bars 6 to 7 to 2 bars.', one(5, 2)],
  ] as Array<[string, string]>) {
    const e = bad(`${TAKE} ${t}`);
    assert.equal(e.message, want, t); assert.equal(e.code, 'refused', t); assert.deepEqual([e.line, e.column], [1, 29], `${t}: at the bar`);
  }
});
test('P3: the other refusals of an Extend step are byte for byte what 0999b said', () => {
  const ex = (t: string) => bad(`${TAKE} ${t}`);
  assert.equal(ex('Extend bar 0 to 4 bars.').message, 'Expected a bar number, 1 or more, but found 0.');
  assert.equal(ex('Extend bar 2 to 4.').message, 'Expected "bars", but found the end of the sentence.');
  assert.equal(ex('Extend bar 2 to 65 bars.').message, 'Expected a number of bars from 1 to 64, but found 65.');
  assert.equal(ex('Extend bar 2 to 0 bars.').message, 'Expected a number of bars from 1 to 64, but found 0.');
  assert.equal(ex('Extend bar 2 to 4 bars, building up, adding ghost notes.').message, 'Expected the style to be said once, but it is said twice.');
  assert.equal(ex('Extend bar 2 to 4 bars, 95 percent slower.').message, 'Expected a tempo change of 0 to 90 percent slower, but found 95.');
  assert.equal(ex('Extend bar 2 to 4 bars, 10 percent faster, 20 percent slower.').message, 'Expected the tempo change to be said once, but it is said twice.');
  assert.equal(ex('Extend bar 2 to 4 bars, 20 percent.').message, 'Expected "slower" or "faster", but found the end of the sentence.');
  assert.equal(ex('Extend bar 2 to 4 bars, put them somewhere.').message, 'Expected a place ("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"), but found "somewhere".');
  assert.equal(describe(ok(`${TAKE} Extend bar 2 to 4 bars and put them at the end.`)), `${TAKE} Extend bar 2 to 4 bars, repeating with fills, and put them at the end.`);
  assert.equal(ex('Extend bar 2 to 4 bars, put them between bars 2 and 5.').code, undefined, 'a plain unreadable line: the service may be asked');
});
