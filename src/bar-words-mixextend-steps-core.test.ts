// 2026-11-19-0999b (MIX AND EXTEND AS STEPS) - the PURE CORES of the two steps, in exact words and exact answers: bar-structure-core.ts (isStructureOp, isRunsOp, placeWords, structureWords, structureSentence, applyStepsAsync, structurePython), phrase-core.ts (formatTransformOp, extendRhythmRefusal),
// phrase-describe-core.ts (canonical, describe), structure-strip-core.ts (barCount), step-words-core.ts. NOTE FOR THE CARD: this file was written AFTER its code (not red first); the red-first files are bar-words-mixextend-grammar, -replay, -wiring (and -engine, red by its missing exports). It pins what the mutation pass will test.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STRUCTURE_WORDS, applyStepsAsync, isRunsOp, isStructureOp, placeWords, structurePython, structureSentence, structureWords, type StructureResult } from './bar-structure-core.ts';
import { extendRhythmRefusal, formatTransformOp, mixRhythmRefusal, morphRhythmRefusal, type ExtendBarOp, type MixBarsOp, type MorphBetweenOp, type PhraseParams, type StructureOp } from './phrase-core.ts';
import { canonical, describe, type GrammarParams } from './phrase-grammar-core.ts';
import { STYLE_WORDS, orderWords } from './step-words-core.ts';
import { STYLE_WORDS as STYLE_WORDS_DESCRIBE, orderWords as orderWordsDescribe } from './phrase-describe-core.ts';
import { barCount } from './structure-strip-core.ts';

const MX = (o: Partial<MixBarsOp> = {}): MixBarsOp => ({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 2, ...o });
const EX = (o: Partial<ExtendBarOp> = {}): ExtendBarOp => ({ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, ...o });
const MB = (o: Partial<MorphBetweenOp> = {}): MorphBetweenOp => ({ op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2, ...o });
const bars = (n: number): string[] => Array.from({ length: n }, (_, i) => `b${i + 1}`);

test('isStructureOp knows the Mix and Extend steps; isRunsOp does not (they need the engine); a thin out and a double up are neither', () => {
  for (const o of [MX(), EX(), EX({ after: 0 }), MB()]) { assert.equal(isStructureOp(o), true, o.op); assert.equal(isRunsOp(o), false, o.op); }
  for (const o of [{ op: 'thin_out', first: 1, last: 1, amount: 0.5 }, { op: 'double_up', first: 1, last: 1, grid: 16 }] as const) { assert.equal(isStructureOp(o), false); assert.equal(isRunsOp(o), false); }
});
test('placeWords: at the start, at the end, between two neighbours (a and b either way), else after bar K; a step with one bar (Extend) never says between', () => {
  assert.equal(placeWords({ after: 0 }), 'at the start'); assert.equal(placeWords({ after: 'end' }), 'at the end');
  assert.equal(placeWords({ after: 2, a: 2, b: 3 }), 'between bars 2 and 3'); assert.equal(placeWords({ after: 2, a: 3, b: 2 }), 'between bars 2 and 3');
  assert.equal(placeWords({ after: 3, a: 2, b: 3 }), 'after bar 3'); assert.equal(placeWords({ after: 1, a: 2, b: 3 }), 'after bar 1'); assert.equal(placeWords({ after: 2, a: 2, b: 4 }), 'after bar 2', 'not neighbours');
  assert.equal(placeWords({ after: 2 }), 'after bar 2'); assert.equal(placeWords({ after: 5, a: 5 }), 'after bar 5');
  assert.equal(placeWords(MB({ after: 2 })), 'between bars 2 and 3', 'the Morph words are unchanged');
});
test('structureWords / structureSentence of a Mix step: every field in the head\'s words, the place always said ("it"), the threshold and the ghost notes only of a vote and only when they are not the defaults, a path says its order and (seeded) seed', () => {
  assert.equal(structureWords(MX()), 'mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3');
  assert.equal(structureSentence(MX()), 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.');
  assert.equal(structureWords(MX({ weight: 0.7, threshold: 0.4, ghost: true, after: 'end' })), 'mix bars 2 and 3, 70 percent bar 2, as a vote, threshold 40 percent, with ghost notes, and put it at the end');
  assert.equal(structureWords(MX({ ghost: true })), 'mix bars 2 and 3, 50 percent bar 2, as a vote, with ghost notes, and put it between bars 2 and 3');
  assert.equal(structureWords(MX({ threshold: 0.8 })), 'mix bars 2 and 3, 50 percent bar 2, as a vote, threshold 80 percent, and put it between bars 2 and 3');
  assert.equal(structureWords(MX({ weight: 0.335, a: 5, b: 1, after: 5 })), 'mix bars 5 and 1, 33.5 percent bar 5, as a vote, and put it after bar 5');
  assert.equal(structureWords(MX({ weight: 0, after: 0 })), 'mix bars 2 and 3, 0 percent bar 2, as a vote, and put it at the start');
  assert.equal(structureWords(MX({ weight: 1 })), 'mix bars 2 and 3, 100 percent bar 2, as a vote, and put it between bars 2 and 3');
  assert.equal(structureWords(MX({ mode: 'path', order: 'musical', seed: 0 })), 'mix bars 2 and 3, 50 percent bar 2, as a path, in musical order, and put it between bars 2 and 3');
  assert.equal(structureWords(MX({ mode: 'path', order: 'seeded', seed: 17, after: 3 })), 'mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed 17, and put it after bar 3');
  assert.equal(structureWords(MX({ mode: 'path', order: 'by_channel', seed: 0 })), 'mix bars 2 and 3, 50 percent bar 2, as a path, in by-channel order, and put it between bars 2 and 3');
});
test('structureWords / structureSentence of an Extend step: "to N bar(s)", the style, the tempo only when it is not 0 ("N percent slower|faster"), and a place ONLY when it inserts ("them" / "it")', () => {
  assert.equal(structureWords(EX()), 'extend bar 2 to 4 bars, repeating with fills'); assert.equal(structureSentence(EX()), 'Extend bar 2 to 4 bars, repeating with fills.');
  assert.equal(structureWords(EX({ bars: 1 })), 'extend bar 2 to 1 bar, repeating with fills');
  assert.equal(structureWords(EX({ style: 'building', tempo_change_pct: -20 })), 'extend bar 2 to 4 bars, building up, 20 percent slower');
  assert.equal(structureWords(EX({ style: 'ghost_notes', tempo_change_pct: 12.5 })), 'extend bar 2 to 4 bars, adding ghost notes, 12.5 percent faster');
  assert.equal(structureWords(EX({ after: 'end' })), 'extend bar 2 to 4 bars, repeating with fills, and put them at the end');
  assert.equal(structureWords(EX({ after: 0, bars: 1 })), 'extend bar 2 to 1 bar, repeating with fills, and put it at the start');
  assert.equal(structureWords(EX({ after: 2 })), 'extend bar 2 to 4 bars, repeating with fills, and put them after bar 2');
  assert.equal(structureWords(EX({ after: 6, style: 'building', tempo_change_pct: 10 })), 'extend bar 2 to 4 bars, building up, 10 percent faster, and put them after bar 6');
});
test('the words of a style and an order are one definition: step-words-core.ts, the same as phrase-describe-core.ts re-exports', () => {
  assert.equal(STYLE_WORDS, STYLE_WORDS_DESCRIBE); assert.equal(orderWords, orderWordsDescribe);
  assert.deepEqual(STYLE_WORDS, { repeat_with_fills: 'repeating with fills', building: 'building up', ghost_notes: 'adding ghost notes' });
  assert.deepEqual(['musical', 'seeded', 'by_channel'].map((o) => orderWords(o as never)), ['musical order', 'seeded order', 'by-channel order']);
});

// ---- applyStepsAsync: where the new bars go -------------------------------------------------------------------------------------------------------------------------------------------------------------
type Log = Array<[string, ...unknown[]]>;
const makers = (log: Log = []) => ({
  morph: async (a: string, b: string, op: MorphBetweenOp): Promise<StructureResult<string>> => { log.push(['morph', a, b, op.bars]); return { ok: true, items: Array.from({ length: op.bars }, (_, i) => `m${i + 1}`) }; },
  more: {
    mix: async (a: string, b: string, op: MixBarsOp): Promise<StructureResult<string>> => { log.push(['mix', a, b, op.weight]); return { ok: true, items: [`mix(${a},${b})`] }; },
    extend: async (x: string, op: ExtendBarOp): Promise<StructureResult<string>> => { log.push(['extend', x, op.bars]); return { ok: true, items: Array.from({ length: op.bars }, (_, i) => `${x}+${i + 1}`) }; },
  },
});
const run = (items: string[], ops: StructureOp[], log: Log = []) => { const m = makers(log); return applyStepsAsync(items, ops, m.morph, m.more); };

test('applyStepsAsync, Mix: ONE bar is inserted in the gap (after K, at the start, at the end), the two bars named stay, the engine is asked once with a then b (the order the sentence says)', async () => {
  const log: Log = [];
  assert.deepEqual(await run(bars(5), [MX()], log), { ok: true, items: ['b1', 'b2', 'mix(b2,b3)', 'b3', 'b4', 'b5'] }); assert.deepEqual(log, [['mix', 'b2', 'b3', 0.5]]);
  assert.deepEqual((await run(bars(5), [MX({ a: 4, b: 1, after: 0 })])), { ok: true, items: ['mix(b4,b1)', 'b1', 'b2', 'b3', 'b4', 'b5'] });
  assert.deepEqual((await run(bars(5), [MX({ after: 'end' })])), { ok: true, items: ['b1', 'b2', 'b3', 'b4', 'b5', 'mix(b2,b3)'] });
  assert.deepEqual((await run(bars(5), [MX({ after: 5 })])), { ok: true, items: ['b1', 'b2', 'b3', 'b4', 'b5', 'mix(b2,b3)'] }, 'after the last bar is the end');
});
test('applyStepsAsync, Extend: with NO `after` bar K is REPLACED by the N bars (the bars around it stay); with `after` the bar STAYS and the N bars go in the gap; the engine is asked once with the bar as it is NOW', async () => {
  const log: Log = [];
  assert.deepEqual(await run(bars(4), [EX({ bar: 2, bars: 3 })], log), { ok: true, items: ['b1', 'b2+1', 'b2+2', 'b2+3', 'b3', 'b4'] }); assert.deepEqual(log, [['extend', 'b2', 3]]);
  assert.deepEqual(await run(bars(4), [EX({ bar: 1, bars: 2 })]), { ok: true, items: ['b1+1', 'b1+2', 'b2', 'b3', 'b4'] }, 'the first bar replaced');
  assert.deepEqual(await run(bars(4), [EX({ bar: 4, bars: 2 })]), { ok: true, items: ['b1', 'b2', 'b3', 'b4+1', 'b4+2'] }, 'the last bar replaced');
  assert.deepEqual(await run(bars(4), [EX({ bar: 2, bars: 1 })]), { ok: true, items: ['b1', 'b2+1', 'b3', 'b4'] }, 'N = 1 replaces the bar by its one-bar extend');
  assert.deepEqual(await run(bars(4), [EX({ bar: 2, bars: 2, after: 'end' })]), { ok: true, items: ['b1', 'b2', 'b3', 'b4', 'b2+1', 'b2+2'] });
  assert.deepEqual(await run(bars(4), [EX({ bar: 2, bars: 2, after: 0 })]), { ok: true, items: ['b2+1', 'b2+2', 'b1', 'b2', 'b3', 'b4'] });
  assert.deepEqual(await run(bars(4), [EX({ bar: 2, bars: 2, after: 3 })]), { ok: true, items: ['b1', 'b2', 'b3', 'b2+1', 'b2+2', 'b4'] });
  assert.deepEqual(await run(bars(4), [EX({ bar: 4, bars: 2, after: 1 })]), { ok: true, items: ['b1', 'b4+1', 'b4+2', 'b2', 'b3', 'b4'] }, 'the bar need not be next to the gap');
});
test('applyStepsAsync: the steps run in order on the bars the earlier ones left (all four kinds); the runs steps are TypeScript and never ask the engine', async () => {
  const log: Log = [];
  const r = await run(bars(4), [{ op: 'delete', runs: [[1, 1]] }, MX({ a: 1, b: 2, after: 1 }), EX({ bar: 2, bars: 2 }), MB({ a: 1, b: 2, bars: 1, after: 'end' }), { op: 'copy', runs: [[1, 1]] }], log);
  assert.deepEqual(r, { ok: true, items: ['b2', 'b2', 'mix(b2,b3)+1', 'mix(b2,b3)+2', 'b3', 'b4', 'm1'] });
  assert.deepEqual(log.map((l) => l[0]), ['mix', 'extend', 'morph']);
});
test('applyStepsAsync, refusals in exact words: a bar past the end (Mix a or b, Extend), a place past the end, the engine\'s own refusal with its step number, a missing engine', async () => {
  const never = async (): Promise<never> => { throw new Error('the engine must not be asked'); };
  const items = bars(3);
  const NEVER = { morph: never, more: { mix: never, extend: never } };
  const go = (ops: StructureOp[], m: { morph: never; more: { mix: never; extend: never } } = NEVER as never) => applyStepsAsync(items, ops, m.morph, m.more);
  assert.deepEqual(await go([MX({ a: 2, b: 9 })]), { ok: false, message: 'ops[0]: bar 9 asked for, but there are 3 bars.' });
  assert.deepEqual(await go([MX({ a: 9, b: 2 })]), { ok: false, message: 'ops[0]: bar 9 asked for, but there are 3 bars.' });
  assert.deepEqual(await go([EX({ bar: 4 })]), { ok: false, message: 'ops[0]: bar 4 asked for, but there are 3 bars.' });
  assert.deepEqual(await go([MX({ after: 4 })]), { ok: false, message: 'ops[0]: after bar 4 asked for, but there are 3 bars.' });
  assert.deepEqual(await go([EX({ bar: 2, after: 5 })]), { ok: false, message: 'ops[0]: after bar 5 asked for, but there are 3 bars.' });
  assert.deepEqual(await go([{ op: 'keep', runs: [[1, 1]] }, EX({ bar: 2 })]), { ok: false, message: 'ops[1]: bar 2 asked for, but there is 1 bar.' });
  assert.deepEqual(await applyStepsAsync(items, [{ op: 'keep', runs: [[1, 3]] }, MX({ a: 1, b: 2, after: 'end' })], never, { mix: async () => ({ ok: false, message: 'bars 1 and 2 cannot be mixed: x' }), extend: never }), { ok: false, message: 'ops[1]: bars 1 and 2 cannot be mixed: x' }, 'the engine\'s own refusal comes with the number of its step');
  assert.deepEqual(await applyStepsAsync(items, [EX({ bar: 1 })], never, { mix: never, extend: async () => ({ ok: false, message: 'bar 1 has 12 steps; extend needs a 16-step bar.' }) }), { ok: false, message: 'ops[0]: bar 1 has 12 steps; extend needs a 16-step bar.' });
  assert.deepEqual(await applyStepsAsync(items, [EX({ bar: 1 })], never), { ok: false, message: 'ops[0]: the engine was not given for this step.' }, 'a caller with no engine for Mix and Extend says so (never reached from the plugin)');
  assert.deepEqual(await applyStepsAsync(items, [MX({ a: 1, b: 2 })], never), { ok: false, message: 'ops[0]: the engine was not given for this step.' });
  assert.deepEqual(await applyStepsAsync(items, [{ op: 'keep', runs: [[1, 2]] }, MX({ a: 1, b: 2 })], never), { ok: false, message: 'ops[1]: the engine was not given for this step.' });
});
test('applyStepsAsync: a Morph-between still works with the three-argument call of 0996b (no `more`), and the other steps are applyStructure\'s', async () => {
  const m = makers();
  assert.deepEqual(await applyStepsAsync(bars(3), [MB({ a: 1, b: 2, bars: 2, after: 1 })], m.morph), { ok: true, items: ['b1', 'm1', 'm2', 'b2', 'b3'] });
  assert.deepEqual(await applyStepsAsync(bars(3), [{ op: 'move', runs: [[1, 1]], by: 1 }], m.morph), { ok: true, items: ['b2', 'b1', 'b3'] });
});

// ---- the Python facet, the json cache, canonical, the strip -------------------------------------------------------------------------------------------------------------------------------------------------
test('structurePython: exact lines for a vote (weight, threshold, ghost), a path (the stop in millionths, as the Python facet of a path mix says it), an Extend replace and insert, every place', () => {
  assert.deepEqual(structurePython(MX()), ["  _new = [mix_rhythm(a=bars[1], b=bars[2], weight=0.5, threshold=0.5, ghost=False)]", '  bars[2:2] = _new']);
  assert.deepEqual(structurePython(MX({ a: 4, b: 1, weight: 0.7, threshold: 0.4, ghost: true, after: 'end' })), ["  _new = [mix_rhythm(a=bars[3], b=bars[0], weight=0.7, threshold=0.4, ghost=True)]", '  bars = bars + _new']);
  assert.deepEqual(structurePython(MX({ after: 0 })), ["  _new = [mix_rhythm(a=bars[1], b=bars[2], weight=0.5, threshold=0.5, ghost=False)]", '  bars[0:0] = _new']);
  assert.deepEqual(structurePython(MX({ mode: 'path', order: 'seeded', seed: 5, weight: 0.25 })), [
    "  _d = morph_rhythm_info(a=bars[1], b=bars[2], order='seeded', seed=5)['d']",
    "  _new = [morph_rhythm(a=bars[1], b=bars[2], bars=1, order='seeded', seed=5, position=min(_d, max(0, ((1000000 - 250000) * _d + 500000) // 1000000)))]", '  bars[2:2] = _new']);
  assert.deepEqual(structurePython(EX()), ["  _new = extend_rhythm(data=bars[1], bars=4, style='repeat_with_fills', tempo_change_pct=0)", '  bars[1:2] = _new']);
  assert.deepEqual(structurePython(EX({ bar: 5, bars: 2, style: 'building', tempo_change_pct: -20, after: 'end' })), ["  _new = extend_rhythm(data=bars[4], bars=2, style='building', tempo_change_pct=-20)", '  bars = bars + _new']);
  assert.deepEqual(structurePython(EX({ after: 3 })), ["  _new = extend_rhythm(data=bars[1], bars=4, style='repeat_with_fills', tempo_change_pct=0)", '  bars[3:3] = _new']);
});
test('formatTransformOp: the json line of both steps (the fields in the validators\' order; a vote has no order and seed, an Extend replace has no `after`)', () => {
  assert.equal(formatTransformOp(MX()), '{"op": "mix_bars", "a": 2, "b": 3, "weight": 0.5, "threshold": 0.5, "ghost": false, "mode": "vote", "after": 2}');
  assert.equal(formatTransformOp(MX({ mode: 'path', order: 'seeded', seed: 4, after: 'end', weight: 0.3 })), '{"op": "mix_bars", "a": 2, "b": 3, "weight": 0.3, "threshold": 0.5, "ghost": false, "mode": "path", "order": "seeded", "seed": 4, "after": "end"}');
  assert.equal(formatTransformOp(EX()), '{"op": "extend_bar", "bar": 2, "bars": 4, "style": "repeat_with_fills", "tempo_change_pct": 0}');
  assert.equal(formatTransformOp(EX({ after: 0, style: 'ghost_notes', tempo_change_pct: -5 })), '{"op": "extend_bar", "bar": 2, "bars": 4, "style": "ghost_notes", "tempo_change_pct": -5, "after": 0}');
  assert.equal(formatTransformOp(EX({ after: 'end' })), '{"op": "extend_bar", "bar": 2, "bars": 4, "style": "repeat_with_fills", "tempo_change_pct": 0, "after": "end"}');
});
test('canonical / describe of the steps: a vote carries no order and seed, a path keeps its order and the seed of the seeded order only (9 -> 0 otherwise), an Extend keeps its `after` only when it has one, -0 is 0, the keys are in the validators\' order', () => {
  const head = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 } as const;
  const canon = (o: StructureOp) => ((canonical({ ...head, ops: [o] } as GrammarParams) as unknown as { ops: unknown[] }).ops[0]);
  assert.deepEqual(Object.keys(canon(MX()) as object), ['op', 'a', 'b', 'weight', 'threshold', 'ghost', 'mode', 'after']);
  assert.deepEqual(Object.keys(canon(MX({ mode: 'path', order: 'seeded', seed: 3 })) as object), ['op', 'a', 'b', 'weight', 'threshold', 'ghost', 'mode', 'order', 'seed', 'after']);
  assert.deepEqual(canon({ ...MX(), order: 'seeded', seed: 9 }), MX(), 'a vote drops an order and a seed it cannot say');
  assert.deepEqual(canon(MX({ mode: 'path', order: 'musical', seed: 9 })), MX({ mode: 'path', order: 'musical', seed: 0 }));
  assert.deepEqual(canon(MX({ mode: 'path', order: 'by_channel', seed: 9 })), MX({ mode: 'path', order: 'by_channel', seed: 0 }));
  assert.deepEqual(canon(MX({ mode: 'path', order: 'seeded', seed: 9 })), MX({ mode: 'path', order: 'seeded', seed: 9 }));
  assert.deepEqual(canon(MX({ mode: 'path' })), MX({ mode: 'path', order: 'musical', seed: 0 }), 'a path with no order is musical');
  assert.deepEqual(canon(MX({ mode: 'path', order: 'seeded' })), MX({ mode: 'path', order: 'seeded', seed: 0 }));
  assert.deepEqual(Object.keys(canon(EX()) as object), ['op', 'bar', 'bars', 'style', 'tempo_change_pct']);
  assert.deepEqual(Object.keys(canon(EX({ after: 3 })) as object), ['op', 'bar', 'bars', 'style', 'tempo_change_pct', 'after']);
  assert.ok(Object.is((canon(EX({ tempo_change_pct: -0 })) as { tempo_change_pct: number }).tempo_change_pct, 0));
  assert.equal(describe({ ...head, ops: [MX({ after: 'end' }), EX({ after: 2 })] } as GrammarParams), 'Extend [[bar_005]] to 8 bars, repeating with fills. Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it at the end. Extend bar 2 to 4 bars, repeating with fills, and put them after bar 2.');
});
test('barCount of a transform: the bars its Mix and Extend steps name (before the Score says), with the other steps\' own', () => {
  const t = (...ops: StructureOp[]): PhraseParams => ({ kind: 'transform', source: 'phrases/phrase_003', ops });
  assert.equal(barCount(t(MX({ a: 2, b: 7 }))), 7); assert.equal(barCount(t(MX({ a: 9, b: 7 }))), 9); assert.equal(barCount(t(EX({ bar: 6 }))), 6);
  assert.equal(barCount(t(EX({ bar: 3 }), { op: 'copy', runs: [[1, 4]] })), 4); assert.equal(barCount(t(MB({ a: 5, b: 2 }))), 5);
  assert.equal(barCount(t(EX({ bar: 3 })), 11), 11, 'the Score\'s own count wins');
  const head: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, ops: [EX({ bar: 2 })] };
  assert.equal(barCount(head, 9), 9, 'a head with steps has the bars the Score has'); assert.equal(barCount(head), 4);
});
test('the engine\'s own refusal lines are recognised from a traceback or a bare message, and nothing else is: extend_rhythm (and not mix or morph), mix_rhythm, morph_rhythm', () => {
  const tb = (line: string) => `Traceback (most recent call last):\n  File "x.py", line 1, in f\nValueError: ${line}`;
  assert.equal(extendRhythmRefusal(tb("extend_rhythm: unknown channel(s) ['cowbell']; supported: ['kick']")), "extend_rhythm: unknown channel(s) ['cowbell']; supported: ['kick']");
  assert.equal(extendRhythmRefusal("extend_rhythm: bars must be an int from 1 to 64, got 0"), 'extend_rhythm: bars must be an int from 1 to 64, got 0');
  assert.equal(extendRhythmRefusal('ValueError: extend_rhythm: x   '), 'extend_rhythm: x', 'the trailing space goes');
  assert.equal(extendRhythmRefusal(tb('mix_rhythm: a and b must agree on steps')), null); assert.equal(extendRhythmRefusal(tb('something else')), null); assert.equal(extendRhythmRefusal(''), null);
  assert.equal(extendRhythmRefusal('prefix extend_rhythm: x'), null, 'the line starts the message or a line');
  assert.equal(mixRhythmRefusal(tb('mix_rhythm: a and b must agree on steps')), 'mix_rhythm: a and b must agree on steps'); assert.equal(mixRhythmRefusal(tb('extend_rhythm: x')), null);
  assert.equal(morphRhythmRefusal(tb('morph_rhythm: a and b must agree on steps')), 'morph_rhythm: a and b must agree on steps'); assert.equal(morphRhythmRefusal(tb('extend_rhythm: x')), null);
});
test('STRUCTURE_WORDS has the Mix and Extend rows: the verb is the first word the words say', () => {
  assert.equal(STRUCTURE_WORDS.mix_bars.verb, 'mix'); assert.equal(STRUCTURE_WORDS.extend_bar.verb, 'extend');
  assert.ok(structureWords(MX()).startsWith('mix ')); assert.ok(structureWords(EX()).startsWith('extend '));
});
