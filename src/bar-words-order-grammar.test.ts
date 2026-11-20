// 2026-11-19-0999 (BAR WORDS OUT OF ORDER) - the GRAMMAR half, written RED first (against b0fbb9d: the bars of a Keep / Delete / Copy / Move had to be said ascending and apart, so a person who clicked bar 5 and then bar 3 under Delete got
// "Expected the bars in order ..."). Now the PARSER takes the numbers in ANY order, a repeated range once, and writes the canonical sentence SORTED ascending in the words the grammar always used (`Delete bar 3 and bar 5.`, never "bars 3 and 5").
// A real overlap (`bars 3 to 5 and bar 4`) is still refused in words; ranges that touch (`bar 3 and bar 4`) are still refused (they say `bars 3 to 4`); the json cache stays canonical (the validator is as strict as before: the file holds the sorted form).
//   * every verb (Keep, Delete, Remove, Copy, Duplicate, Move left and right), all six orders of three bars, singles and ranges mixed, repeats;
//   * the canonical round trip (the canonical sentence reads back to the same params; reading it again is a fixed point), the Recipe, the Python and the json cache all carry the sorted form;
//   * the refusals in words, with the column of the range read last; a never-throws fuzz over shuffles.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { formatPhraseJson, readPhraseNote, validatePhrase, type PhraseParams } from './phrase-core.ts';
import { applyStructure } from './bar-structure-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const TAKE = 'Take [[phrase_003]].';
const EXTEND = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const ok = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `"${text}" should read: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `"${text}" should be refused`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };
const opsOf = (p: GrammarParams): unknown[] => ((p as { ops?: unknown[] }).ops ?? []);

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
/** A run said as a person says it: `bar 3` or `bars 3 to 5`. */
const said = (r: [number, number]): string => (r[0] === r[1] ? `bar ${r[0]}` : `bars ${r[0]} to ${r[1]}`);
const listed = (runs: Array<[number, number]>): string => (runs.length === 1 ? said(runs[0]) : `${runs.slice(0, -1).map(said).join(', ')} and ${said(runs[runs.length - 1])}`);
const SINGLES: Array<[number, number]> = [[2, 2], [4, 4], [7, 7]];
const MIXED: Array<[number, number]> = [[2, 2], [4, 5], [7, 8]];

for (const v of VERBS) {
  test(`${v.say}${v.tail}: three single bars in ALL SIX orders give the same params and the same canonical sentence, sorted ascending`, () => {
    const want = [{ op: v.op, runs: [[2, 2], [4, 4], [7, 7]], ...(v.by === undefined ? {} : { by: v.by }) }];
    const sorted = describe(ok(`${TAKE} ${v.say} bar 2 and bar 4 and bar 7${v.tail}.`));
    assert.equal(sorted, `${TAKE} ${v.word} bar 2, bar 4 and bar 7${canonTail(v.by)}.`);
    const orders = permutations(SINGLES);
    assert.equal(orders.length, 6);
    for (const order of orders) {
      const text = `${TAKE} ${v.say} ${order.map((r) => `bar ${r[0]}`).join(' and ')}${v.tail}.`;
      assert.deepEqual(opsOf(ok(text)), want, text);
      assert.equal(describe(ok(text)), sorted, text);
    }
  });
  test(`${v.say}${v.tail}: ranges mixed with singles, said out of order (all six orders, "and" and commas), write the sorted canonical sentence`, () => {
    const want = `${TAKE} ${v.word} bar 2, bars 4 to 5 and bars 7 to 8${canonTail(v.by)}.`;
    for (const order of permutations(MIXED)) {
      for (const text of [`${TAKE} ${v.say} ${order.map(said).join(' and ')}${v.tail}.`, `${TAKE} ${v.say} ${listed(order)}${v.tail}.`]) {
        const p = ok(text);
        assert.deepEqual(opsOf(p), [{ op: v.op, runs: [[2, 2], [4, 5], [7, 8]], ...(v.by === undefined ? {} : { by: v.by }) }], text);
        assert.equal(describe(p), want, text);
      }
    }
  });
}

test('the click\'s own sentence: `Delete bar 5 and bar 3` (clicked 5, then 3) is written `Delete bar 3 and bar 5.`', () => {
  assert.equal(describe(ok(`${TAKE} Delete bar 5 and bar 3`)), `${TAKE} Delete bar 3 and bar 5.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 5 and bar 3.`)), `${TAKE} Delete bar 3 and bar 5.`);
  assert.equal(describe(ok(`${TAKE} delete BAR 5 and bar 3`)), `${TAKE} Delete bar 3 and bar 5.`, 'any case');
  assert.equal(describe(ok(`${TAKE} Keep bar 8 and bar 2 and bar 5`)), `${TAKE} Keep bar 2, bar 5 and bar 8.`);
  assert.equal(describe(ok(`${TAKE} Copy bar 6 and bar 1`)), `${TAKE} Copy bar 1 and bar 6.`);
  assert.equal(describe(ok(`${TAKE} Move bar 6 and bar 2 back`)), `${TAKE} Move bar 2 and bar 6 one bar left.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 5 and bar 3.`)).includes('bars 3 and 5'), false, 'the grammar never writes "bars 3 and 5"');
});
test('ascending sentences are unchanged byte for byte (P3): the old canonical words, every verb', () => {
  assert.equal(describe(ok(`${TAKE} Keep bars 3 to 5 and bar 8.`)), `${TAKE} Keep bars 3 to 5 and bar 8.`);
  assert.equal(describe(ok(`${TAKE} Delete bar 2.`)), `${TAKE} Delete bar 2.`);
  assert.equal(describe(ok(`${TAKE} Copy bars 3 to 5.`)), `${TAKE} Copy bars 3 to 5.`);
  assert.equal(describe(ok(`${TAKE} Move bars 3 to 5 one bar left.`)), `${TAKE} Move bars 3 to 5 one bar left.`);
  assert.equal(describe(ok(`${TAKE} Keep  BARS 1 to 2, bar 4 and bar 6.`)), `${TAKE} Keep bars 1 to 2, bar 4 and bar 6.`);
});
test('after any head, and in the middle of a list: out of order is sorted there too, the other lines are untouched', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Delete bar 6 and bar 2.`)), [{ op: 'delete', runs: [[2, 2], [6, 6]] }]);
  assert.deepEqual(opsOf(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. Keep bar 1.')), [{ op: 'keep', runs: [[1, 1]] }]);
  assert.deepEqual(opsOf(ok(`${TAKE} Delete bar 5 and bar 3. Copy bar 4 and bar 1. Move bar 6 and bar 2 forward.`)), [
    { op: 'delete', runs: [[3, 3], [5, 5]] }, { op: 'copy', runs: [[1, 1], [4, 4]] }, { op: 'move', runs: [[2, 2], [6, 6]], by: 1 }]);
  assert.deepEqual(opsOf(ok(`${TAKE} Delete bar 6 and bar 2. Thin out bars 1 to 2, by half, keeping the downbeat.`))[0], { op: 'delete', runs: [[2, 2], [6, 6]] }, 'a structure step before a density step');
});

// ---- repeats ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a repeated number is said once: `bar 3 and bar 3`, `bar 5, bar 3 and bar 5`, the same range twice, in every verb', () => {
  for (const v of VERBS) {
    const by = v.by === undefined ? {} : { by: v.by };
    assert.deepEqual(opsOf(ok(`${TAKE} ${v.say} bar 3 and bar 3${v.tail}.`)), [{ op: v.op, runs: [[3, 3]], ...by }], `${v.say}: bar 3 twice`);
    assert.deepEqual(opsOf(ok(`${TAKE} ${v.say} bar 5, bar 3 and bar 5${v.tail}.`)), [{ op: v.op, runs: [[3, 3], [5, 5]], ...by }], `${v.say}: 5 3 5`);
    assert.deepEqual(opsOf(ok(`${TAKE} ${v.say} bars 3 to 5 and bar 8 and bars 3 to 5${v.tail}.`)), [{ op: v.op, runs: [[3, 5], [8, 8]], ...by }], `${v.say}: a range twice`);
  }
  assert.equal(describe(ok(`${TAKE} Delete bar 3 and bar 3.`)), `${TAKE} Delete bar 3.`, 'one bar is said as one bar');
  assert.equal(describe(ok(`${TAKE} Delete bar 5 and bar 3 and bar 5 and bar 3.`)), `${TAKE} Delete bar 3 and bar 5.`);
});

// ---- the refusals in words ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a REAL overlap is still refused in words, every verb, every order, with the bar they share and the column of the range read last', () => {
  for (const v of VERBS) {
    for (const [text, shared, both] of [
      [`${v.say} bars 3 to 5 and bar 4${v.tail}.`, 4, 'bars 3 to 5 and bar 4'], [`${v.say} bar 4 and bars 3 to 5${v.tail}.`, 4, 'bars 3 to 5 and bar 4'],
      [`${v.say} bars 3 to 5 and bars 5 to 7${v.tail}.`, 5, 'bars 3 to 5 and bars 5 to 7'], [`${v.say} bars 5 to 7 and bars 3 to 5${v.tail}.`, 5, 'bars 3 to 5 and bars 5 to 7'],
      [`${v.say} bar 3 and bars 3 to 5${v.tail}.`, 3, 'bar 3 and bars 3 to 5'], [`${v.say} bars 3 to 5 and bar 3${v.tail}.`, 3, 'bars 3 to 5 and bar 3'],
      [`${v.say} bars 2 to 6 and bars 3 to 4${v.tail}.`, 3, 'bars 2 to 6 and bars 3 to 4'],
    ] as Array<[string, number, string]>) {
      const e = bad(`${TAKE} ${text}`);
      assert.match(e.message, new RegExp(`^Expected each bar to be named once, but bar ${shared} is in both ${both}\\.$`), `${text}: ${e.message}`);
      assert.equal(e.code, 'refused', `${text}: the sentence service cannot fix it, so it is not asked`);
    }
  }
  const e = bad(`${TAKE} Delete bar 9 and bars 7 to 9`);
  assert.deepEqual([e.line, e.column], [1, 39], 'at the range that was read last: `bars 7 to 9`');
  assert.equal(parse(`${TAKE} Delete bars 3 to 5 and bar 4.`, V).ok, false);
});
test('ranges that TOUCH are still refused (they are one range: say "bars 3 to 4"), said either way round, with the sentence to say instead', () => {
  assert.match(bad(`${TAKE} Delete bar 3 and bar 4.`).message, /^Expected at least one bar between ranges, but bar 4 comes right after bar 3: say bars 3 to 4\.$/);
  assert.match(bad(`${TAKE} Delete bar 4 and bar 3.`).message, /^Expected at least one bar between ranges, but bar 4 comes right after bar 3: say bars 3 to 4\.$/);
  assert.match(bad(`${TAKE} Keep bars 1 to 2 and bar 3.`).message, /comes right after bars 1 to 2: say bars 1 to 3\./);
  assert.match(bad(`${TAKE} Keep bar 3 and bars 1 to 2.`).message, /comes right after bars 1 to 2: say bars 1 to 3\./);
  assert.match(bad(`${TAKE} Move bar 8 and bar 7 back.`).message, /bar 8 comes right after bar 7: say bars 7 to 8\./);
  assert.equal(bad(`${TAKE} Delete bar 4 and bar 3.`).code, 'refused');
});
test('a descending range is still refused as before; more than 16 ranges are refused in any order', () => {
  assert.match(bad(`${TAKE} Delete bars 5 to 3.`).message, /^Expected the last bar to be 5 or more, but found 3\.$/);
  const many = (n: number): number[] => Array.from({ length: n }, (_, i) => 2 * i + 1);
  assert.ok(parse(`${TAKE} Delete ${many(16).reverse().map((b) => `bar ${b}`).join(' and ')}.`, V).ok, '16 ranges, said backwards');
  assert.match(bad(`${TAKE} Delete ${many(17).reverse().map((b) => `bar ${b}`).join(' and ')}.`).message, /^Expected at most 16 ranges of bars, but found more\.$/);
});

// ---- the canonical round trip -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the canonical sentence reads back to the same params, and reading the canonical sentence again changes nothing (a fixed point)', () => {
  for (const v of VERBS) for (const runs of [SINGLES, MIXED]) for (const order of permutations(runs)) {
    const p = ok(`${TAKE} ${v.say} ${listed(order)}${v.tail}.`);
    const text = describe(p);
    assert.deepEqual(ok(text), p, text);
    assert.equal(describe(ok(text)), text, 'a fixed point');
  }
});
test('the steps DO THE SAME on the bars: the sorted runs give the result the ascending sentence always gave (Keep never reorders: bars 5 and 3 kept are 3 then 5)', () => {
  const bars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const run = (text: string): string => { const op = opsOf(ok(`${TAKE} ${text}`))[0] as never; const r = applyStructure(bars, op); return r.ok ? r.items.join('') : r.message; };
  assert.equal(run('Keep bar 5 and bar 3'), 'ce');
  assert.equal(run('Keep bar 3 and bar 5'), 'ce');
  assert.equal(run('Delete bar 7 and bar 2'), 'acdefh');
  assert.equal(run('Copy bar 6 and bar 1'), 'aabcdeffgh');
  assert.equal(run('Move bar 6 and bar 2 back'), run('Move bar 2 and bar 6 back'));
  assert.equal(run('Move bar 6 and bar 2 back'), 'bacdfegh');
});

// ---- every derived part says the sorted form ----------------------------------------------------------------------------------------------------------------------------------------------------
test('the json cache holds the SORTED form; the validator is as strict as before (a cache written by hand out of order is still refused: the file is canonical)', () => {
  const p = ok(`${TAKE} Delete bar 5 and bar 3. Move bar 6 and bar 2 back.`) as PhraseParams;
  const json = formatPhraseJson(p);
  assert.match(json, /"op": "delete", "runs": \[\[3,3\],\[5,5\]\]/);
  assert.match(json, /"op": "move", "runs": \[\[2,2\],\[6,6\]\], "by": -1/);
  const back = readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  assert.ok(back.ok); assert.deepEqual(back.ok && canonical(back.value as GrammarParams), canonical(p as GrammarParams));
  const v = (runs: unknown[]) => validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'delete', runs }] });
  assert.ok(v([[3, 3], [5, 5]]).ok);
  assert.equal(v([[5, 5], [3, 3]]).ok, false); assert.match((v([[5, 5], [3, 3]]) as { message: string }).message, /in order and apart/);
  assert.equal(v([[3, 3], [4, 4]]).ok, false);
});
test('the Recipe says the sorted form, and a Recipe written by hand out of order is read to the same params (the Recipe reads through the same step reader)', () => {
  const p = ok(`${TAKE} Keep bar 8 and bar 2 and bars 4 to 5. Delete bar 5 and bar 3.`) as PhraseParams;
  const steps = phraseRecipeSteps(p);
  assert.ok(steps.some((s) => s === 'Keep bar 2, bars 4 to 5 and bar 8.'), steps.join(' | '));
  assert.ok(steps.some((s) => s === 'Delete bar 3 and bar 5.'), steps.join(' | '));
  const back = parseRecipe(steps.join('\n'), V);
  assert.ok(back.ok, back.ok ? '' : back.error.message);
  assert.deepEqual(back.ok && canonical(back.params as GrammarParams), canonical(p));
  const hand = parseRecipe(['Take [[phrase_003]].', 'Delete bar 5 and bar 3.'].join('\n'), V);
  assert.ok(hand.ok, hand.ok ? '' : hand.error.message);
  assert.deepEqual(hand.ok && (hand.params as { ops: unknown[] }).ops, [{ op: 'delete', runs: [[3, 3], [5, 5]] }]);
});
test('the Python says the sorted form: the same text as the ascending sentence\'s Python, for every verb', () => {
  for (const v of VERBS) {
    const a = phrasePython(ok(`${TAKE} ${v.say} bar 6 and bar 2${v.tail}.`) as PhraseParams);
    const b = phrasePython(ok(`${TAKE} ${v.say} bar 2 and bar 6${v.tail}.`) as PhraseParams);
    assert.equal(a, b, v.say);
    assert.match(a, /\[2, 2\], \[6, 6\]|\(2, 2\), \(6, 6\)|\b2\b[\s\S]*\b6\b/);
  }
});

// ---- never throws ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('never throws: every shuffle, repeat and overlap of bars 1 to 6 as singles and ranges is either read to ascending, apart runs or refused in words', () => {
  const pieces = ['bar 1', 'bar 2', 'bar 3', 'bar 5', 'bar 6', 'bars 1 to 2', 'bars 2 to 3', 'bars 3 to 5', 'bars 5 to 6', 'bars 1 to 6'];
  let seed = 7; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const n = 1 + rnd(4);
    const parts = Array.from({ length: n }, () => pieces[rnd(pieces.length)]);
    const verb = ['Keep', 'Delete', 'Copy', 'Move'][rnd(4)];
    const r = parse(`${TAKE} ${verb} ${parts.join(rnd(2) === 0 ? ' and ' : ', ')}${verb === 'Move' ? ' back' : ''}.`, V);
    if (r.ok) {
      const runs = (opsOf(r.params as GrammarParams)[0] as { runs: Array<[number, number]> }).runs;
      runs.forEach((x, k) => { assert.ok(x[0] <= x[1]); if (k > 0) assert.ok(x[0] > runs[k - 1][1] + 1, `${parts.join('|')}: apart`); });
    } else assert.match(r.error.message, /^Expected /, parts.join('|'));
  }
});

// 2026-11-19-0999 mutation survivors: phrase-grammar-core.ts:230 (`b[0] === a[1] + 1`, the touching test): the single-bar touching cases above cannot tell b[0] from b[1] or a[1] from a[0]; two MULTI-bar ranges can.
test('ranges of several bars that TOUCH are refused with the words of the whole ranges, either way round (and ranges one bar apart are read)', () => {
  assert.match(bad(`${TAKE} Delete bars 3 to 4 and bars 5 to 6.`).message, /^Expected at least one bar between ranges, but bars 5 to 6 comes right after bars 3 to 4: say bars 3 to 6\.$/);
  assert.match(bad(`${TAKE} Delete bars 5 to 6 and bars 3 to 4.`).message, /^Expected at least one bar between ranges, but bars 5 to 6 comes right after bars 3 to 4: say bars 3 to 6\.$/);
  assert.match(bad(`${TAKE} Keep bars 2 to 5 and bars 6 to 8.`).message, /but bars 6 to 8 comes right after bars 2 to 5: say bars 2 to 8\./);
  assert.equal(bad(`${TAKE} Keep bars 6 to 8 and bars 2 to 5.`).code, 'refused');
  const p = ok(`${TAKE} Delete bars 5 to 6 and bars 2 to 3.`) as { ops?: Array<{ runs?: unknown }> };
  assert.deepEqual(opsOf(p).map((o) => (o as { runs?: unknown }).runs), [[[2, 3], [5, 6]]], 'one bar apart: read, sorted');
});
