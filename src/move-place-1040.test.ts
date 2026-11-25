// 2026-11-24-1040 (MOVE TO A PLACE IN ONE SENTENCE; A FORGIVING MORPH STEP) - written RED FIRST (every test of A and B that is new failed against HEAD a61e431; the pins of the OLD sentences, marked "pin", were green before and after).
//   A  `Move bar 1 after bar 5.` is ONE sentence and ONE op (an `after` on the move, as 1036 gave the Copy): every place word, the canonical sentence the list shows, the op, the json, the Python the note carries (run by a real python3), the refusals in words;
//      the single sentence and the old chain of one-place moves give the SAME final order on every phrase of 2 to 6 bars, every bar and every place, against an independent model (take the range out, put it back)
//   B  the Morph, Mix and Extend steps read the words people type (`and place after bar 5`, `bar` or `bars`, with or without the commas) and say in words what is missing
//   P3 pins: the one-place sentences, the chains already in a note, Copy's place words, the Morph and Mix steps as written: they read and write exactly as before
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { parse } from './phrase-grammar-core.ts';
import { describe } from './phrase-describe-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { applyStructure, applyStructureOps, isRunsOp, structurePython, structureSentence, structureWords } from './bar-structure-core.ts';
import { formatTransformOp, readPhraseNote, noteContentFor, validatePhrase, type PhraseParams, type StructureOp } from './phrase-core.ts';
import { grammarTable } from './service-lines-core.ts';
import { traceSteps } from './phrase-steps-lineage-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const TAKE = 'Take [[phrase_006]].';
const ops = (sentence: string): StructureOp[] => { const r = parse(`${TAKE} ${sentence}`, PHRASE_VAULT); assert.ok(r.ok, `${sentence}: ${r.ok ? '' : r.error.message}`); return ((r as { params: { ops: StructureOp[] } }).params.ops); };
const refusal = (sentence: string): string => { const r = parse(`${TAKE} ${sentence}`, PHRASE_VAULT); assert.equal(r.ok, false, `${sentence} should be refused`); return r.ok ? '' : r.error.message; };
const canon = (sentence: string): string => describe((parse(`${TAKE} ${sentence}`, PHRASE_VAULT) as { params: never }).params).replace(`${TAKE} `, '');
const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const head = (n: number): string => `Extend [[bar_005]] to ${n} bars, repeating with fills.`;
/** The bars' order after the sentences: the REAL grammar (the list replay) and the REAL structure path (`applyStructureOps`). */
function finalOrder(n: number, ...sentences: string[]): number[] {
  const r = replayGrammar([head(n), ...sentences], 'phrase', { vault: PHRASE_VAULT } as never);
  assert.equal(r.stop, null, `the grammar reads every sentence: ${JSON.stringify(r.stop)}`);
  const list = ((r.params as { ops?: StructureOp[] }).ops ?? []);
  assert.ok(list.every(isRunsOp), 'a move is a step of TypeScript: the engine is never asked');
  const done = applyStructureOps(nums(n), list as never);
  assert.ok(done.ok, done.ok ? '' : done.message);
  return done.ok ? done.items : [];
}
/** The independent model: take the bars of the ranges out, put them back (in order) in the gap after bar `g` of the bars as they were (0 = the start, 'end'). */
function model(n: number, runs: Array<[number, number]>, g: number | 'end'): number[] {
  const inRuns = (i: number): boolean => runs.some(([a, b]) => i >= a && i <= b);
  const rest = nums(n).filter((i) => !inRuns(i)), picked = nums(n).filter(inRuns);
  const k = g === 'end' ? rest.length : rest.filter((i) => i <= g).length;
  return [...rest.slice(0, k), ...picked, ...rest.slice(k)];
}

// ---- A: every place word, the canonical sentence, the op ---------------------------------------------------------------------------------------------------------------------------------------------
const PLACES: Array<[said: string, written: string, after: number | 'end']> = [
  ['Move bar 1 after bar 5.', 'Move bar 1 after bar 5.', 5],
  ['Move bars 3 to 5 after bar 8.', 'Move bars 3 to 5 after bar 8.', 8],
  ['Move bar 4 to the start.', 'Move bar 4 to the start.', 0],
  ['Move bars 3 to 5 to the end.', 'Move bars 3 to 5 to the end.', 'end'],
  ['Move bar 1 before bar 5.', 'Move bar 1 after bar 4.', 4],                                              // `before bar N` is the gap after bar N - 1 (as 1036 writes a Copy)
  ['Move bar 4 before bar 1.', 'Move bar 4 to the start.', 0],
  ['Move bar 3 at the start.', 'Move bar 3 to the start.', 0],
  ['Move bar 3 at the end.', 'Move bar 3 to the end.', 'end'],
  ['Move bar 3 to the beginning.', 'Move bar 3 to the start.', 0],
  ['Move bar 1 and put it after bar 5.', 'Move bar 1 after bar 5.', 5],                                    // the Copy wording
  ['Move bars 3 to 5 and put them at the end.', 'Move bars 3 to 5 to the end.', 'end'],
  ['Move bar 6 and put it at the start.', 'Move bar 6 to the start.', 0],
  ['Move bar 6 and place it before bar 2.', 'Move bar 6 after bar 1.', 1],
  ['Move bar 6 between bars 2 and 3.', 'Move bar 6 after bar 2.', 2],
  ['move bar 6 AFTER bar 8', 'Move bar 6 after bar 8.', 8],
  ['Move bar 1 and bar 7 after bar 4.', 'Move bar 1 and bar 7 after bar 4.', 4],                            // two ranges, put back together in their order
  ['Move bars 2 to 3 and bar 9 to the end.', 'Move bars 2 to 3 and bar 9 to the end.', 'end'],
];
test('A: every place word is read, written back as the ONE canonical sentence the list shows, and the op carries the gap (0 = the start, a bar, `end`)', () => {
  for (const [said, written, after] of PLACES) {
    const o = ops(said); assert.equal(o.length, 1, said); assert.equal(o[0].op, 'move', said); assert.deepEqual((o[0] as { after?: unknown }).after, after, said);
    assert.ok(!('by' in o[0]), `${said}: a place move has no \`by\``);
    assert.equal(canon(said), written, said); assert.equal(canon(written), written, `${written}: the canonical sentence is its own reading`);
  }
});
test('A: the words of the canonical sentence, from the op (`to the start`, `to the end`, `after bar N`), one sentence per op', () => {
  assert.equal(structureWords({ op: 'move', runs: [[1, 1]], after: 5 }), 'move bar 1 after bar 5');
  assert.equal(structureWords({ op: 'move', runs: [[4, 4]], after: 0 }), 'move bar 4 to the start');
  assert.equal(structureWords({ op: 'move', runs: [[3, 5]], after: 'end' }), 'move bars 3 to 5 to the end');
  assert.equal(structureSentence({ op: 'move', runs: [[3, 5]], after: 8 }), 'Move bars 3 to 5 after bar 8.');
  assert.equal(ops('Move bar 1 after bar 5.').length, 1, 'ONE op (the chain was five)');
});
test('A: the json block round-trips (`{"op": "move", "runs": [[1,1]], "after": 5}`), a move holds `by` OR `after`, the old json still reads', () => {
  const p: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: ops('Move bar 1 after bar 5. Move bars 3 to 4 to the end. Move bar 2 to the start. Move bar 3 one bar left.') };
  const back = readPhraseNote(noteContentFor('phrase_007', p));
  assert.ok(back.ok, back.ok ? '' : back.message); assert.deepEqual(back.ok ? (back.value as { ops: unknown[] }).ops : null, (p as { ops: unknown[] }).ops);
  assert.equal(formatTransformOp({ op: 'move', runs: [[1, 1]], after: 5 }), '{"op": "move", "runs": [[1,1]], "after": 5}');
  assert.equal(formatTransformOp({ op: 'move', runs: [[1, 1]], after: 'end' }), '{"op": "move", "runs": [[1,1]], "after": "end"}');
  assert.equal(formatTransformOp({ op: 'move', runs: [[3, 5]], by: -1 }), '{"op": "move", "runs": [[3,5]], "by": -1}', 'pin: the json of an old move is byte for byte what it was');
  const v = (extra: Record<string, unknown>): string => { const r = validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'move', runs: [[1, 1]], ...extra }] }); return r.ok ? 'OK' : r.message; };
  assert.equal(v({ after: 3 }), 'OK'); assert.equal(v({ after: 0 }), 'OK'); assert.equal(v({ after: 'end' }), 'OK'); assert.equal(v({ by: 1 }), 'OK');
  assert.match(v({ after: -1 }), /ops\[0\]\.after must be/); assert.match(v({ after: 'middle' }), /ops\[0\]\.after must be/);
  assert.match(v({ by: 1, after: 3 }), /unexpected field "by"/, 'both is refused'); assert.match(v({}), /ops\[0\]\.by must be -1/, 'neither is refused (as before)');
});

// ---- A: the refusals, in words -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('A: the place INSIDE the bars you are moving, a move that goes NOWHERE (known from the sentence), and the old refusals of the 1027 repair, in words; the sentence is refused at the sentence, not written', () => {
  assert.equal(refusal('Move bars 3 to 5 after bar 4.'), 'Bar 4 is part of the bars you are moving.');
  assert.equal(refusal('Move bars 3 to 5 after bar 3.'), 'Bar 3 is part of the bars you are moving.');
  assert.equal(refusal('Move bars 3 to 5 after bar 5.'), 'Bar 5 is part of the bars you are moving.');
  assert.equal(refusal('Move bar 3 after bar 3.'), 'Bar 3 is part of the bars you are moving.');
  assert.equal(refusal('Move bar 3 before bar 4.'), 'Bar 3 is part of the bars you are moving.', '`before bar 4` is the gap after bar 3: the gap right after the bar itself');
  assert.equal(refusal('Move bar 3 before bar 3.'), 'Bar 3 is already after bar 2.', '`before bar 3` is the gap after bar 2: where bar 3 already is');
  assert.equal(refusal('Move bar 3 after bar 2.'), 'Bar 3 is already after bar 2.');
  assert.equal(refusal('Move bars 3 to 5 after bar 2.'), 'Bars 3 to 5 are already after bar 2.');
  assert.equal(refusal('Move bar 1 to the start.'), 'Bar 1 is already at the start.');
  assert.equal(refusal('Move bars 1 to 3 to the start.'), 'Bars 1 to 3 are already at the start.');
  assert.equal(refusal('Move bar 1 and put it before bar 1.'), 'Bar 1 is already at the start.');
  assert.match(refusal('Move bar 3 and put it.'), /^Expected a place \("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"\), but found the end of the sentence\.$/);
  assert.match(refusal('Move bar 3 between bars 2 and 4.'), /Expected two neighbouring bars after "between"/);
  assert.match(refusal('Move bar 3 after bar 5 to the end.'), /./, 'two places are refused');
  assert.match(refusal('Move bar 3 after bar.'), /Expected a bar number/);
  assert.match(refusal('Move bar 3 after bar 0.'), /Expected a bar number \("after bar N"\), 1 or more/);
});
test('A: the refusals that need the number of bars (the engine\'s words, as the bounds always were): `Bar 5 is already at the end.`, a gap past the end, a bar past the end', () => {
  const r = (n: number, text: string) => applyStructure(nums(n), ops(text)[0] as never);
  assert.deepEqual(r(5, 'Move bar 5 to the end.'), { ok: false, message: 'Bar 5 is already at the end.' });
  assert.deepEqual(r(5, 'Move bars 4 to 5 to the end.'), { ok: false, message: 'Bars 4 to 5 are already at the end.' });
  assert.deepEqual(r(5, 'Move bar 2 to the end.'), { ok: true, items: [1, 3, 4, 5, 2] });
  assert.deepEqual(r(4, 'Move bar 6 to the end.'), { ok: false, message: 'bar 6 asked for, but there are 4 bars.' });
  assert.deepEqual(r(4, 'Move bar 2 after bar 9.'), { ok: false, message: 'after bar 9 asked for, but there are 4 bars.' });
  assert.deepEqual(r(1, 'Move bar 1 after bar 2.'), { ok: false, message: 'after bar 2 asked for, but there is 1 bar.' });
  assert.deepEqual(applyStructure(nums(5), { op: 'move', runs: [[2, 3]], after: 3 } as never), { ok: false, message: 'Bar 3 is part of the bars you are moving.' }, 'a json note that says it is refused at the bars too');
  assert.deepEqual(r(5, 'Move bar 1 and bar 5 to the end.'), { ok: true, items: [2, 3, 4, 1, 5] }, 'two ranges to the end: a real move, not "already"');
});

// ---- A: the order of the bars: the single sentence, the old chain and an independent model --------------------------------------------------------------------------------------------------
test('A: every place on phrases of 2 to 6 bars: the final order IS the meaning (the independent model: take the range out, put it back)', () => {
  let checked = 0;
  for (let n = 2; n <= 6; n++) for (let a = 1; a <= n; a++) for (let b = a; b <= n; b++) for (const g of [0, ...nums(n), 'end'] as Array<number | 'end'>) {
    const words = g === 0 ? 'to the start' : g === 'end' ? 'to the end' : `after bar ${g}`;
    const say = `Move ${a === b ? `bar ${a}` : `bars ${a} to ${b}`} ${words}.`;
    const inside = typeof g === 'number' && g >= a && g <= b, nowhere = g === a - 1 || (g === 'end' && b === n);
    if (inside || nowhere) { assert.equal(parse(`${head(n)} ${say}`, PHRASE_VAULT).ok && !nowhere, false, `${say} on ${n} bars is refused`); continue; }
    assert.deepEqual(finalOrder(n, say), model(n, [[a, b]], g), `${say} on ${n} bars`); checked++;
  }
  assert.ok(checked > 150, `${checked} cases`);
});
test('A: the SINGLE sentence and the OLD CHAIN of one-place moves give the same final order (2 to 6 bars, every bar, every place)', () => {
  let checked = 0;
  for (let n = 2; n <= 6; n++) for (let a = 1; a <= n; a++) for (const g of [0, ...nums(n), 'end'] as Array<number | 'end'>) {
    const gap = g === 'end' ? n : g;
    if (gap === a || gap === a - 1) continue;                                          // inside, or where it already is: refused, not a chain
    const chain: string[] = [];
    if (gap > a) for (let k = a; k < gap; k++) chain.push(`Move bar ${k} one bar right.`);
    else for (let k = a; k > gap + 1; k--) chain.push(`Move bar ${k} one bar left.`);
    const say = g === 0 ? `Move bar ${a} to the start.` : g === 'end' ? `Move bar ${a} to the end.` : `Move bar ${a} after bar ${g}.`;
    const one = finalOrder(n, say), many = finalOrder(n, ...chain);
    assert.deepEqual(one, many, `${say} on ${n} bars: the sentence and its chain (${chain.join(' ')})`); assert.deepEqual(one, model(n, [[a, a]], g), say); checked++;
  }
  assert.ok(checked > 60, `${checked} cases`);
});
test('A: two ranges, and a move after other steps (each step is of the bars as they are after the step before)', () => {
  assert.deepEqual(finalOrder(9, 'Move bar 1 and bar 7 after bar 4.'), model(9, [[1, 1], [7, 7]], 4)); assert.deepEqual(finalOrder(9, 'Move bar 1 and bar 7 after bar 4.'), [2, 3, 4, 1, 7, 5, 6, 8, 9]);
  assert.deepEqual(finalOrder(9, 'Move bars 2 to 3 and bar 9 to the end.'), [1, 4, 5, 6, 7, 8, 2, 3, 9]);
  assert.deepEqual(finalOrder(5, 'Delete bar 2.', 'Move bar 1 to the end.'), [3, 4, 5, 1]);
  assert.deepEqual(finalOrder(5, 'Move bar 1 after bar 5.', 'Move bar 5 to the start.'), [1, 2, 3, 4, 5]);
  assert.deepEqual(finalOrder(5, 'Copy bar 1 and put it at the end.', 'Move bar 6 after bar 2.'), [1, 2, 1, 3, 4, 5]);
});

test('A: which bar MOVED (the Score\'s origin trace): only the bars of the ranges are marked, wherever they land (a one-place Move marks the bar it swapped with too: that is unchanged)', () => {
  const t = traceSteps(5, ops('Move bar 1 after bar 3.'));
  assert.deepEqual(t.map((o) => o.head), [2, 3, 1, 4, 5]); assert.deepEqual(t.map((o) => o.via.map((v) => v.how)), [[], [], ['move'], [], []]);
  const u = traceSteps(5, ops('Move bars 2 to 3 to the end.'));
  assert.deepEqual(u.map((o) => o.head), [1, 4, 5, 2, 3]); assert.deepEqual(u.map((o) => o.via.length), [0, 0, 0, 1, 1]);
  const old = traceSteps(4, ops('Move bar 2 one bar right.')); assert.deepEqual(old.map((o) => o.via.length), [0, 1, 1, 0], 'pin: the one-place move marks both bars');
});

// ---- the Python the note carries -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('THE NOTE\'S PYTHON does what the TypeScript does for a move to a place (every gap, on lists of 1 to 9 bars, run by python3); the old moves\' Python is byte for byte what it was', (t) => {
  if (spawnSync('python3', ['-c', 'print(1)']).status !== 0) { t.skip('python3 not found'); return; }
  const shapes: StructureOp[] = [];
  for (const after of [0, 1, 2, 4, 'end'] as const) for (const runs of [[[1, 1]], [[2, 3]], [[1, 1], [3, 4]], [[2, 2], [4, 4], [6, 6]], [[5, 7]]] as Array<Array<[number, number]>>) shapes.push({ op: 'move', runs, after });
  const cases: Array<{ items: number[]; op: StructureOp; want: number[] | null }> = [];
  for (let n = 1; n <= 9; n++) for (const op of shapes) { const r = applyStructure(nums(n), op as never); cases.push({ items: nums(n), op, want: r.ok ? r.items : null }); }
  const prog = ['import json, sys', 'out = []', 'for case in json.load(sys.stdin):', '  bars = list(case["items"])', '  src = case["code"]', '  try:', '    exec("def compute():\\n  global bars\\n" + src + "\\n  return bars", globals())', '    out.append(compute())', '  except Exception:', '    out.append(None)', 'print(json.dumps(out))'].join('\n');
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(cases.map((c) => ({ items: c.items, code: structurePython(c.op).join('\n') }))), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const outs = JSON.parse(r.stdout) as Array<number[] | null>; let compared = 0;
  cases.forEach((c, i) => { if (c.want === null) return; assert.deepEqual(outs[i], c.want, `${structureSentence(c.op)} on ${c.items.length} bars`); compared++; });
  assert.ok(compared > 60, `compared ${compared}`);
  assert.deepEqual(structurePython({ op: 'move', runs: [[3, 5]], by: -1 }), ['  for a, b in [[3,5]]:', '    x = bars.pop(a - 2)', '    bars.insert(b - 1, x)'], 'pin');
  assert.deepEqual(structurePython({ op: 'move', runs: [[3, 5]], by: 1 }), ['  for a, b in [[3,5]][::-1]:', '    x = bars.pop(b)', '    bars.insert(a - 1, x)'], 'pin');
});

// ---- P3 pins: the old sentences, byte for byte ------------------------------------------------------------------------------------------------------------------------------------------------------
test('pin: the one-place Move sentences and their words read and write exactly as before (the op has `by`, never `after`)', () => {
  for (const [said, op, written] of [['Move bar 3 one bar left.', { op: 'move', runs: [[3, 3]], by: -1 }, 'Move bar 3 one bar left.'], ['Move bars 3 to 5 one bar right.', { op: 'move', runs: [[3, 5]], by: 1 }, 'Move bars 3 to 5 one bar right.'],
    ['Move bar 3 back.', { op: 'move', runs: [[3, 3]], by: -1 }, 'Move bar 3 one bar left.'], ['Move bar 3 to the left.', { op: 'move', runs: [[3, 3]], by: -1 }, 'Move bar 3 one bar left.'], ['Move bar 3 forward.', { op: 'move', runs: [[3, 3]], by: 1 }, 'Move bar 3 one bar right.'],
    ['Move bar 3 to the back.', { op: 'move', runs: [[3, 3]], by: -1 }, 'Move bar 3 one bar left.'], ['Move bar 3 later.', { op: 'move', runs: [[3, 3]], by: 1 }, 'Move bar 3 one bar right.'], ['Move bar 2 and bar 5 one bar left.', { op: 'move', runs: [[2, 2], [5, 5]], by: -1 }, 'Move bar 2 and bar 5 one bar left.']] as Array<[string, StructureOp, string]>) {
    assert.deepEqual(ops(said), [op], said); assert.equal(canon(said), written, said);
  }
  assert.match(refusal('Move bar 3 two bars left.'), /^Move takes one bar at a time\. Say "Move bar 3 one bar left\." twice\.$/);
  assert.match(refusal('Move bar 3 one bar sideways.'), /Expected "one bar left", "one bar right", "back" or "forward"/);
});
test('pin: a chain already in a note reads and replays byte for byte (the 1027 chains, every line, in order)', () => {
  const chain = ['Move bar 1 one bar right.', 'Move bar 2 one bar right.', 'Move bar 3 one bar right.', 'Move bar 4 one bar right.'];
  assert.deepEqual(finalOrder(5, ...chain), [2, 3, 4, 5, 1]); assert.deepEqual(finalOrder(5, 'Move bar 4 one bar left.', 'Move bar 3 one bar left.'), [1, 4, 2, 3, 5]);
  const r = replayGrammar([head(5), ...chain], 'phrase', { vault: PHRASE_VAULT } as never);
  assert.equal(r.stop, null); assert.equal(((r.params as { ops: StructureOp[] }).ops).length, 4, 'four ops: the old chain is still four ops (nothing is merged)');
  assert.deepEqual(structurePython({ op: 'move', runs: [[1, 1]], by: 1 }), ['  for a, b in [[1,1]][::-1]:', '    x = bars.pop(b)', '    bars.insert(a - 1, x)']);
});
test('pin: Copy with place words (1036) and the Morph, Mix and Extend steps as written read and write exactly as before', () => {
  for (const s of ['Copy bar 6 and put it at the end.', 'Copy bars 3 to 5 and put them after bar 8.', 'Copy bar 6 and put it at the start.', 'Copy bar 3.', 'Copy bar 3 and bar 5.',
    'Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.', 'Morph bars 1 and 5 across 5 bars, in musical order, and put them after bar 5.', 'Morph bars 1 and 5 across 5 bars, in seeded order, seed 7, and put them at the end.',
    'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.', 'Mix bars 2 and 5, 70 percent bar 2, as a path, in musical order, and put it after bar 5.', 'Extend bar 2 to 4 bars, repeating with fills.', 'Extend bar 2 to 4 bars, repeating with fills, and put them at the end.'])
    assert.equal(canon(s), s, s);
  assert.deepEqual(ops('Copy bar 6 and put it at the end.'), [{ op: 'copy', runs: [[6, 6]], after: 'end' }]);
  assert.deepEqual(ops('Morph bars 2 and 3 across 5 bars.'), [{ op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2 }], 'the place defaults as before');
  assert.equal(canon('Morph bars 2 and 9 across 5 bars.'), 'Morph bars 2 and 9 across 5 bars, in musical order, and put them after bar 9.');
});

// ---- B: the forgiving Morph, Mix and Extend steps ----------------------------------------------------------------------------------------------------------------------------------------------------
const MORPH = 'Morph bars 1 and 5 across 5 bars, in musical order, and put them after bar 5.';
test('B: the driver\'s own sentence, and every way of saying the place a person tries, are the canonical Morph (and `bar` or `bars` before the numbers, a comma or none)', () => {
  for (const s of ['morph bar 1 and 5 across 5 bars and place after bar 5', 'Morph bars 1 and 5 across 5 bars, in musical order, and put them after bar 5.', 'Morph bar 1 and 5 across 5 bars, in musical order, and put them after bar 5.',
    'Morph bars 1 and 5 across 5 bars, and put it after bar 5.', 'Morph bars 1 and 5 across 5 bars and put them after bar 5', 'Morph bars 1 and 5 across 5 bars and place them after bar 5', 'Morph bars 1 and 5 across 5 bars and place it after bar 5', 'Morph bars 1 and 5 across 5 bars and place after bar 5',
    'Morph bars 1 and 5 across 5 bars, put them after bar 5', 'Morph bars 1 and 5 across 5 bars place it after bar 5', 'Morph bars 1 and 5 across 5 bars place after bar 5', 'Morph bars 1 and 5 across 5 bars, and put after bar 5', 'Morph bar 1 and bar 5 across 5 bars after bar 5', 'Morph bars 1 and 5 across 5 bars, in musical order after bar 5',
    'Morph bars 1 and 5 across 5 bars in musical order and place them after bar 5', 'Morph bars 1 and 5 across 5 bars, in musical order, and place them after bar 5', 'Morph bars 1 and 5 across 5 bars, and put those after bar 5', 'Morph bars 1 and 5 across 5 bars and put these after bar 5',
    'Morph bars 1 and 5 across 5 bars, in musical order.', 'Morph bars 1 and 5 across 5 bars.'])
    assert.equal(canon(s), MORPH, s);
  assert.equal(canon('Morph bars 1 and 5 across 5 bars, in seeded order, seed 7 and place them at the start'), 'Morph bars 1 and 5 across 5 bars, in seeded order, seed 7, and put them at the start.');
  assert.equal(canon('Morph bars 1 and 5 across 5 bars and place them to the end'), 'Morph bars 1 and 5 across 5 bars, in musical order, and put them at the end.');
});
test('B: the Mix step and the Extend step take the same words for the place', () => {
  const MIX = 'Mix bars 2 and 5, 50 percent bar 2, as a vote, and put it after bar 5.';
  for (const s of ['Mix bars 2 and 5 and place after bar 5', 'Mix bar 2 and 5, and put it after bar 5', 'Mix bars 2 and 5 and place it after bar 5.', 'Mix bars 2 and 5, put it after bar 5', 'Mix bars 2 and 5 place after bar 5', 'Mix bars 2 and 5, 50 percent bar 2, as a vote, and put it after bar 5.'])
    assert.equal(canon(s), MIX, s);
  const EXT = 'Extend bar 2 to 4 bars, repeating with fills, and put them at the end.';
  for (const s of ['Extend bar 2 to 4 bars and place at the end', 'Extend bar 2 to 4 bars, and put them at the end', 'Extend bar 2 to 4 bars and place them to the end', 'Extend bar 2 to 4 bars, repeating with fills, and place it at the end.', 'Extend bar 2 to 4 bars place them at the end', 'Extend bar 2 to 4 bars, put them at the back'])
    assert.equal(canon(s), EXT, s);
});
test('B: a step that is almost right says what is missing in words (the place after `and place`, the number of bars, a bar to morph with)', () => {
  assert.match(refusal('Morph bars 1 and 5 across 5 bars and place.'), /^Expected a place \("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"\), but found the end of the sentence\.$/);
  assert.match(refusal('Morph bars 1 and 5 across 5 bars and then place it after bar 5.'), /^Expected a place \("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"\), but found "then"\.$/);
  assert.match(refusal('Morph bars 1 and 5 and place after bar 5.'), /^Expected "across N bars" \(how many new bars to make between them\), but found none\.$/);
  assert.match(refusal('Morph bar 1 across 5 bars.'), /^Expected "and", but found "across"\.$/);
  assert.match(refusal('Morph bars 1 and 5 across 5 bars and put them next to bar 5.'), /^Expected a place \(.*\), but found "next"\.$/);
  assert.match(refusal('Mix bars 2 and 5 and then place it after bar 5.'), /but found "then"\./);
  assert.match(refusal('Morph bars 1 and 5 across 5 bars across 6 bars.'), /Expected "across N bars" to be said once, but it is said twice\./);
});
test('B: the table the client sends says the new Move row, and keeps the old one', () => {
  const t = grammarTable('phrase');
  assert.ok(t.includes('move: Move bars 3 to 5 one bar left.'), 'the old row stays');
  assert.ok(t.includes('move to a place: Move bar 1 after bar 5.'), t);
});
