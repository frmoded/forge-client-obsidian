// 2026-11-16-1000 - Keep / Delete / Copy / Move bars: the pure part. The truth table of what each step does to a list of bars, the words (one table), the sentence read back by BOTH grammars (Description and Recipe), the validator, and the
// Python the note carries (checked against the TypeScript on every case by a real python3). The Score on the real engine is in bar-structure-engine.test.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { STRUCTURE_WORDS, applyStructure, applyStructureOps, runsOfBars, runsWords, structurePython, structureSentence, structureWords } from './bar-structure-core.ts';
import { describe, canonical } from './phrase-describe-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { parseRecipe, renderRecipe } from './recipe-grammar-core.ts';
import { validatePhrase, type BarRun, type StructureOp, type TransformPhrase } from './phrase-core.ts';
import { phraseNoteContent, noteContentFor, readPhraseNote } from './phrase-core.ts';

const BARS = ['a', 'b', 'c', 'd', 'e', 'f'];                      // bars 1..6
const keep = (...runs: BarRun[]): StructureOp => ({ op: 'keep', runs });
const del = (...runs: BarRun[]): StructureOp => ({ op: 'delete', runs });
const copy = (...runs: BarRun[]): StructureOp => ({ op: 'copy', runs });
const move = (by: -1 | 1, ...runs: BarRun[]): StructureOp => ({ op: 'move', runs, by });
const got = (op: StructureOp, items: readonly string[] = BARS): string => { const r = applyStructure(items, op); return r.ok ? r.items.join('') : `ERR ${r.message}`; };

test('THE TRUTH TABLE: what each step does to bars a..f (ranges are the bars as they are BEFORE the step)', () => {
  assert.equal(got(keep([3, 5])), 'cde');
  assert.equal(got(keep([2, 2], [5, 6])), 'bef');
  assert.equal(got(del([3, 5])), 'abf');
  assert.equal(got(del([1, 1], [3, 3], [6, 6])), 'bde');
  assert.equal(got(copy([2, 3])), 'abcbcdef');                          // each range is played again right after itself
  assert.equal(got(copy([1, 1], [6, 6])), 'aabcdeff');
  assert.equal(got(copy([1, 2], [4, 5])), 'ababcdedef');                 // ab ab c de de f
  assert.equal(got(move(-1, [3, 4])), 'acdbef');                         // bar 2 steps over bars 3 and 4
  assert.equal(got(move(1, [3, 4])), 'abecdf');                          // bar 5 steps back over bars 3 and 4
  assert.equal(got(move(-1, [2, 2], [5, 5])), 'bacedf');                 // two ranges, each one bar left
  assert.equal(got(move(1, [1, 1], [4, 4])), 'bacedf');                  // a goes after b, d goes after e
  assert.equal(got(move(1, [2, 3], [5, 5])), 'adbcfe');                  // ranges apart by one bar: d jumps back over bc, f jumps back over e
});

test('REFUSED, in one sentence naming the bar: a range past the end, deleting everything, moving off either end', () => {
  assert.match(got(keep([5, 8])), /^ERR bars 5 to 8 asked for, but there are 6 bars\.$/);
  assert.match(got(del([1, 6])), /^ERR deleting bars 1 to 6 would leave no bars\.$/);
  assert.equal(got(move(-1, [1, 2])), 'ERR bars 1 to 2 cannot move left: the range starts at bar 1.');
  assert.equal(got(move(-1, [1, 1])), 'ERR bar 1 cannot move left: bar 1 is the first bar.');
  assert.equal(got(move(1, [5, 6])), 'ERR bars 5 to 6 cannot move right: the range ends at the last bar (bar 6).');
  assert.equal(got(move(1, [6, 6])), 'ERR bar 6 cannot move right: the range ends at the last bar (bar 6).');
  assert.match(got(keep([2, 2]), ['a']), /^ERR bar 2 asked for, but there is 1 bar\.$/);
  // a refusal changes nothing, and a good step never changes the list it is given
  const before = [...BARS];
  applyStructure(BARS, del([2, 3])); applyStructure(BARS, move(1, [1, 1]));
  assert.deepEqual(BARS, before);
});

test('steps run in order, each on the bars the step before left; the first refusal names its step', () => {
  const r = applyStructureOps(BARS, [del([1, 2]), keep([2, 3]), copy([1, 1])]);
  assert.deepEqual(r.ok && r.items, ['d', 'd', 'e']);       // cdef -> de -> d d e
  const bad = applyStructureOps(BARS, [del([1, 4]), keep([3, 3])]);
  assert.ok(!bad.ok && /^ops\[1\]: bar 3 asked for, but there are 2 bars\.$/.test(bad.message));
});

test('runsOfBars: the ranges of a set of bar numbers, ascending and apart; junk is dropped', () => {
  assert.deepEqual(runsOfBars([5, 3, 4, 8]), [[3, 5], [8, 8]]);
  assert.deepEqual(runsOfBars([2, 2, 2]), [[2, 2]]);
  assert.deepEqual(runsOfBars([0, -1, 1.5, 3]), [[3, 3]]);
  assert.deepEqual(runsOfBars([]), []);
  assert.deepEqual(runsOfBars(new Set([9, 1, 2])), [[1, 2], [9, 9]]);
});

test('THE WORDS: one table of verbs; ranges listed the way a person lists them; a move says which way', () => {
  assert.deepEqual(Object.keys(STRUCTURE_WORDS), ['keep', 'delete', 'copy', 'move', 'morph_between', 'mix_bars', 'extend_bar']);       // 2026-11-19-0996b (deliberate): the Morph between two bars of the phrase is a fifth row; 2026-11-19-0999b (deliberate): the Mix and Extend steps are the sixth and seventh
  assert.equal(runsWords([[3, 5]]), 'bars 3 to 5');
  assert.equal(runsWords([[3, 5], [8, 8]]), 'bars 3 to 5 and bar 8');
  assert.equal(runsWords([[2, 2], [4, 5], [9, 9]]), 'bar 2, bars 4 to 5 and bar 9');
  assert.equal(structureSentence(keep([3, 5], [8, 8])), 'Keep bars 3 to 5 and bar 8.');
  assert.equal(structureSentence(del([2, 2])), 'Delete bar 2.');
  assert.equal(structureSentence(copy([3, 5])), 'Copy bars 3 to 5.');
  assert.equal(structureSentence(move(-1, [3, 5])), 'Move bars 3 to 5 one bar left.');
  assert.equal(structureSentence(move(1, [3, 5])), 'Move bars 3 to 5 one bar right.');
  assert.equal(structureWords(move(1, [7, 7])), 'move bar 7 one bar right');
  for (const v of Object.values(STRUCTURE_WORDS)) assert.match(v.example, /\.$/);
});

const VAULT = { bars: ['bar_001'], phrases: ['phrase_006'] };
const take = (...ops: StructureOp[]): TransformPhrase => ({ kind: 'transform', source: 'phrases/phrase_006', ops });

test('THE SENTENCE IS READ BACK, by the Description grammar and by the Recipe: every shape says itself and parses to the same params (the menu writes only sentences the grammar reads)', () => {
  const cases: StructureOp[][] = [
    [keep([3, 5])], [keep([3, 5], [8, 8])], [keep([1, 1], [3, 3], [5, 5])], [del([2, 2])], [del([1, 2], [4, 4], [9, 12])], [copy([3, 5])], [copy([1, 1], [3, 3])],
    [move(-1, [3, 5])], [move(1, [2, 2], [5, 6])], [del([4, 4]), keep([1, 3]), copy([2, 2]), move(1, [1, 1])],
  ];
  for (const ops of cases) {
    const p = take(...ops);
    const text = describe(p);
    const back = parse(text, VAULT);
    assert.ok(back.ok, `${text} -> ${JSON.stringify(back)}`);
    assert.deepEqual(back.ok && back.params, canonical(p), text);
    const recipe = renderRecipe(p);
    const r = parseRecipe(recipe, VAULT);
    assert.ok(r.ok, `${recipe} -> ${JSON.stringify(r)}`);
    assert.deepEqual(r.ok && r.params, canonical(p), recipe);
  }
});

test('the sentences are said in either case and spacing, and a list may use commas ("bars 1 to 2, bar 4 and bar 6")', () => {
  const ok = (t: string) => { const r = parse(t, VAULT); assert.ok(r.ok, `${t}: ${JSON.stringify(r)}`); return (r as { params: TransformPhrase }).params.ops; };
  assert.deepEqual(ok('Take [[phrase_006]]. keep  BARS 1 to 2, bar 4 and bar 6.'), [keep([1, 2], [4, 4], [6, 6])]);
  assert.deepEqual(ok('Take [[phrase_006]]. Move bar 2 one bar LEFT.'), [move(-1, [2, 2])]);
  assert.deepEqual(ok('Take [[phrase_006]]. Delete bars three to four.'), [del([3, 4])]);
  assert.deepEqual(ok('Take [[phrase_006]]. Keep bar 5 and bars 2 to 3.'), [keep([2, 3], [5, 5])]);       // 2026-11-19-0999 (deliberate): was refused ("Expected the bars in order ..."); any order is read and written sorted
});

test('REFUSED by the grammar, one sentence with a place: an inverted range, a structure step after a Thin out, no direction, junk after it', () => {
  const bad = (t: string) => { const r = parse(t, VAULT); assert.ok(!r.ok, t); return (r as { error: { message: string; line: number; column: number } }).error; };
  // 2026-11-20-1001 (deliberate): ranges that touch (`Delete bars 1 to 2 and bar 3`) or share a bar (`Keep bars 3 to 5 and bar 4`) are no longer refused: they are merged into one range (was: "Expected at least one bar between ranges ..." and "Expected each bar to be named once ...")
  const ok = (t: string) => { const r = parse(t, VAULT); assert.ok(r.ok, t); return (r as { params: TransformPhrase }).params.ops; };
  assert.deepEqual(ok('Take [[phrase_006]]. Delete bars 1 to 2 and bar 3.'), [del([1, 3])]);
  assert.deepEqual(ok('Take [[phrase_006]]. Keep bars 3 to 5 and bar 4.'), [keep([3, 5])]);
  assert.match(bad('Take [[phrase_006]]. Thin out bar 1. Delete bar 2.').message, /^Expected "Delete" to come before any "Thin out" or "Double up"/);
  assert.match(bad('Take [[phrase_006]]. Move bar 2.').message, /^Expected "one bar left", "one bar right", "back" or "forward", but found the end of the sentence\.$/);       // 2026-11-19-0996b (deliberate): the driver's words are named too
  assert.match(bad('Take [[phrase_006]]. Move bar 2 two bars left.').message, /^Move takes one bar at a time\. Say "Move bar 2 one bar left\." twice\.$/);       // 2026-11-19-0996b (deliberate): read and refused with the sentence to say instead (it was "Expected ... but found two")
  assert.match(bad('Take [[phrase_006]]. Keep bars 3 to 5 please.').message, /^Expected the end of the sentence, but found "please"\.$/);
  assert.match(bad('Take [[phrase_006]]. Keep.').message, /^Expected "bar N" or "bars N to M"/);
  const e = bad('Take [[phrase_006]]. Delete bar 9 and bars 7 to 5.');       // 2026-11-20-1001 (deliberate): was `Delete bar 9 and bars 7 to 9` (share a bar, column 39); that is merged now, so the place pinned is the last bar of an inverted range
  assert.deepEqual([e.line, e.column], [1, 49]);
  // a density step AFTER the structure steps is fine, and a fork may follow
  assert.ok(parse('Take [[phrase_006]]. Delete bar 2. Thin out bar 1, by half, keeping the downbeat. Bar 2 is replaced by [[bar_001]].', VAULT).ok);
});

test('THE VALIDATOR (the json block): runs, by, order of the steps, no foreign field', () => {
  const v = (ops: unknown[]) => validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops });
  assert.ok(v([{ op: 'keep', runs: [[3, 5]] }]).ok);
  assert.ok(v([{ op: 'move', runs: [[3, 5], [8, 8]], by: -1 }, { op: 'thin_out', first: 1, last: 2, amount: 0.5 }]).ok);
  const msg = (ops: unknown[]): string => { const r = v(ops); assert.ok(!r.ok); return (r as { message: string }).message; };
  assert.match(msg([{ op: 'keep', runs: [] }]), /ops\[0\]\.runs must be a list of 1 to 16 bar ranges/);
  assert.match(msg([{ op: 'keep', runs: [[5, 3]] }]), /each range must be \[first, last\]/);
  assert.match(msg([{ op: 'keep', runs: [[1, 3], [4, 5]] }]), /in order and apart/);
  assert.match(msg([{ op: 'keep', runs: [[3, 3], [1, 1]] }]), /in order and apart/);
  assert.match(msg([{ op: 'delete', runs: [[1, 1]], by: 1 }]), /unexpected field "by" \(delete holds only op, runs\)/);
  assert.match(msg([{ op: 'move', runs: [[1, 1]] }]), /by must be -1 \(one bar left\) or 1/);
  assert.match(msg([{ op: 'move', runs: [[1, 1]], by: 2 }]), /by must be -1/);
  assert.match(msg([{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }, { op: 'delete', runs: [[1, 1]] }]), /ops\[1\]: a change of which bars there are \(delete\) must come before/);
  assert.match(msg([{ op: 'shuffle' }]), /must be "thin_out", "double_up", "keep", "delete", "copy", "move", "morph_between", "mix_bars" or "extend_bar"/);       // 2026-11-19-0996b (deliberate); 2026-11-19-0999b (deliberate): the Mix and Extend steps are named too
  assert.match(msg([{ op: 'keep', runs: [[1, 1]], first: 1 }]), /unexpected field "first"/);
  assert.match(msg([{ op: 'keep', runs: Array.from({ length: 17 }, (_, i) => [i * 2 + 1, i * 2 + 1]) }]), /1 to 16 bar ranges/);
});

test('A NOTE WITH A STRUCTURE STEP is written and read back: the json block, the Description and the Recipe agree', () => {
  const p = take(del([2, 3]), move(-1, [4, 4]));
  const note = noteContentFor('phrase_007', p);
  assert.match(note, /Take \[\[phrase_006\]\]\. Delete bars 2 to 3\. Move bar 4 one bar left\./);
  assert.match(note, /"op": "delete", "runs": \[\[2,3\]\]/);
  const back = readPhraseNote(note);
  assert.ok(back.ok && JSON.stringify(back.value) === JSON.stringify(p));
  assert.ok(phraseNoteContent('phrase_001', 'bar_001').length > 0);
});

// ---- the Python the note carries is the same step as the TypeScript's, on every case, by a real python3 -------------------------------------------------------------------------------------------------------------------------------

test('THE NOTE\'S PYTHON does what the TypeScript does: every shape on lists of 1 to 9 bars, run by python3, against applyStructure', (t) => {
  const probe = spawnSync('python3', ['-c', 'print(1)']);
  if (probe.status !== 0) { t.skip('python3 not found'); return; }
  const shapes: StructureOp[] = [keep([2, 3]), keep([1, 1], [3, 4], [6, 6]), del([1, 1]), del([2, 3], [5, 5]), copy([1, 2]), copy([1, 1], [3, 4]), copy([2, 2], [4, 4], [6, 6]), move(-1, [2, 3]), move(-1, [2, 2], [4, 5]), move(1, [1, 2]), move(1, [1, 1], [3, 4]), move(1, [2, 2], [4, 4], [6, 6])];
  const cases: Array<{ items: number[]; op: StructureOp; want: number[] | null }> = [];
  for (let n = 1; n <= 9; n++) {
    const items = Array.from({ length: n }, (_, i) => i + 1);
    for (const op of shapes) { const r = applyStructure(items, op); cases.push({ items, op, want: r.ok ? r.items : null }); }
  }
  const prog = [
    'import json, sys',
    'out = []',
    'for case in json.load(sys.stdin):',
    '  bars = list(case["items"])',
    '  src = case["code"]',
    '  try:',
    '    exec("def compute():\\n  global bars\\n" + src + "\\n  return bars", globals())',
    '    out.append(compute())',
    '  except Exception:',
    '    out.append(None)',
    'print(json.dumps(out))',
  ].join('\n');
  const input = JSON.stringify(cases.map((c) => ({ items: c.items, code: structurePython(c.op).join('\n') })));
  const r = spawnSync('python3', ['-c', prog], { input, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const outs = JSON.parse(r.stdout) as Array<number[] | null>;
  let compared = 0;
  cases.forEach((c, i) => {
    if (c.want === null) return;                                       // a case the TypeScript refuses (a range past the end, a move off the end): the Python note is not run on it, the Score refuses first
    assert.deepEqual(outs[i], c.want, `${structureSentence(c.op)} on ${c.items.length} bars`);
    compared++;
  });
  assert.ok(compared > 60, `compared ${compared} cases: the check is not vacuous`);
});
