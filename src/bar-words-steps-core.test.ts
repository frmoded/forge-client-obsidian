// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - the PURE half of the Morph-between step (bar-structure-core.ts): its words (`structureWords`, `placeWords`), its Python, and `applyStepsAsync` (the steps in order, the engine asked only for the new bars, the
// gap the new bars go in, every refusal in the words of the other steps). Written RED first (none of it existed). The engine is a stub that returns labelled bars, so a wrong end, a wrong count or a wrong place cannot hide.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STRUCTURE_WORDS, applyStepsAsync, applyStructureOps, isRunsOp, isStructureOp, placeWords, structurePython, structureSentence, structureWords } from './bar-structure-core.ts';
import type { MorphBetweenOp, PhraseParams, StructureOp } from './phrase-core.ts';
import { barCount } from './structure-strip-core.ts';

const MB = (o: Partial<MorphBetweenOp> = {}): MorphBetweenOp => ({ op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2, ...o });
const bars = (n: number): string[] => Array.from({ length: n }, (_, i) => `b${i + 1}`);
/** the engine stub: `morph` is asked for the NEW bars and answers with labelled ones (the real one answers N + 2 bars and the caller drops the ends: phrase-core.ts morphNewBars; here the stub already answers the middle) */
const stub = (log: Array<[string, string, number]> = []) => async (a: string, b: string, op: MorphBetweenOp) => { log.push([a, b, op.bars]); return { ok: true as const, items: Array.from({ length: op.bars }, (_, i) => `${a}>${b}#${i + 1}`) }; };

test('isStructureOp knows the morph step; isRunsOp does not (it is the one step that needs the engine)', () => {
  assert.equal(isStructureOp(MB()), true); assert.equal(isRunsOp(MB()), false);
  for (const op of ['keep', 'delete', 'copy', 'move'] as const) { const o = { op, runs: [[1, 1]], ...(op === 'move' ? { by: 1 } : {}) } as StructureOp; assert.equal(isStructureOp(o), true); assert.equal(isRunsOp(o), true); }
  assert.equal(isStructureOp({ op: 'thin_out', first: 1, last: 1, amount: 0.5 }), false); assert.equal(isRunsOp({ op: 'double_up', first: 1, last: 1, grid: 16 }), false);
});

test('the words: every part is said (bars, count, order with its seed only when seeded, "it" for one bar, the place); the sentence is capitalised and full-stopped', () => {
  assert.equal(structureWords(MB()), 'morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3');
  assert.equal(structureSentence(MB()), 'Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.');
  assert.equal(structureWords(MB({ bars: 1, order: 'by_channel', after: 'end' })), 'morph bars 2 and 3 across 1 bar, in by-channel order, and put it at the end');
  assert.equal(structureWords(MB({ order: 'seeded', seed: 17, a: 5, b: 1, after: 5 })), 'morph bars 5 and 1 across 5 bars, in seeded order, seed 17, and put them after bar 5');
  assert.equal(structureWords(MB({ order: 'musical', seed: 9 })), 'morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3', 'a seed is never said with another order');
});
test('placeWords: start, end, between the two bars when they are neighbours and the gap is theirs, else after bar K', () => {
  assert.equal(placeWords(MB({ after: 0 })), 'at the start'); assert.equal(placeWords(MB({ after: 'end' })), 'at the end');
  assert.equal(placeWords(MB({ a: 2, b: 3, after: 2 })), 'between bars 2 and 3'); assert.equal(placeWords(MB({ a: 3, b: 2, after: 2 })), 'between bars 2 and 3');
  assert.equal(placeWords(MB({ a: 2, b: 3, after: 3 })), 'after bar 3'); assert.equal(placeWords(MB({ a: 2, b: 3, after: 1 })), 'after bar 1');
  assert.equal(placeWords(MB({ a: 2, b: 5, after: 2 })), 'after bar 2', 'not neighbours: no "between"');
});
test('the Python: the engine\'s own morph_rhythm, N + 2 bars asked, the ends dropped; the gap by index; at the end by adding', () => {
  assert.deepEqual(structurePython(MB()), ["  bars[2:2] = morph_rhythm(a=bars[1], b=bars[2], bars=7, order='musical', seed=0)[1:-1]"]);
  assert.deepEqual(structurePython(MB({ a: 6, b: 1, bars: 1, order: 'seeded', seed: 4, after: 0 })), ["  bars[0:0] = morph_rhythm(a=bars[5], b=bars[0], bars=3, order='seeded', seed=4)[1:-1]"]);
  assert.deepEqual(structurePython(MB({ after: 'end' })), ["  bars = bars + morph_rhythm(a=bars[1], b=bars[2], bars=7, order='musical', seed=0)[1:-1]"]);
});

test('applyStepsAsync: the new bars go into the gap, the two ends and every other bar stay, the engine is asked for the bars at the ENDS of the step (by number) and for N', async () => {
  const log: Array<[string, string, number]> = [];
  const r = await applyStepsAsync(bars(4), [MB()], stub(log));
  assert.deepEqual(r, { ok: true, items: ['b1', 'b2', 'b2>b3#1', 'b2>b3#2', 'b2>b3#3', 'b2>b3#4', 'b2>b3#5', 'b3', 'b4'] }); assert.deepEqual(log, [['b2', 'b3', 5]]);
  const place = async (after: number | 'end'): Promise<string[]> => { const x = await applyStepsAsync(bars(4), [MB({ a: 1, b: 4, bars: 2, after })], stub()); assert.ok(x.ok); return x.ok ? x.items : []; };
  assert.deepEqual(await place(0), ['b1>b4#1', 'b1>b4#2', 'b1', 'b2', 'b3', 'b4']);
  assert.deepEqual(await place(1), ['b1', 'b1>b4#1', 'b1>b4#2', 'b2', 'b3', 'b4']);
  assert.deepEqual(await place(4), ['b1', 'b2', 'b3', 'b4', 'b1>b4#1', 'b1>b4#2']);
  assert.deepEqual(await place('end'), ['b1', 'b2', 'b3', 'b4', 'b1>b4#1', 'b1>b4#2']);
  const rev = await applyStepsAsync(bars(4), [MB({ a: 4, b: 1, bars: 1, after: 'end' })], stub()); assert.deepEqual(rev, { ok: true, items: ['b1', 'b2', 'b3', 'b4', 'b4>b1#1'] }, 'a is the START of the morph whatever the order of the numbers');
});
test('applyStepsAsync: steps run in order on the bars the earlier steps left, the other steps are applyStructure\'s (same result as applyStructureOps when there is no morph), the engine is not asked for them', async () => {
  const log: Array<[string, string, number]> = [];
  const r = await applyStepsAsync(bars(5), [{ op: 'delete', runs: [[1, 1]] }, MB({ a: 1, b: 2, bars: 1, after: 1 }), { op: 'copy', runs: [[1, 1]] }], stub(log));
  assert.deepEqual(r, { ok: true, items: ['b2', 'b2', 'b2>b3#1', 'b3', 'b4', 'b5'] }); assert.deepEqual(log, [['b2', 'b3', 1]]);
  const plain: StructureOp[] = [{ op: 'keep', runs: [[2, 4]] }, { op: 'move', runs: [[1, 1]], by: 1 }, { op: 'copy', runs: [[3, 3]] }];
  const never = async (): Promise<never> => { throw new Error('the engine must not be asked'); };
  assert.deepEqual(await applyStepsAsync(bars(5), plain, never), applyStructureOps(bars(5), plain as never));
  assert.deepEqual(await applyStepsAsync(bars(5), [], never), { ok: true, items: bars(5) });
});
test('applyStepsAsync: refusals are words with the number of the step: a bar past the end (the ends, the gap), a refusal of another step, the engine\'s own refusal; the bars are never changed', async () => {
  const input = bars(3);
  const e = async (op: MorphBetweenOp) => { const r = await applyStepsAsync(input, [op], stub()); assert.equal(r.ok, false); return (r as { message: string }).message; };
  assert.equal(await e(MB({ a: 2, b: 4 })), 'ops[0]: bar 4 asked for, but there are 3 bars.');
  assert.equal(await e(MB({ a: 5, b: 1 })), 'ops[0]: bar 5 asked for, but there are 3 bars.');
  assert.equal(await e(MB({ a: 1, b: 2, after: 7 })), 'ops[0]: after bar 7 asked for, but there are 3 bars.');
  assert.equal((await applyStepsAsync(['x'], [MB({ a: 1, b: 2 })], stub()) as { message: string }).message, 'ops[0]: bar 2 asked for, but there is 1 bar.');
  const r2 = await applyStepsAsync(input, [{ op: 'keep', runs: [[1, 1]] }, MB({ a: 1, b: 2 })], stub()); assert.equal((r2 as { message: string }).message, 'ops[1]: bar 2 asked for, but there is 1 bar.');
  const r3 = await applyStepsAsync(input, [{ op: 'delete', runs: [[1, 3]] }], stub()); assert.match((r3 as { message: string }).message, /^ops\[0\]: deleting bars 1 to 3 would leave no bars\.$/);
  const r4 = await applyStepsAsync(input, [MB({ a: 1, b: 2 })], async () => ({ ok: false, message: 'morph_rhythm: a and b must agree on steps' })); assert.equal((r4 as { message: string }).message, 'ops[0]: morph_rhythm: a and b must agree on steps');
  assert.deepEqual(input, ['b1', 'b2', 'b3']);
});

// ---- 2026-11-19-0996b mutation triage ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2026-11-19-0996b mutation survivor: src/bar-structure-core.ts:25 "'morph'" -> "''" (the verb of the table entry of morph_between)
test('STRUCTURE_WORDS: the verb of every step is the first word its words say (the table and structureWords agree), the morph verb is "morph", every example is read by the words of its own verb', () => {
  assert.deepEqual(Object.entries(STRUCTURE_WORDS).map(([op, w]) => [op, w.verb]), [['keep', 'keep'], ['delete', 'delete'], ['copy', 'copy'], ['move', 'move'], ['morph_between', 'morph']]);
  const one: Record<string, StructureOp> = { keep: { op: 'keep', runs: [[1, 2]] }, delete: { op: 'delete', runs: [[1, 2]] }, copy: { op: 'copy', runs: [[1, 2]] }, move: { op: 'move', runs: [[1, 2]], by: -1 }, morph_between: MB() };
  for (const [op, w] of Object.entries(STRUCTURE_WORDS)) {
    assert.ok(structureWords(one[op]).startsWith(`${w.verb} `), `${op}: "${structureWords(one[op])}" starts with its table verb "${w.verb}"`);
    assert.ok(w.example.toLowerCase().startsWith(`${w.verb} `), `${op}: the example "${w.example}" starts with its verb`);
    assert.ok(structureSentence(one[op]).startsWith(`${w.verb[0].toUpperCase()}${w.verb.slice(1)} `));
  }
  assert.equal(STRUCTURE_WORDS.morph_between.example, structureSentence(MB()), 'the example of the morph step is exactly the sentence of the default step');
});

// 2026-11-19-0996b mutation survivor: src/bar-structure-core.ts:120 "false" -> "true" (the refusal of another step is { ok: false, ... }, not { ok: true, message })
// 2026-11-19-0996b mutation survivor: src/bar-structure-core.ts:129 "false" -> "true" (the engine's own refusal is { ok: false, ... })
// 2026-11-19-0996b mutation survivor: src/bar-structure-core.ts:127 "'end'" -> "''": EQUIVALENT (`'end' > n` is NaN > n, false for every n, so `op.after !== 'end' &&` only guards the type); pinned here by the end-gap answer that must stay unrefused for every length
test('applyStepsAsync: EVERY refusal is `{ ok: false, message }` exactly (the whole result, not just its words), at the step that refused, with nothing else in it; "end" is never a gap past the bars', async () => {
  const input = bars(3);
  const never = async (): Promise<never> => { throw new Error('the engine must not be asked'); };
  const run = (ops: StructureOp[], m: (a: string, b: string, op: MorphBetweenOp) => Promise<{ ok: true; items: string[] } | { ok: false; message: string }> = stub()) => applyStepsAsync(input, ops, m as never);
  assert.deepEqual(await run([{ op: 'delete', runs: [[1, 3]] }], never), { ok: false, message: 'ops[0]: deleting bars 1 to 3 would leave no bars.' });
  assert.deepEqual(await run([{ op: 'keep', runs: [[1, 1]] }, { op: 'delete', runs: [[1, 1]] }], never), { ok: false, message: 'ops[1]: deleting bar 1 would leave no bars.' });
  assert.deepEqual(await run([{ op: 'move', runs: [[1, 1]], by: -1 }], never), { ok: false, message: 'ops[0]: bar 1 cannot move left: bar 1 is the first bar.' });
  assert.deepEqual(await run([MB({ a: 1, b: 2 })], async () => ({ ok: false, message: 'morph_rhythm: a and b must agree on steps' })), { ok: false, message: 'ops[0]: morph_rhythm: a and b must agree on steps' });
  assert.deepEqual(await run([{ op: 'copy', runs: [[1, 1]] }, MB({ a: 1, b: 2 }), MB({ a: 1, b: 2 })], async () => ({ ok: false, message: 'no' })), { ok: false, message: 'ops[1]: no' }, 'the first refusal is the answer');
  assert.deepEqual(await run([MB({ a: 1, b: 9 })], never), { ok: false, message: 'ops[0]: bar 9 asked for, but there are 3 bars.' });
  assert.deepEqual(await run([MB({ a: 1, b: 2, after: 4 })], never), { ok: false, message: 'ops[0]: after bar 4 asked for, but there are 3 bars.' });
  assert.deepEqual(await run([{ op: 'keep', runs: [[2, 2]] }, MB({ a: 1, b: 2, after: 'end' })], async () => ({ ok: true, items: ['n'] })), { ok: false, message: 'ops[1]: bar 2 asked for, but there is 1 bar.' });
  for (const n of [1, 2, 3, 10]) assert.deepEqual(await applyStepsAsync(bars(n + 1), [MB({ a: 1, b: 2, bars: 1, after: 'end' })], stub()), { ok: true, items: [...bars(n + 1), 'b1>b2#1'] }, `after "end" is a gap whatever the length (${n + 1} bars)`);
  assert.deepEqual(await applyStepsAsync(bars(3), [MB({ a: 1, b: 2, bars: 1, after: 3 })], stub()), { ok: true, items: ['b1', 'b2', 'b3', 'b1>b2#1'] }, 'the gap after the LAST bar is allowed');
});

// 2026-11-19-0996b mutation survivor: src/structure-strip-core.ts:32 (every operand of the op test and of `[o.a, o.b]` / `o.runs.map` / `[o.last]`): the bars a transform names, step by step, each kind of step alone and together
test('barCount of a transform without a known count is the last bar any step names: a morph names BOTH its bars (the later one, whichever is said first) and not its gap; every other step names what it names', () => {
  const T = (...ops: unknown[]): PhraseParams => ({ kind: 'transform', source: 'phrases/phrase_003', ops } as never);
  const cases: Array<[string, PhraseParams, number]> = [
    ['no step', T(), 0],
    ['a, b in order', T(MB({ a: 2, b: 5 })), 5], ['b, a: the later is a', T(MB({ a: 5, b: 2 })), 5], ['neighbours', T(MB({ a: 3, b: 4 })), 4], ['neighbours backwards', T(MB({ a: 4, b: 3 })), 4],
    ['the gap is not a bar named', T(MB({ a: 1, b: 2, after: 9 })), 2], ['end', T(MB({ a: 1, b: 2, after: 'end' })), 2], ['bars asked is not a bar named', T(MB({ a: 1, b: 2, bars: 40 })), 2],
    ['a morph with a bigger bar than the steps before', T({ op: 'keep', runs: [[1, 3]] }, MB({ a: 2, b: 6 })), 6], ['a morph with a smaller bar than the step before', T({ op: 'delete', runs: [[2, 2], [7, 8]] }, MB({ a: 2, b: 3 })), 8],
    ['keep', T({ op: 'keep', runs: [[1, 2], [6, 9]] }), 9], ['delete', T({ op: 'delete', runs: [[3, 3], [5, 7]] }), 7], ['copy', T({ op: 'copy', runs: [[2, 4]] }), 4], ['move', T({ op: 'move', runs: [[2, 2], [5, 6]], by: 1 }), 6], ['move left', T({ op: 'move', runs: [[3, 3]], by: -1 }), 3],
    ['thin out', T({ op: 'thin_out', first: 2, last: 6, amount: 0.5 }), 6], ['double up', T({ op: 'double_up', first: 1, last: 3, grid: 16 }), 3],
    ['mixed, the last wins', T({ op: 'keep', runs: [[1, 4]] }, { op: 'copy', runs: [[2, 3]] }, { op: 'thin_out', first: 1, last: 2, amount: 0.5 }), 4],
  ];
  for (const [name, p, want] of cases) assert.equal(barCount(p), want, name);
  const known = T(MB({ a: 2, b: 5 })); assert.equal(barCount(known, 11), 11, 'the Score on screen says how many bars there are'); assert.equal(barCount(known, 0), 0, 'a known 0 is a count, not "unknown"');
  const head = (ops?: unknown[]): PhraseParams => ({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, ...(ops ? { ops } : {}) } as never);
  assert.equal(barCount(head([MB()]), 13), 13, 'an extend followed by a morph step has the bars the Score has'); assert.equal(barCount(head([MB()])), 8, 'unknown: the extend\'s own bars'); assert.equal(barCount(head([]), 13), 8, 'no step: its own bars'); assert.equal(barCount(head(), 13), 8);
  assert.equal(barCount({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false }), 1);
});
