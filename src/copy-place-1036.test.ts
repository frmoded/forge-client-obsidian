// 2026-11-24-1036 (COPY A BAR TO A PLACE IN A PHRASE) - the pure parts, RED FIRST. The driver typed `Make a copy of [[bar_006]] at the end of score (after [[bar_0012]]` in a phrase composer: the grammar's Copy has NO place words (the copy goes right after the original),
// so the table the client sent the service had no row that could say "copy to a place" and the model said so. Now Copy takes the place words Extend, Mix and Morph already have (`and put it after bar 12`, `at the start`, `at the end`, `before bar N`, `between bars N and M`).
//   A  the old Copy sentences read and write exactly as before, byte for byte (no place = the copy goes right after the original)
//   B  every place word: the sentence the grammar reads, the canonical sentence the list shows, the op, the json, the Python the note carries (run by a real python3)
//   C  the ORDER of the bars through the real grammar and the real structure path: a 12-bar phrase, `Copy bar 6 and put it at the end.` gives 13 bars with the copy last
//   D  the free words and the bar links (`make a copy of [[bar_006]] at the end of the score`): a closed list, one position = the grammar's sentence, several = a question, a link the phrase does not hold = refused in words naming it
//   E  the table sent to the service has the new Copy row (the old one stays)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { parse, VERBS } from './phrase-grammar-core.ts';
import { describe } from './phrase-describe-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { applyStructure, applyStructureOps, isRunsOp, structurePython, structureSentence, structureWords } from './bar-structure-core.ts';
import { formatTransformOp, readPhraseNote, noteContentFor, validatePhrase, type PhraseParams, type StructureOp } from './phrase-core.ts';
import { duplicateByLink, repairCandidate, verbsOf } from './did-you-mean-core.ts';
import { grammarTable, linesRequestFields } from './service-lines-core.ts';
import { traceSteps } from './phrase-steps-lineage-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const TAKE = 'Take [[phrase_006]].';
const ops = (sentence: string): StructureOp[] => { const r = parse(`${TAKE} ${sentence}`, PHRASE_VAULT); assert.ok(r.ok, r.ok ? '' : r.error.message); return ((r as { params: { ops: StructureOp[] } }).params.ops); };
const refusal = (sentence: string): string => { const r = parse(`${TAKE} ${sentence}`, PHRASE_VAULT); assert.equal(r.ok, false, sentence); return r.ok ? '' : r.error.message; };
/** the canonical sentence the list shows for a typed one (the sentence the grammar READS, written back) */
const canon = (sentence: string): string => describe(parse(`${TAKE} ${sentence}`, PHRASE_VAULT).ok ? (parse(`${TAKE} ${sentence}`, PHRASE_VAULT) as { params: never }).params : (null as never)).replace(`${TAKE} `, '');
const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

// ---- A: the old sentences, byte for byte -------------------------------------------------------------------------------------------------------------------------------------------------------------
test('A: `Copy bar 3.` and `Copy bars 3 to 5.` (and Duplicate) read as the same op and write the same sentence as before: no `after`, the copy goes right after the original', () => {
  for (const [said, op, written] of [['Copy bar 3.', { op: 'copy', runs: [[3, 3]] }, 'Copy bar 3.'], ['Copy bars 3 to 5.', { op: 'copy', runs: [[3, 5]] }, 'Copy bars 3 to 5.'], ['Duplicate bar 3.', { op: 'copy', runs: [[3, 3]] }, 'Copy bar 3.'],
    ['Copy bars 3 to 5 and bar 8.', { op: 'copy', runs: [[3, 5], [8, 8]] }, 'Copy bars 3 to 5 and bar 8.'], ['Copy bar 5 and bar 3.', { op: 'copy', runs: [[3, 3], [5, 5]] }, 'Copy bar 3 and bar 5.'], ['Copy bar 3 and bar 4.', { op: 'copy', runs: [[3, 4]] }, 'Copy bars 3 to 4.']] as const) {
    assert.deepEqual(ops(said), [op], said); assert.equal(canon(said), written, said);
    assert.ok(!('after' in ops(said)[0]), `${said}: no place key`);
  }
  assert.equal(formatTransformOp({ op: 'copy', runs: [[3, 5]] }), '{"op": "copy", "runs": [[3,5]]}', 'the json of an old Copy has no `after`');
  assert.equal(structureSentence({ op: 'copy', runs: [[3, 5]] }), 'Copy bars 3 to 5.');
  assert.deepEqual(applyStructure(nums(6), { op: 'copy', runs: [[2, 3]] }), { ok: true, items: [1, 2, 3, 2, 3, 4, 5, 6] }, 'the copy goes right after its original');
  assert.match(refusal('Copy bar 3 x.'), /Expected the end of the sentence|Expected/, 'trailing words are still refused');
});
test('A: the two old rows of the table are unchanged byte for byte (`copy: Copy bars 3 to 5.`); the Copy example of STRUCTURE_WORDS too', () => {
  assert.ok(grammarTable('phrase').includes('copy: Copy bars 3 to 5.'));
  assert.equal(VERBS.find((v) => v.verb === 'copy')!.example, 'Copy bars 3 to 5.');
});

// ---- B: every place word ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const PLACES: Array<[said: string, written: string, after: number | 'end']> = [
  ['Copy bar 6 and put it after bar 12.', 'Copy bar 6 and put it after bar 12.', 12],
  ['Copy bar 6 and put it at the end.', 'Copy bar 6 and put it at the end.', 'end'],
  ['Copy bar 6 and put it at the start.', 'Copy bar 6 and put it at the start.', 0],
  ['Copy bar 6 and put it before bar 2.', 'Copy bar 6 and put it after bar 1.', 1],                          // `before bar N` is the gap after bar N - 1 (as Extend writes it)
  ['Copy bar 6 and put it before bar 1.', 'Copy bar 6 and put it at the start.', 0],
  ['Copy bar 6 and put it between bars 2 and 3.', 'Copy bar 6 and put it after bar 2.', 2],
  ['Copy bars 3 to 5 and put them at the end.', 'Copy bars 3 to 5 and put them at the end.', 'end'],
  ['Copy bars 3 to 5 and put them at the start.', 'Copy bars 3 to 5 and put them at the start.', 0],
  ['Copy bars 3 to 5 and put them after bar 8.', 'Copy bars 3 to 5 and put them after bar 8.', 8],
  ['Copy bars 3 to 5 and put them before bar 8.', 'Copy bars 3 to 5 and put them after bar 7.', 7],
  ['Copy bar 6 at the end.', 'Copy bar 6 and put it at the end.', 'end'],                                         // `and put it` is optional (as it is for Extend)
  ['Copy bar 6, and put it at the end.', 'Copy bar 6 and put it at the end.', 'end'],
  ['copy bar 6 and PUT IT at the end', 'Copy bar 6 and put it at the end.', 'end'],
  ['Copy bar 6 and place it at the back.', 'Copy bar 6 and put it at the end.', 'end'],
  ['Copy bar 6 and put it at the beginning.', 'Copy bar 6 and put it at the start.', 0],
  ['Duplicate bar 6 and put it at the end.', 'Copy bar 6 and put it at the end.', 'end'],
  ['Copy bar 3 and bar 8 and put them after bar 5.', 'Copy bar 3 and bar 8 and put them after bar 5.', 5],
  ['Copy bars 3 to 4 and bar 9 and put them at the end.', 'Copy bars 3 to 4 and bar 9 and put them at the end.', 'end'],
];
test('B: every place word is read, written back as the ONE canonical sentence the list shows, and the op carries the gap (0 = the start, a bar, `end`)', () => {
  for (const [said, written, after] of PLACES) {
    const o = ops(said); assert.equal(o.length, 1, said); assert.equal(o[0].op, 'copy', said); assert.deepEqual((o[0] as { after?: unknown }).after, after, said);
    assert.equal(canon(said), written, said); assert.equal(canon(written), written, `${written}: the canonical sentence is its own reading`);
  }
});
test('B: `and put it` for one bar, `and put them` for more (Extend\'s rule); anything without a place is refused in the words of the place list', () => {
  assert.equal(structureWords({ op: 'copy', runs: [[6, 6]], after: 'end' }), 'copy bar 6 and put it at the end');
  assert.equal(structureWords({ op: 'copy', runs: [[3, 4]], after: 0 }), 'copy bars 3 to 4 and put them at the start');
  assert.equal(structureWords({ op: 'copy', runs: [[3, 3], [5, 5]], after: 2 }), 'copy bar 3 and bar 5 and put them after bar 2');
  assert.match(refusal('Copy bar 6 and put it.'), /^Expected a place \("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"\), but found the end of the sentence\.$/);
  assert.match(refusal('Copy bar 6 and put it between bars 2 and 4.'), /Expected two neighbouring bars after "between"/);
  assert.match(refusal('Copy bar 6 and put it after bar.'), /Expected a bar number/);
  assert.match(refusal('Copy bar 6 and put it at the end at the start.'), /./, 'two places are refused');
});
test('B: the json block round-trips (a copy with a place is `{"op": "copy", "runs": [[6,6]], "after": "end"}`), a wrong `after` is refused in words, the old json still reads', () => {
  const p: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: ops('Copy bar 6 and put it at the end. Copy bars 3 to 5 and put them after bar 2. Copy bar 1.') };
  const note = noteContentFor('phrase_007', p), back = readPhraseNote(note);
  assert.ok(back.ok, back.ok ? '' : back.message); assert.deepEqual(back.ok ? (back.value as { ops: unknown[] }).ops : null, (p as { ops: unknown[] }).ops);
  assert.equal(formatTransformOp({ op: 'copy', runs: [[6, 6]], after: 'end' }), '{"op": "copy", "runs": [[6,6]], "after": "end"}');
  assert.equal(formatTransformOp({ op: 'copy', runs: [[6, 6]], after: 0 }), '{"op": "copy", "runs": [[6,6]], "after": 0}');
  const bad = (after: unknown): string => { const r = validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'copy', runs: [[6, 6]], after }] }); return r.ok ? 'OK' : r.message; };
  assert.equal(bad('end'), 'OK'); assert.equal(bad(0), 'OK'); assert.equal(bad(3), 'OK');
  assert.match(bad(-1), /ops\[0\]\.after must be the bar the copies follow \(0 = at the start\) or "end", got -1\./); assert.match(bad('middle'), /ops\[0\]\.after must be/); assert.match(bad(1.5), /ops\[0\]\.after must be/);
  const keepAfter = validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'keep', runs: [[1, 2]], after: 'end' }] });
  assert.equal(keepAfter.ok, false, 'only a copy takes `after`'); assert.match(keepAfter.ok ? '' : keepAfter.message, /unexpected field "after" \(keep holds only op, runs\)/);
});

// ---- C: the order of the bars ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const head = (n: number): string => `Extend [[bar_005]] to ${n} bars, repeating with fills.`;
/** The bars' order after the sentences, read by the REAL grammar (the list replay) and run by the REAL structure path (`applyStructureOps`, what the phrase's Score runs on the bars the head made). */
function finalOrder(n: number, ...sentences: string[]): number[] {
  const r = replayGrammar([head(n), ...sentences], 'phrase', { vault: PHRASE_VAULT } as never);
  assert.equal(r.stop, null, `the grammar reads every sentence: ${JSON.stringify(r.stop)}`);
  const list = ((r.params as { ops?: StructureOp[] }).ops ?? []);
  assert.ok(list.every(isRunsOp), 'a copy is a step of TypeScript: the engine is never asked');
  const done = applyStructureOps(nums(n), list as never);
  assert.ok(done.ok, done.ok ? '' : done.message);
  return done.ok ? done.items : [];
}
test('C: a 12-bar phrase, `Copy bar 6 and put it at the end.` gives 13 bars and the copy is LAST (the original stays at 6)', () => {
  const o = finalOrder(12, 'Copy bar 6 and put it at the end.');
  assert.equal(o.length, 13); assert.deepEqual(o, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 6]); assert.equal(o[12], 6); assert.equal(o[5], 6);
});
test('C: every place on a 12-bar phrase: the final order IS the meaning (an independent model: the copies are INSERTED in the gap; the originals stay)', () => {
  const model = (n: number, runs: Array<[number, number]>, after: number | 'end'): number[] => {
    const all = nums(n), made = runs.flatMap(([a, b]) => all.slice(a - 1, b)), at = after === 'end' ? n : after;
    return [...all.slice(0, at), ...made, ...all.slice(at)];
  };
  let checked = 0;
  for (const n of [1, 2, 5, 12]) for (const [a, b] of [[1, 1], [n, n], [1, Math.min(n, 3)], [Math.max(1, n - 1), n]] as Array<[number, number]>) for (const where of ['at the start', 'at the end', `after bar ${Math.max(1, n - 1)}`, 'before bar 1', `before bar ${n}`, n >= 2 ? 'between bars 1 and 2' : 'at the end'] as const) {
    const say = `Copy ${a === b ? `bar ${a}` : `bars ${a} to ${b}`} and put ${a === b ? 'it' : 'them'} ${where}.`;
    const after = where === 'at the start' || where === 'before bar 1' ? 0 : where === 'at the end' ? 'end' : where.startsWith('before') ? n - 1 : where.startsWith('between') ? 1 : Math.max(1, n - 1);
    assert.deepEqual(finalOrder(n, say), model(n, [[a, b]], after), `${say} on ${n} bars`); checked++;
  }
  assert.ok(checked > 80, `${checked} cases`);
});
test('C: two steps in a row: each is of the bars as they are after the step before (a copy at the end, then a copy of the NEW last bar)', () => {
  assert.deepEqual(finalOrder(4, 'Copy bar 1 and put it at the end.', 'Copy bar 5 and put it at the start.'), [1, 1, 2, 3, 4, 1]);
  assert.deepEqual(finalOrder(3, 'Delete bar 2.', 'Copy bar 1 and put it at the end.'), [1, 3, 1]);
});
test('C: refused in words on the bars (the engine\'s refusal words): a bar past the end, a gap past the end', () => {
  const r = (n: number, text: string) => applyStructure(nums(n), ops(text)[0] as never);
  assert.deepEqual(r(4, 'Copy bar 6 and put it at the end.'), { ok: false, message: 'bar 6 asked for, but there are 4 bars.' });
  assert.deepEqual(r(4, 'Copy bar 2 and put it after bar 9.'), { ok: false, message: 'after bar 9 asked for, but there are 4 bars.' });
  assert.deepEqual(r(1, 'Copy bar 1 and put it after bar 2.'), { ok: false, message: 'after bar 2 asked for, but there is 1 bar.' });
});
test('C: which bar is the COPY: the Score\'s origin trace marks the inserted bars as copies and leaves every original where it was (a copy put BEFORE its original too)', () => {
  const t = traceSteps(4, ops('Copy bar 3 and put it at the start.'));
  assert.deepEqual(t.map((o) => o.head), [3, 1, 2, 3, 4]);
  assert.deepEqual(t.map((o) => o.via.map((v) => v.how)), [['copy'], [], [], [], []], 'the first bar is the copy, the original (bar 3 of the head, now fourth) is not');
  const e = traceSteps(4, ops('Copy bars 2 to 3 and put them at the end.'));
  assert.deepEqual(e.map((o) => o.head), [1, 2, 3, 4, 2, 3]); assert.deepEqual(e.map((o) => o.via.length), [0, 0, 0, 0, 1, 1]);
  const old = traceSteps(4, ops('Copy bar 3.')); assert.deepEqual(old.map((o) => o.via.length), [0, 0, 0, 1, 0], 'the old Copy: the copy is right after the original');
});

// ---- the Python the note carries ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('THE NOTE\'S PYTHON does what the TypeScript does for a copy put in a place (every gap, on lists of 1 to 9 bars, run by python3)', (t) => {
  if (spawnSync('python3', ['-c', 'print(1)']).status !== 0) { t.skip('python3 not found'); return; }
  const shapes: StructureOp[] = [];
  for (const after of [0, 1, 2, 'end'] as const) for (const runs of [[[1, 1]], [[2, 3]], [[1, 1], [3, 4]], [[2, 2], [4, 4], [6, 6]]] as Array<Array<[number, number]>>) shapes.push({ op: 'copy', runs, after });
  const cases: Array<{ items: number[]; op: StructureOp; want: number[] | null }> = [];
  for (let n = 1; n <= 9; n++) for (const op of shapes) { const r = applyStructure(nums(n), op as never); cases.push({ items: nums(n), op, want: r.ok ? r.items : null }); }
  const prog = ['import json, sys', 'out = []', 'for case in json.load(sys.stdin):', '  bars = list(case["items"])', '  src = case["code"]', '  try:', '    exec("def compute():\\n  global bars\\n" + src + "\\n  return bars", globals())', '    out.append(compute())', '  except Exception:', '    out.append(None)', 'print(json.dumps(out))'].join('\n');
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(cases.map((c) => ({ items: c.items, code: structurePython(c.op).join('\n') }))), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const outs = JSON.parse(r.stdout) as Array<number[] | null>; let compared = 0;
  cases.forEach((c, i) => { if (c.want === null) return; assert.deepEqual(outs[i], c.want, `${structureSentence(c.op)} on ${c.items.length} bars`); compared++; });
  assert.ok(compared > 100, `compared ${compared}`);
  assert.deepEqual(structurePython({ op: 'copy', runs: [[3, 5]] }), ['  bars = [y for i, x in enumerate(bars, 1) for y in [x] + [z for a, b in [[3,5]] if b == i for z in bars[a - 1:b]]]'], 'the old Copy\'s Python is byte for byte what it was');
});

// ---- D: the free words and the links -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const NAMES = Array.from({ length: 12 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);          // the Score of a 12-bar phrase: bar K is bar_00K
const said = (text: string, names: readonly string[] | null = NAMES): unknown => { const r = duplicateByLink(text, names); return r === null ? null : r.kind === 'copy' ? r.sentence : `${r.kind}: ${r.message}`; };
test('D: the free words, a CLOSED list: `make a copy of`, `put a copy of`, `copy ... to the end of the score`, `at the end of the score`, `after the last bar`; each is the grammar\'s sentence', () => {
  const END = 'Copy bar 6 and put it at the end.';
  for (const s of ['Make a copy of [[bar_006]] at the end of the score.', 'make a copy of [[bar_006]] at the end of score', 'Put a copy of [[bar_006]] at the end.', 'put a copy of [[bar_006]] after the last bar.', 'Copy [[bar_006]] to the end of the score.', 'copy [[bar_006]] to the end',
    'Make a copy of [[bar_006]] and put it at the end.', 'Please make a copy of [[bar_006]] at the end of the score', 'Make a copy of [[bar_006]] at the end of the phrase please.', 'Copy [[bar_006]] and put it at the end.', 'Copy [[bars/bar_006]] at the end.', 'Copy [[bar_006|the kick]] at the end.', 'make a copy of bar 6 at the end of the score', 'Put a copy of bar 6 after the last bar.', 'Make a copy of bar 6 and put it at the end.'])
    assert.equal(said(s), END, s);
  assert.equal(said('Make a copy of [[bar_006]] at the start of the score.'), 'Copy bar 6 and put it at the start.'); assert.equal(said('Make a copy of [[bar_006]] at the beginning'), 'Copy bar 6 and put it at the start.');
  assert.equal(said('Make a copy of [[bar_006]] after bar 12.'), 'Copy bar 6 and put it after bar 12.'); assert.equal(said('Make a copy of [[bar_006]] before bar 2.'), 'Copy bar 6 and put it after bar 1.');
  assert.equal(said('Make a copy of [[bar_006]] between bars 2 and 3.'), 'Copy bar 6 and put it after bar 2.');
  assert.equal(said('Make a copy of bars 3 to 5 at the end of the score.', null), 'Copy bars 3 to 5 and put them at the end.', 'bar NUMBERS need no names: the Score need not say anything');
  assert.equal(said('Make a copy of bar 6.', null), 'Copy bar 6.', '`make a copy of` with no place is the old Copy (right after the original)');
});
test('D: a LINK as the place: `after [[bar_012]]` is that bar\'s position; `before [[bar_002]]` the gap before it', () => {
  assert.equal(said('Make a copy of [[bar_006]] after [[bar_012]].'), 'Copy bar 6 and put it after bar 12.'); assert.equal(said('Copy [[bar_006]] before [[bar_002]].'), 'Copy bar 6 and put it after bar 1.'); assert.equal(said('Copy [[bar_006]] before [[bar_001]].'), 'Copy bar 6 and put it at the start.');
  const r = duplicateByLink('Make a copy of [[bar_006]] after [[bar_012]].', NAMES) as { hint: string; message: string };
  assert.equal(r.hint, 'bar_006 is bar 6 and bar_012 is bar 12 of this phrase.'); assert.equal(r.message, 'bar_006 is bar 6 and bar_012 is bar 12 of this phrase, so it would write: Copy bar 6 and put it after bar 12.');
});
test('D: the sentence the repair writes is the one the grammar READS, and the card says why', () => {
  const c = repairCandidate('Make a copy of [[bar_006]] at the end of the score.', 'phrase', NAMES);
  assert.deepEqual(c, { sentence: 'Copy bar 6 and put it at the end.', hint: 'bar_006 is bar 6 of this phrase.' });
  assert.ok(parse(`${TAKE} ${c!.sentence}`, PHRASE_VAULT).ok);
  assert.deepEqual(repairCandidate('Make a copy of bar 6 at the end of the score.', 'phrase', null), { sentence: 'Copy bar 6 and put it at the end.' }, 'no names needed for a number; no hint');
  assert.equal(repairCandidate('Make a copy of [[bar_006]] at the end of the score.', 'arrangement', NAMES), null, 'a phrase only (P3)');
  assert.equal(repairCandidate('Make a copy of [[bar_006]] at the end of the score.', 'phrase', null), null, 'a link and a Score that does not say: unknown, the sentence goes the old way');
});
test('D: a link the phrase does not hold is REFUSED in words naming it (the driver\'s `[[bar_0012]]`), whatever else the sentence says; nothing to write', () => {
  assert.equal(said('Make a copy of [[bar_006]] at the end of score (after [[bar_0012]]'), 'absent: There is no bar named bar_0012.', 'the driver\'s own sentence (the missing bracket and parenthesis do not matter: the link is named)');
  assert.equal(said('Make a copy of [[bar_006]] at the end of score (after [[bar_0012]])'), 'absent: There is no bar named bar_0012.');
  assert.equal(said('Make a copy of [[bar_999]] at the end of the score.'), 'absent: There is no bar named bar_999.');
  assert.equal(said('Copy [[bar_006]] after [[bar_999]].'), 'absent: There is no bar named bar_999.'); assert.equal(said('Copy [[bar_999]] after bar 3.'), 'absent: There is no bar named bar_999.');
  assert.equal(said('Make a copy of [[kick_pattern]] at the end.'), 'absent: There is no bar named kick_pattern.');
  assert.equal(said('Make a copy of [[phrases/phrase_006]] at the end.'), null, 'a link into another folder is not a bar: not ours');
  assert.equal(repairCandidate('Make a copy of [[bar_006]] at the end of score (after [[bar_0012]]', 'phrase', NAMES), null, 'no repair is offered for it');
});
test('D: a bar at SEVERAL positions: ask which, in words, with the sentences that answer; never guess', () => {
  const two = ['bar_005', 'bar_007', 'bar_005', 'bar_012'];
  assert.equal(said('Make a copy of [[bar_005]] at the end of the score.', two), 'which: Bar 005 is bars 1 and 3 of this phrase: which one? Say Copy bar 1. or Copy bar 3.');
  assert.equal(said('Copy [[bar_007]] after [[bar_005]].', two), 'which: Bar 005 is bars 1 and 3 of this phrase: which one? Say after bar 1 or after bar 3');
  assert.equal(said('Make a copy of [[bar_005]] at the end.', Array.from({ length: 9 }, () => 'bar_005')), 'which: Bar 005 is bars 1, 2, 3, 4, 5, 6, 7, 8 and 9 of this phrase: which one? Say Copy bar N. for the one you mean.');
});
test('D: not ours: the sentence goes the way it always went (the service handles the rest)', () => {
  for (const s of ['Copy bar 3.', 'Copy bars 3 to 5.', 'Make a copy of bar 6 at the end of the score and then delete bar 1.', 'Make a copy of the kick at the end.', 'Make two copies of bar 6 at the end.', 'Make a copy of bar 6 somewhere in the middle.', 'Make a copy of [[bar_006]] and [[bar_007]] at the end.',
    'Make a copy of bar 6 at the end of the score. Delete bar 1.', 'Make a copy of bar 6 between bars 2 and 4.', 'Make a copy of bar 6 before bar 0.', 'Move bar 6 to the end.', 'Make a copy of bars 5 to 3 at the end.'])
    assert.equal(said(s), null, s);
  assert.equal(said('Make a copy of [[bar_006]] at the end of the score.', []), null, 'no drawn bar: unknown');
});
test('D: the 1033 reading is untouched: a copy by link with NO place is `Copy bar K.` as before, and an unknown link says what it said', () => {
  assert.equal(said('please duplicate [[bar_006]]'), 'Copy bar 6.'); assert.equal(said('Copy [[bar_006]].'), 'Copy bar 6.');
  assert.equal(said('please duplicate [[bar_999]]'), 'absent: Bar 999 is not in this phrase.');
});

// ---- E: the table sent to the service ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('E: the grammar table the client sends for a phrase carries the new Copy row (a place) beside the old one; every example row is a sentence the grammar reads', () => {
  const t = grammarTable('phrase');
  assert.ok(t.includes('copy: Copy bars 3 to 5.')); assert.ok(t.includes('copy to a place: Copy bar 6 and put it at the end.'), t.join(' | '));
  assert.equal(t.indexOf('copy to a place: Copy bar 6 and put it at the end.'), t.indexOf('copy: Copy bars 3 to 5.') + 1, 'the new row is right after the old one');
  for (const f of ['arrangement', 'composition'] as const) assert.ok(!grammarTable(f).some((r) => /^copy/.test(r)), `${f}: no Copy row (P3)`);
  const row = VERBS.find((v) => v.verb === 'copy to a place')!; assert.ok(parse(`${TAKE} ${row.example}`, PHRASE_VAULT).ok, row.example);
  assert.ok(linesRequestFields({ family: 'phrase', list: [], barCount: 12 }).grammar.includes('copy to a place: Copy bar 6 and put it at the end.'));
  assert.ok(verbsOf('phrase').includes('copy'));
});
