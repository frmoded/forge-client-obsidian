// 2026-11-20-1000 (mutation triage of the Inspector through the step lines) - tests that PIN what the first mutation pass left alive in src/phrase-steps-lineage-core.ts (and, through the real tab, in src/phrase-dom.ts and src/score-inspector.ts).
// Every test below carries `// 2026-11-20-1000 mutation survivor: <file>:<line> <mutation>` for the mutants it kills (verified one by one on a scratch copy of src, ~/.forge-mem-evidence/p1000/scratch-src/). Style: exact-string goldens of every line the Inspector shows,
// boundary tables of the trace written out by hand (the bar numbers 1 and last, Move at the edges, Copy of a run, Extend replacing and inserting at the start and the end, the places of Mix and Morph), and the longhand model of test-support/phrase-steps-rig.ts as the
// independent check over every single step and every pair of steps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, annotateWithSteps, stepLineageOf, traceSteps, type StepOrigin } from './phrase-steps-lineage-core.ts';
import { listModel } from './list-model-selected.ts';
import { readPhraseNote, type PhraseParams, type StructureOp } from './phrase-core.ts';
import type { Provenance } from './provenance-core.ts';
import { drawNote, modelSteps, noteFor } from './test-support/phrase-steps-rig.ts';
import { rig } from './test-support/phrase-steps-tab-rig.ts';
import { SELECTED_BAR_CLASS } from './selection-tint-dom.ts';
import { Window } from 'happy-dom';
import { createScoreInspector } from './score-inspector.ts';
import { PHRASE_BAR_ROLE } from './phrase-lineage-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';

// ---- the ops, as the grammar reads them -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const ext = (bar: number, bars: number, after?: number | 'end'): StructureOp => ({ op: 'extend_bar', bar, bars, style: 'repeat_with_fills', tempo_change_pct: 0, ...(after === undefined ? {} : { after }) }) as StructureOp;
const mix = (a: number, b: number, after: number | 'end'): StructureOp => ({ op: 'mix_bars', a, b, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after }) as StructureOp;
const morph = (a: number, b: number, bars: number, after: number | 'end'): StructureOp => ({ op: 'morph_between', a, b, bars, order: 'musical', seed: 0, after }) as StructureOp;
const keep = (...runs: Array<[number, number]>): StructureOp => ({ op: 'keep', runs }) as StructureOp;
const del = (...runs: Array<[number, number]>): StructureOp => ({ op: 'delete', runs }) as StructureOp;
const copy = (...runs: Array<[number, number]>): StructureOp => ({ op: 'copy', runs }) as StructureOp;
const move = (by: 1 | -1, ...runs: Array<[number, number]>): StructureOp => ({ op: 'move', runs, by }) as StructureOp;

/** A trace in one line: `h3` = the head's bar 3; `s2[1+3|1+3]` = made by step 2 from the positions 1 and 3 (as they were before it), which come from head bars 1 and 3; `c2` / `m1` after it = copied by step 2 / moved by step 1. */
const show = (t: StepOrigin[]): string => t.map((o) => (o.head !== null ? `h${o.head}` : `s${o.made!.step}[${o.made!.from.join('+')}|${o.made!.heads.join('+')}]`) + o.via.map((v) => (v.how === 'copy' ? 'c' : 'm') + v.step).join('')).join(' ');
const says = (headBars: number, ...ops: StructureOp[]): string => show(traceSteps(headBars, ops));
const throwsWith = (headBars: number, ops: StructureOp[]): string => { try { traceSteps(headBars, ops); } catch (e) { return (e as Error).message; } return 'DID NOT THROW'; };

// ---- sentinel --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the core names itself behind the list-model seam: the sentinel is the exact string the lean-bundle test greps for, and the full model lists it', () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:20 empty-string#1 ('forge-list-model-core:phrase-steps-lineage-core' -> '')
  assert.equal(LIST_MODEL_SENTINEL_PHRASE_STEPS_LINEAGE_CORE, 'forge-list-model-core:phrase-steps-lineage-core');
  assert.ok(listModel.cores.includes('forge-list-model-core:phrase-steps-lineage-core'), 'the full list model lists the core');
  assert.equal(typeof listModel.steps.annotate, 'function'); assert.equal(typeof listModel.steps.lineageOf, 'function');
});

// ---- the refusals of the trace, in words ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('traceSteps refuses a step that names a bar the bars do not have, in the step\'s own words (with its number), for every kind of step', () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:39 if-false#1 (r.ok === false -> false) and empty-string#1 (`step ${step}: ${r.message}` -> '')
  assert.equal(throwsWith(3, [del([5, 5])]), 'step 1: bar 5 asked for, but there are 3 bars.');
  assert.equal(throwsWith(3, [keep([2, 4])]), 'step 1: bars 2 to 4 asked for, but there are 3 bars.');
  assert.equal(throwsWith(1, [copy([1, 2])]), 'step 1: bars 1 to 2 asked for, but there is 1 bar.');
  assert.equal(throwsWith(3, [del([1, 3])]), 'step 1: deleting bars 1 to 3 would leave no bars.');
  assert.equal(throwsWith(2, [del([1, 1]), move(-1, [1, 1])]), 'step 2: bar 1 cannot move left: bar 1 is the first bar.', 'the number of the step is the one that refused');
  assert.equal(throwsWith(3, [move(1, [3, 3])]), 'step 1: bar 3 cannot move right: the range ends at the last bar (bar 3).');
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:54 if-false#1, empty-string#1..#3, eq-flip#2 (n === 1 -> !==), number+1#1 (1 -> 2)
  assert.equal(throwsWith(3, [ext(4, 2)]), 'step 1: bar 4 asked for, but there are 3 bars.');
  assert.equal(throwsWith(2, [ext(3, 2)]), 'step 1: bar 3 asked for, but there are 2 bars.', 'two bars is "are 2 bars", not "is 1 bar"');
  assert.equal(throwsWith(1, [ext(2, 2)]), 'step 1: bar 2 asked for, but there is 1 bar.');
  assert.equal(throwsWith(1, [mix(1, 3, 'end')]), 'step 1: bar 3 asked for, but there is 1 bar.', 'the second bar is the one missing');
  assert.equal(throwsWith(4, [mix(5, 1, 'end')]), 'step 1: bar 5 asked for, but there are 4 bars.', 'the first bar is the one missing');
  assert.equal(throwsWith(3, [morph(1, 4, 3, 0)]), 'step 1: bar 4 asked for, but there are 3 bars.');
  assert.equal(throwsWith(5, [del([1, 2]), ext(4, 1)]), 'step 2: bar 4 asked for, but there are 3 bars.', 'the bars that are left count, not the head\'s');
  // the edge is allowed: a bar that IS the last bar is there
  assert.equal(says(3, ext(3, 1)), 'h1 h2 s1[3|3]');
  assert.equal(says(1, mix(1, 1, 'end')), 'h1 s1[1+1|1]', 'the same bar twice is one head bar');
});

// ---- the trace, by hand: boundary tables ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('Extend with no place REPLACES its bar: the first, a middle, the last bar of the bars, and with one bar or as many as it asks', () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:57 number+1#1 (cur.slice(0, op.bar - 1) -> cur.slice(1, ...)): a replaced bar after the first lost the bars before it
  assert.equal(says(4, ext(1, 2)), 's1[1|1] s1[1|1] h2 h3 h4');
  assert.equal(says(4, ext(2, 2)), 'h1 s1[2|2] s1[2|2] h3 h4');
  assert.equal(says(4, ext(3, 3)), 'h1 h2 s1[3|3] s1[3|3] s1[3|3] h4');
  assert.equal(says(4, ext(4, 2)), 'h1 h2 h3 s1[4|4] s1[4|4]');
  assert.equal(says(4, ext(2, 1)), 'h1 s1[2|2] h3 h4', 'to ONE bar: the bar is replaced by one made bar');
  assert.equal(says(1, ext(1, 3)), 's1[1|1] s1[1|1] s1[1|1]');
  assert.equal(says(2, ext(2, 2)), 'h1 s1[2|2] s1[2|2]');
});

test('Extend with a place INSERTS its bars in that gap (the start, between bars, the end, the number of the last bar and "the end" alike); the source bar stays', () => {
  assert.equal(says(4, ext(2, 2, 0)), 's1[2|2] s1[2|2] h1 h2 h3 h4');
  assert.equal(says(4, ext(2, 2, 1)), 'h1 s1[2|2] s1[2|2] h2 h3 h4');
  assert.equal(says(4, ext(2, 2, 2)), 'h1 h2 s1[2|2] s1[2|2] h3 h4');
  assert.equal(says(4, ext(2, 2, 3)), 'h1 h2 h3 s1[2|2] s1[2|2] h4');
  assert.equal(says(4, ext(2, 2, 4)), 'h1 h2 h3 h4 s1[2|2] s1[2|2]');
  assert.equal(says(4, ext(2, 2, 'end')), 'h1 h2 h3 h4 s1[2|2] s1[2|2]');
  assert.equal(says(4, ext(4, 1, 0)), 's1[4|4] h1 h2 h3 h4');
  assert.equal(says(1, ext(1, 2, 'end')), 'h1 s1[1|1] s1[1|1]');
});

test('Mix puts its ONE bar in the gap it is asked for (the start, between, the end); its sources are named in the order they were said, its head bars in ascending order', () => {
  assert.equal(says(4, mix(1, 3, 0)), 's1[1+3|1+3] h1 h2 h3 h4');
  assert.equal(says(4, mix(1, 3, 1)), 'h1 s1[1+3|1+3] h2 h3 h4');
  assert.equal(says(4, mix(1, 3, 2)), 'h1 h2 s1[1+3|1+3] h3 h4');
  assert.equal(says(4, mix(1, 3, 3)), 'h1 h2 h3 s1[1+3|1+3] h4');
  assert.equal(says(4, mix(1, 3, 4)), 'h1 h2 h3 h4 s1[1+3|1+3]');
  assert.equal(says(4, mix(3, 1, 'end')), 'h1 h2 h3 h4 s1[3+1|1+3]');
  assert.equal(says(4, mix(4, 2, 'end')), 'h1 h2 h3 h4 s1[4+2|2+4]');
});

test('Morph-between puts its N new bars in the gap it is asked for', () => {
  assert.equal(says(4, morph(2, 4, 3, 0)), 's1[2+4|2+4] s1[2+4|2+4] s1[2+4|2+4] h1 h2 h3 h4');
  assert.equal(says(4, morph(2, 4, 3, 1)), 'h1 s1[2+4|2+4] s1[2+4|2+4] s1[2+4|2+4] h2 h3 h4');
  assert.equal(says(4, morph(2, 4, 3, 3)), 'h1 h2 h3 s1[2+4|2+4] s1[2+4|2+4] s1[2+4|2+4] h4');
  assert.equal(says(4, morph(2, 4, 3, 'end')), 'h1 h2 h3 h4 s1[2+4|2+4] s1[2+4|2+4] s1[2+4|2+4]');
  assert.equal(says(4, morph(2, 4, 3, 4)), 'h1 h2 h3 h4 s1[2+4|2+4] s1[2+4|2+4] s1[2+4|2+4]');
  assert.equal(says(4, morph(1, 2, 1, 'end')), 'h1 h2 h3 h4 s1[1+2|1+2]');
});

test('Move swaps each run with the ONE bar next to it, and BOTH are moved: at the edges, a run, several runs, twice', () => {
  assert.equal(says(4, move(1, [1, 1])), 'h2m1 h1m1 h3 h4');
  assert.equal(says(4, move(-1, [4, 4])), 'h1 h2 h4m1 h3m1');
  assert.equal(says(4, move(-1, [2, 2])), 'h2m1 h1m1 h3 h4');
  assert.equal(says(4, move(1, [3, 3])), 'h1 h2 h4m1 h3m1');
  assert.equal(says(4, move(-1, [2, 3])), 'h2m1 h3m1 h1m1 h4');
  assert.equal(says(4, move(1, [1, 2])), 'h3m1 h1m1 h2m1 h4');
  assert.equal(says(4, move(1, [2, 3])), 'h1 h4m1 h2m1 h3m1');
  assert.equal(says(4, move(-1, [3, 4])), 'h1 h3m1 h4m1 h2m1');
  assert.equal(says(4, move(1, [1, 1], [3, 3])), 'h2m1 h1m1 h4m1 h3m1');
  assert.equal(says(4, move(-1, [2, 2], [4, 4])), 'h2m1 h1m1 h4m1 h3m1');
  assert.equal(says(2, move(1, [1, 1])), 'h2m1 h1m1');
  assert.equal(says(4, move(1, [1, 1]), move(1, [2, 2])), 'h2m1 h3m2 h1m1m2 h4', 'a bar moved twice says both steps, in the order they ran');
  assert.equal(says(3, move(1, [1, 1]), move(1, [1, 1])), 'h1m1m2 h2m1m2 h3', 'moved there and back: both steps are kept');
});

test('Copy of a run: the copies follow the run, the original comes first and says nothing; a copy of a copy, a copy of a made bar', () => {
  assert.equal(says(1, copy([1, 1])), 'h1 h1c1');
  assert.equal(says(4, copy([2, 3])), 'h1 h2 h3 h2c1 h3c1 h4');
  assert.equal(says(4, copy([1, 1], [3, 4])), 'h1 h1c1 h2 h3 h4 h3c1 h4c1');
  assert.equal(says(4, copy([1, 4])), 'h1 h2 h3 h4 h1c1 h2c1 h3c1 h4c1');
  assert.equal(says(3, copy([1, 1]), copy([1, 2])), 'h1 h1c1 h1c2 h1c1c2 h2 h3', 'a copy of a copy says both steps');
  assert.equal(says(4, ext(1, 2), copy([1, 1])), 's1[1|1] s1[1|1]c2 s1[1|1] h2 h3 h4', 'the copy of a made bar is a made bar, copied by step 2');
});

test('the steps after a step: Delete, Copy, Move and Extend work on the bars as they are NOW (the sources of a made bar are positions before its step)', () => {
  assert.equal(says(4, del([1, 1]), mix(1, 2, 0)), 's2[1+2|2+3] h2 h3 h4');
  assert.equal(says(4, copy([1, 2]), mix(3, 1, 'end')), 'h1 h2 h1c1 h2c1 h3 h4 s2[3+1|1]');
  assert.equal(says(4, move(1, [1, 1]), ext(1, 1, 'end')), 'h2m1 h1m1 h3 h4 s2[1|2]', 'bar 1 is the head\'s bar 2 once step 1 has moved it');
  assert.equal(says(4, keep([2, 4]), ext(1, 2, 'end')), 'h2 h3 h4 s2[1|2] s2[1|2]');
  assert.equal(says(4, ext(2, 2), mix(2, 4, 'end')), 'h1 s1[2|2] s1[2|2] h3 h4 s2[2+4|2+3]', 'a mix of a made bar and a head bar comes from both bars\' heads');
  assert.equal(says(4, morph(1, 2, 2, 'end'), del([1, 4])), 's1[1+2|1+2] s1[1+2|1+2]');
  assert.equal(says(3, morph(1, 3, 3, 1), ext(2, 1, 'end')), 'h1 s1[1+3|1+3] s1[1+3|1+3] s1[1+3|1+3] h2 h3 s2[2|1+3]', 'the head bars of a bar a step made are the head bars of its sources');
});

test('every single step of every kind, and every pair of steps, over head sizes 1 to 5, is traced as the INDEPENDENT longhand model says (a made bar, a carried bar, the copies and the moves)', () => {
  const heads = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
  const singles = (n: number): StructureOp[] => {
    const out: StructureOp[] = [];
    for (const a of heads(n)) for (const b of heads(n)) if (a <= b) { out.push(keep([a, b]), del([a, b]), copy([a, b]), move(1, [a, b]), move(-1, [a, b])); }
    if (n > 1) out.push(copy([1, 1], [n, n]), keep([n, n], [1, 1]));
    const gaps: Array<number | 'end'> = [...Array.from({ length: n + 1 }, (_, i) => i), 'end'];
    for (const a of heads(n)) {
      for (const bars of [1, 2, 3]) { out.push(ext(a, bars)); for (const g of gaps) out.push(ext(a, bars, g)); }
      for (const b of heads(n)) for (const g of gaps) { out.push(mix(a, b, g)); out.push(morph(a, b, 3, g)); }
    }
    return out;
  };
  const seed = (n: number): StructureOp[] => [copy([1, Math.max(1, n - 1)]), move(1, [1, 1]), ext(1, 2), ext(n, 2, 0), mix(1, n, 'end'), morph(1, n, 3, 1), del([1, 1]), keep([1, n])];
  const same = (n: number, ops: StructureOp[]): boolean => {
    let got: StepOrigin[];
    try { got = traceSteps(n, ops); } catch { return false; }
    const flat = got.map((t) => ({ head: t.head, made: t.made, copies: t.via.filter((v) => v.how === 'copy').map((v) => v.step), moves: t.via.filter((v) => v.how === 'move').map((v) => v.step) }));
    assert.deepEqual(flat, modelSteps(n, ops), `${n} bars: ${JSON.stringify(ops)}`);
    return true;
  };
  let ones = 0, pairs = 0;
  for (let n = 1; n <= 5; n++) {
    for (const op of singles(n)) if (same(n, [op])) ones++;
    for (const first of seed(n)) for (const second of singles(n)) if (same(n, [first, second])) pairs++;
  }
  assert.ok(ones >= 1000, `${ones} single steps compared with the model`);
  assert.ok(pairs >= 5000, `${pairs} pairs of steps compared with the model`);
});

// ---- annotateWithSteps: not this core's -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a payload the core cannot tie answers null (the old builders\' business): no steps, no head count, a head count that is not a whole number of at least 1; and a Score of the wrong size is refused in words', async () => {
  const list = ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 2.'];
  const note = noteFor(list);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const out = await drawNote(note) as { payload: Record<string, unknown> };
  const withInfo = (info: unknown) => annotateWithSteps('phrases/phrase_020', params, { ...out.payload, forge_steps: info });
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:128 logic#1, logic#2 (|| -> &&), and the boundary of `info.head < 1`
  for (const bad of [undefined, null, {}, { head: '6' }, { head: 0 }, { head: -3 }, { head: 2.5 }, { head: NaN }, { head: Infinity }, { head: null }]) assert.equal(withInfo(bad), null, `forge_steps ${JSON.stringify(bad)}`);
  assert.ok(withInfo({ head: 6 }) !== null, 'the head count the engine gave is tied');
  const one = noteFor(['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.']);
  const oneParams = (readPhraseNote(one) as { ok: true; value: PhraseParams }).value;
  const oneOut = await drawNote(one) as { payload: Record<string, unknown> };
  assert.deepEqual(oneOut.payload.forge_steps, { head: 1 });
  assert.ok(annotateWithSteps('phrases/phrase_020', oneParams, oneOut.payload) !== null, 'a head of ONE bar (the least a head has) is tied');
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:126 if-false#1 (ops.length === 0 -> false): no structure step is the old builders' even when the payload carries a head count
  const bare = (readPhraseNote(noteFor(['Extend [[bar_005]] to 6 bars, repeating with fills.'])) as { ok: true; value: PhraseParams }).value;
  assert.equal(annotateWithSteps('phrases/phrase_020', bare, { ...out.payload, forge_steps: { head: 6 } }), null, 'no step line: not this core\'s, whatever the payload carries');
  const takeThin = (readPhraseNote(noteFor(['Take [[phrase_014]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.'])) as { ok: true; value: PhraseParams }).value;
  assert.equal(annotateWithSteps('phrases/phrase_020', takeThin, { ...out.payload, forge_steps: { head: 4 } }), null, 'a take with only density steps: every bar is still the take\'s');
  // a payload with no MusicXML at all
  const { multi_staff_content: _a, content: _b, ...noXml } = out.payload;
  const none = annotateWithSteps('phrases/phrase_020', params, noXml)!;
  assert.deepEqual([none.map, none.problems, none.kitProblems], [{}, ['the Score payload carries no MusicXML'], []]);
});

test('annotateWithSteps ties the MusicXML it finds: the multi-staff Score first, else `content`; the Kit view only when there is one; a step the head cannot take is a problem in words (and a log line), never a throw', async () => {
  const note = noteFor([HEAD6, 'Delete bar 2.']);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const out = await drawNote(note) as { payload: Record<string, unknown> };
  const P = out.payload;
  const ids = (xml: unknown): string[] => [...String(xml).matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  const FIVE = ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4', 'ph_bar_5'];
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:130 eq-flip#2, empty-string#3, empty-string#4 ('string' / 'content' as the keys), :137 if-true#1 (a Kit view that is not there)
  const all = annotateWithSteps('phrases/phrase_020', params, P)!;
  assert.deepEqual(ids(all.payload.multi_staff_content), FIVE); assert.deepEqual(ids(all.payload.kit_content), FIVE);
  assert.equal(all.payload.content, P.content, 'the plain `content` is left as the engine gave it when the multi-staff Score is there');
  assert.deepEqual(all.kitProblems, []);
  const { multi_staff_content: _m, ...noMulti } = P;
  const viaContent = annotateWithSteps('phrases/phrase_020', params, noMulti)!;
  assert.deepEqual([viaContent.problems, ids(viaContent.payload.content), 'multi_staff_content' in viaContent.payload], [[], FIVE, false], 'no multi-staff Score: `content` is the one tied');
  const odd = annotateWithSteps('phrases/phrase_020', params, { ...P, multi_staff_content: 42 })!;
  assert.deepEqual([odd.problems, ids(odd.payload.content), odd.payload.multi_staff_content], [[], FIVE, 42], 'a multi-staff Score that is no text is not the Score');
  const { content: _c, ...noContent } = P;
  assert.deepEqual(ids(annotateWithSteps('phrases/phrase_020', params, { ...noContent })!.payload.multi_staff_content), FIVE);
  const noKit = { ...P }; delete noKit.kit_content;
  const noKitRes = annotateWithSteps('phrases/phrase_020', params, noKit)!;
  assert.deepEqual([noKitRes.problems, 'kit_content' in noKitRes.payload], [[], false], 'no Kit view: none is added');
  const nullKit = annotateWithSteps('phrases/phrase_020', params, { ...P, kit_content: null })!;
  assert.deepEqual([nullKit.problems, nullKit.payload.kit_content], [[], null], 'a Kit view that is no text is left alone');
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:131 if-false#1, early-return#1, empty-string#1 (no MusicXML at all)
  const bare = annotateWithSteps('phrases/phrase_020', params, { forge_steps: P.forge_steps, content: 7 })!;
  assert.deepEqual([bare.map, bare.problems, bare.kitProblems], [{}, ['the Score payload carries no MusicXML'], []]);
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:140 drop-statement#1, empty-string#1, :141 early-return#1, empty-string#1 (the catch)
  const dels = (readPhraseNote(noteFor([HEAD6, 'Delete bar 2.'])) as { ok: true; value: PhraseParams }).value;
  const logged: unknown[][] = []; const err = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  let refused: ReturnType<typeof annotateWithSteps>;
  try { refused = annotateWithSteps('phrases/phrase_020', dels, { ...P, forge_steps: { head: 1 } }); } finally { console.error = err; }
  assert.deepEqual([refused!.map, refused!.problems, refused!.kitProblems], [{}, ['the bars could not be tied through the steps (step 1: bar 2 asked for, but there is 1 bar.)'], []]);
  assert.equal(refused!.payload.multi_staff_content, P.multi_staff_content, 'the payload comes back as it was');
  assert.equal(logged.length, 1); assert.equal(logged[0][0], 'annotateWithSteps failed'); assert.match(String((logged[0][1] as Error).message), /^step 1: bar 2 asked for/);
});

// ---- the words of the stack, bar by bar ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const MADE_EXTEND = 'made by phrase_020 (extend, no tempo change, style repeat_with_fills)';
async function linesOf(list: string[]): Promise<{ lines: string[][]; actions: string[][]; n: number }> {
  const note = noteFor(list);
  const out = await drawNote(note);
  assert.ok('payload' in out, `${list.join(' | ')}: ${'refusal' in out ? out.refusal : ''}`);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const res = annotateWithSteps('phrases/phrase_020', params, out.payload)!;
  assert.deepEqual(res.problems, [], list.join(' | '));
  const ids = Object.keys(res.map);
  assert.deepEqual(ids, ids.map((_, i) => `ph_bar_${i + 1}`));
  const entries = ids.map((id) => stepLineageOf(res.map[id]));
  return { lines: entries.map((es) => es.filter((l) => l.kind !== 'action').map((l) => l.text)), actions: entries.map((es) => es.filter((l) => l.kind === 'action').map((l) => `${l.action!.id} ${l.action!.barNumber}`)), n: ids.length };
}

test('GOLDEN: an Extend head with Copy, Mix and a fork: every line of every bar, word for word', async () => {
  const { lines, actions } = await linesOf(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Copy bars 2 to 3.', 'Mix bars 5 and 1.', 'Bar 2 is replaced by [[bar_009]].']);
  assert.deepEqual(lines, [
    ['bar 1 of 7', MADE_EXTEND, 'from bar_005', 'tempo 100'],
    ['bar 2 of 7', 'forked: edited in bar_009 (was made by phrase_020, extend, no tempo change, style repeat_with_fills)', "tempo 100 (the fork's own)"],
    ['bar 3 of 7', MADE_EXTEND, 'from bar_005', 'tempo 102'],
    ['bar 4 of 7', MADE_EXTEND, 'from bar_005', 'was bar 2 before the steps', 'copied by step 1: Copy bars 2 to 3.', 'tempo 101'],
    ['bar 5 of 7', MADE_EXTEND, 'from bar_005', 'was bar 3 before the steps', 'copied by step 1: Copy bars 2 to 3.', 'tempo 102'],
    ['bar 6 of 7', 'made by step 2: Mix bars 5 and 1, 50 percent bar 5, as a vote, and put it after bar 5.', 'from bars 5 and 1 as they were before step 2', 'from bar_005', 'tempo 300'],
    ['bar 7 of 7', MADE_EXTEND, 'from bar_005', 'was bar 4 before the steps', 'tempo 103'],
  ]);
  assert.deepEqual(actions, [['fork 1'], ['revert 2'], ['fork 3'], ['fork 4'], [], [], []], 'a bar past the head\'s own four is not offered "Edit this bar"; a made bar neither');
});

test('GOLDEN: an Extend step REPLACING one bar says "from bar 2 as it was" (one source, singular), the bars after it are numbered by their place', async () => {
  const { lines, actions } = await linesOf(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Extend bar 2 to 2 bars.']);
  const made = ['made by step 1: Extend bar 2 to 2 bars, repeating with fills.', 'from bar 2 as it was before step 1', 'from bar_005'];
  assert.deepEqual(lines, [
    ['bar 1 of 5', MADE_EXTEND, 'from bar_005', 'tempo 100'],
    ['bar 2 of 5', ...made, 'tempo 700'],
    ['bar 3 of 5', ...made, 'tempo 701'],
    ['bar 4 of 5', MADE_EXTEND, 'from bar_005', 'was bar 3 before the steps', 'tempo 102'],
    ['bar 5 of 5', MADE_EXTEND, 'from bar_005', 'was bar 4 before the steps', 'tempo 103'],
  ]);
  assert.deepEqual(actions, [['fork 1'], ['fork 2'], ['fork 3'], ['fork 4'], []], 'a bar a step made is offered "Edit this bar" while its number is within the head\'s own count');
});

test('GOLDEN: a Mix head of ONE bar, copied: the words of a mix as a vote and as a path, the heavier bar first, the carried and the copied bar', async () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:79 if-true#1 (p.kind === 'morph' -> true), :80 early-return#1, empty-string#1..#4, eq-flip#1 (p.mode === 'path')
  const vote = (a: string, b: string, madeBy: string): string[][] => [
    ['bar 1 of 2', `made by phrase_020 (${madeBy})`, `from ${a}`, `from ${b}`, 'tempo 300'],
    ['bar 2 of 2', `made by phrase_020 (${madeBy})`, `from ${a}`, `from ${b}`, 'was bar 1 before the steps', 'copied by step 1: Copy bar 1.', 'tempo 300'],
  ];
  assert.deepEqual((await linesOf(['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.'])).lines, vote('bar_005', 'bar_006', 'mix of bar_005 and bar_006, as a vote'));
  assert.deepEqual((await linesOf(['Mix [[bar_005]] and [[bar_006]], as a path.', 'Copy bar 1.'])).lines, vote('bar_005', 'bar_006', 'mix of bar_005 and bar_006, as a path'));
  assert.deepEqual((await linesOf(['Mix [[bar_005]] and [[bar_006]], 60 percent [[bar_005]], as a vote.', 'Copy bar 1.'])).lines, vote('bar_005', 'bar_006', 'mix of bar_005 and bar_006, as a vote'));
  assert.deepEqual((await linesOf(['Mix [[bar_005]] and [[bar_006]], 30 percent [[bar_005]], as a vote.', 'Copy bar 1.'])).lines, vote('bar_006', 'bar_005', 'mix of bar_005 and bar_006, as a vote'), 'the heavier bar comes first');
  assert.deepEqual((await linesOf(['Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.', 'Copy bar 1.'])).lines, vote('bar_005', 'bar_006', 'mix of bar_005 and bar_006, as a vote'), 'at exactly half, bar a first');
  assert.equal((await linesOf(['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.'])).actions.flat().length, 0, 'a mix\'s bars are never offered "Edit this bar"');
});

test('GOLDEN: a Morph head over an EVEN number of bars: the bars up to the middle come from a, the rest from b; Move says what it did to the two bars it swapped', async () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:71 number+1#1 ((p.bars + 1) / 2 -> (p.bars + 2) / 2): over an even count the middle falls between two bars
  const MORPH = 'made by phrase_020 (morph bar_005 -> bar_006, musical order)';
  const six = await linesOf(['Morph [[bar_005]] into [[bar_006]] over 6 bars, in musical order.', 'Move bar 2 one bar right.']);
  assert.deepEqual(six.lines, [
    ['bar 1 of 6', MORPH, 'from bar_005', 'tempo 100'],
    ['bar 2 of 6', MORPH, 'from bar_005', 'was bar 3 before the steps', 'moved by step 1: Move bar 2 one bar right.', 'tempo 502'],
    ['bar 3 of 6', MORPH, 'from bar_005', 'was bar 2 before the steps', 'moved by step 1: Move bar 2 one bar right.', 'tempo 501'],
    ['bar 4 of 6', MORPH, 'from bar_006', 'tempo 503'],
    ['bar 5 of 6', MORPH, 'from bar_006', 'tempo 504'],
    ['bar 6 of 6', MORPH, 'from bar_006', 'tempo 100'],
  ]);
  assert.deepEqual(six.actions, [['fork 1'], ['fork 2'], ['fork 3'], ['fork 4'], ['fork 5'], ['fork 6']]);
  const four = await linesOf(['Morph [[bar_005]] into [[bar_006]] over 4 bars, in musical order.', 'Keep bars 1 to 4.']);
  assert.deepEqual(four.lines.map((l) => l[2]), ['from bar_005', 'from bar_005', 'from bar_006', 'from bar_006']);
  const five = await linesOf(['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', 'Keep bars 1 to 5.']);
  assert.deepEqual(five.lines.map((l) => l[2]), ['from bar_005', 'from bar_005', 'from bar_005', 'from bar_006', 'from bar_006'], 'over an odd count the middle bar belongs to a');
  // a made bar of a morph head comes from the notes of the head bars its sources are
  const made = await linesOf(['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', 'Mix bars 1 and 5.']);
  assert.deepEqual(made.lines[5], ['bar 6 of 6', 'made by step 1: Mix bars 1 and 5, 50 percent bar 1, as a vote, and put it after bar 5.', 'from bars 1 and 5 as they were before step 1', 'from bar_005', 'from bar_006', 'tempo 300']);
});

test('GOLDEN: a Take head: Delete, then a Thin out (a density step keeps every bar and is not a structure step: the transform\'s steps that renumber are the ones traced)', async () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:65 empty-string#1 ('transform' -> ''): the Take's density steps are not structure steps
  const TAKE = 'made by phrase_020 (a transform of phrase_014)';
  const { lines, actions } = await linesOf(['Take [[phrase_014]].', 'Delete bar 2.', 'Thin out bars 1 to 2, by half, keeping the downbeat.']);
  assert.deepEqual(lines, [
    ['bar 1 of 3', TAKE, 'from phrase_014', 'tempo 100'],
    ['bar 2 of 3', TAKE, 'from phrase_014', 'was bar 3 before the steps', 'tempo 102'],
    ['bar 3 of 3', TAKE, 'from phrase_014', 'was bar 4 before the steps', 'tempo 103'],
  ]);
  assert.deepEqual(actions, [[], [], []], 'a take\'s bars are not forked');
  const note = noteFor(['Take [[phrase_014]].', 'Delete bar 2.', 'Thin out bars 1 to 2, by half, keeping the downbeat.']);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const out = await drawNote(note) as { payload: Record<string, unknown> };
  const res = annotateWithSteps('phrases/phrase_020', params, out.payload)!;
  assert.equal(res.map.ph_bar_1.params.transform, true);
  assert.equal(res.map.ph_bar_1.params.source, 'phrases/phrase_014', 'a take\'s source is its phrase\'s id; the others\' is a bar\'s name');
});

test('GOLDEN: Morph-between and Move on an Extend head say "from bars 1 and 2 as they were before step 1"; a bar moved back to where it was says no "was bar", only the steps', async () => {
  const made = await linesOf(['Extend [[bar_005]] to 3 bars, repeating with fills.', 'Morph bars 1 and 2 across 2 bars.']);
  const sentence = 'made by step 1: Morph bars 1 and 2 across 2 bars, in musical order, and put them between bars 1 and 2.';
  assert.equal(made.lines[2][1], sentence);
  assert.deepEqual(made.lines[2], ['bar 3 of 5', sentence, 'from bars 1 and 2 as they were before step 1', 'from bar_005', 'tempo 502']);
  const back = await linesOf(['Extend [[bar_005]] to 3 bars, repeating with fills.', 'Move bar 1 one bar right.', 'Move bar 1 one bar right.']);
  // 2026-11-20-1000 mutation survivor: src/phrase-steps-lineage-core.ts:171 (s.head !== p.bar): head 1 at place 1 after two moves says the moves and not "was bar 1"
  assert.deepEqual(back.lines, [
    ['bar 1 of 3', MADE_EXTEND, 'from bar_005', 'moved by step 1: Move bar 1 one bar right.', 'moved by step 2: Move bar 1 one bar right.', 'tempo 100'],
    ['bar 2 of 3', MADE_EXTEND, 'from bar_005', 'moved by step 1: Move bar 1 one bar right.', 'moved by step 2: Move bar 1 one bar right.', 'tempo 101'],
    ['bar 3 of 3', MADE_EXTEND, 'from bar_005', 'tempo 102'],
  ]);
});

// ---- stepLineageOf on hand-made provenances ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const prov = (params: Record<string, unknown>): Provenance => ({ noteId: 'phrases/phrase_020', role: 'phrase-bar', params } as unknown as Provenance);
const stepBar = (over: Record<string, unknown> = {}) => ({ head: 2, via: [], made: null, notes: ['bars/bar_005'], madeBy: 'extend, no tempo change, style repeat_with_fills', canFork: false, canRevert: false, ...over });

test('stepLineageOf on a provenance made by hand: the tempo line only for a tempo; a fork says its own note, tempo and revert; the actions and what they carry', () => {
  const texts = (p: Record<string, unknown>) => stepLineageOf(prov(p)).map((l) => `${l.kind}: ${l.text}`);
  assert.deepEqual(texts({ bar: 2, bars: 5, tempo: 120, steps: stepBar() }), ['bar: bar 2 of 5', 'note: made by phrase_020 (extend, no tempo change, style repeat_with_fills)', 'note: from bar_005', 'tempo: tempo 120']);
  assert.deepEqual(texts({ bar: 2, bars: 5, tempo: null, steps: stepBar() }), ['bar: bar 2 of 5', 'note: made by phrase_020 (extend, no tempo change, style repeat_with_fills)', 'note: from bar_005'], 'no tempo, no tempo line');
  assert.deepEqual(texts({ bar: 2, bars: 5, tempo: 0, steps: stepBar() }).slice(-1), ['tempo: tempo 0'], 'a tempo of 0 is a number');
  const forkedLines = stepLineageOf(prov({ bar: 3, bars: 5, tempo: 90, fork: 'bars/bar_009', steps: stepBar({ canRevert: true, canFork: true }) }));
  assert.deepEqual(forkedLines.map((l) => `${l.kind}: ${l.text}`), ['bar: bar 3 of 5', 'note: forked: edited in bar_009 (was made by phrase_020, extend, no tempo change, style repeat_with_fills)', "tempo: tempo 90 (the fork's own)", 'action: Revert to generated']);
  assert.deepEqual([forkedLines[1].noteId, forkedLines[1].openLabel, forkedLines[3].action], ['bars/bar_009', 'Open bar_009', { id: 'revert', barNumber: 3 }]);
  assert.deepEqual(texts({ bar: 3, bars: 5, tempo: null, fork: 'bars/bar_009', steps: stepBar({ canRevert: false }) }), ['bar: bar 3 of 5', 'note: forked: edited in bar_009 (was made by phrase_020, extend, no tempo change, style repeat_with_fills)'], 'a fork of a mix or a take cannot be reverted from here');
  const plain = stepLineageOf(prov({ bar: 4, bars: 5, tempo: 100, steps: stepBar({ canFork: true, head: 4 }) }));
  assert.deepEqual(plain.map((l) => `${l.kind}: ${l.text}`), ['bar: bar 4 of 5', 'note: made by phrase_020 (extend, no tempo change, style repeat_with_fills)', 'note: from bar_005', 'tempo: tempo 100', 'action: Edit this bar']);
  assert.deepEqual(plain[plain.length - 1].action, { id: 'fork', barNumber: 4 });
  assert.deepEqual(plain.filter((l) => l.kind === 'note').map((l) => [l.noteId, l.openLabel, l.covers]), [['phrases/phrase_020', 'Open phrase_020', 'all'], ['bars/bar_005', 'Open bar_005', 'all']]);
  assert.deepEqual(plain.filter((l) => l.kind !== 'note').map((l) => l.covers), ['self', 'self', undefined], 'the bar and tempo lines cover themselves, the action covers nothing');
  // a bar that is not the head's: a step made it, with the number of the step and one and then two sources
  const made = (from: number[]) => texts({ bar: 6, bars: 7, tempo: 300, steps: stepBar({ head: null, made: { step: 2, sentence: 'Mix bars 5 and 1.', from }, notes: ['bars/bar_005', 'bars/bar_006'] }) });
  assert.deepEqual(made([5, 1]), ['bar: bar 6 of 7', 'step: made by step 2: Mix bars 5 and 1.', 'step: from bars 5 and 1 as they were before step 2', 'note: from bar_005', 'note: from bar_006', 'tempo: tempo 300']);
  assert.deepEqual(made([4]).slice(1, 3), ['step: made by step 2: Mix bars 5 and 1.', 'step: from bar 4 as it was before step 2']);
  assert.deepEqual(made([1, 2, 3]).slice(2, 3), ['step: from bars 1, 2 and 3 as they were before step 2']);
  const madeLines = stepLineageOf(prov({ bar: 6, bars: 7, tempo: 300, steps: stepBar({ head: null, made: { step: 2, sentence: 'Mix bars 5 and 1.', from: [5, 1] }, notes: ['bars/bar_005', 'bars/bar_006'] }) }));
  assert.deepEqual(madeLines.map((l) => `${l.kind}/${l.covers}`), ['bar/self', 'step/self', 'step/self', 'note/all', 'note/all', 'tempo/self'], 'what a step made covers itself; the notes it comes from cover all');
  assert.deepEqual(madeLines.filter((l) => l.kind === 'note').map((l) => [l.noteId, l.openLabel]), [['bars/bar_005', 'Open bar_005'], ['bars/bar_006', 'Open bar_006']]);
  // the first line of a bar of a score of one
  assert.equal(stepLineageOf(prov({ bar: 1, bars: 1, tempo: 80, steps: stepBar({ head: 1 }) }))[0].text, 'bar 1 of 1');
  // a head bar that moved to another place says so, the copies and moves in the order given
  const via = [{ step: 1, how: 'copy', sentence: 'Copy bar 1.' }, { step: 3, how: 'move', sentence: 'Move bar 2 one bar left.' }];
  assert.deepEqual(texts({ bar: 2, bars: 5, tempo: 100, steps: stepBar({ head: 1, via }) }).slice(3), ['step: was bar 1 before the steps', 'step: copied by step 1: Copy bar 1.', 'step: moved by step 3: Move bar 2 one bar left.', 'tempo: tempo 100']);
  assert.deepEqual(stepLineageOf(prov({ bar: 2, bars: 5, tempo: 100, steps: stepBar({ head: 1, via }) })).map((l) => `${l.kind}/${l.covers}`).slice(3), ['step/self', 'step/self', 'step/self', 'tempo/self'], 'the steps say what happened to this bar only');
  assert.deepEqual(texts({ bar: 2, bars: 5, tempo: 100, steps: stepBar({ head: 2, via }) }).slice(3), ['step: copied by step 1: Copy bar 1.', 'step: moved by step 3: Move bar 2 one bar left.', 'tempo: tempo 100'], 'a bar still at its head place does not say "was bar"');
});

// ---- the real tab ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const HEAD6 = 'Extend [[bar_005]] to 6 bars, repeating with fills.';

test('the real tab: a selection of bars is let go when ONE step line changes which bars are which (same number of bars, other step), and kept when the steps are what they were', async () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-dom.ts:615 if-false#1, boundary#1 (> -> >=), number+1#1 (0 -> 1), early-return#1: the key of a phrase with steps is its kind AND its steps
  const r = await rig([HEAD6, 'Delete bar 2.']);
  try {
    r.click(r.bars()[2], { shiftKey: true }); await r.flush();
    assert.equal(r.count(), 'bar 3 selected');
    await r.edit([HEAD6, 'Delete bar 2.']);
    assert.equal(r.count(), 'bar 3 selected', 'the same note again: the numbers mean what they meant');
    await r.edit([HEAD6, 'Delete bar 3.']);
    assert.equal(r.bars().length, 5, 'still five bars');
    assert.equal(r.count(), undefined, 'but another bar is gone: bar 3 of the selection is another bar now');
    r.click(r.bars()[2], { shiftKey: true }); await r.flush();
    assert.equal(r.count(), 'bar 3 selected');
    await r.edit([HEAD6, 'Keep bars 1 to 5.']);
    assert.equal(r.count(), undefined, 'a Keep instead of a Delete: renumbered');
    r.click(r.bars()[1], { shiftKey: true }); await r.flush();
    await r.edit([HEAD6, 'Keep bars 1 to 5.', 'Move bar 1 one bar right.']);
    assert.equal(r.count(), undefined, 'a second step is a change too');
    r.click(r.bars()[1], { shiftKey: true }); await r.flush();
    await r.edit(['Extend [[bar_005]] to 6 bars, building up.', 'Keep bars 1 to 5.', 'Move bar 1 one bar right.']);
    assert.equal(r.count(), 'bar 2 selected', 'the head\'s style is no step: the selection stays');
  } finally { r.done(); }
});

test('the real tab: the Inspector shows, word for word, what stepLineageOf says (a note, a made bar, a copy, a fork), and the pin says "bar N" in the log for every head', async () => {
  // 2026-11-20-1000 mutation survivor: src/score-inspector.ts:118 eq-flip#1 (the stack of a step bar is the step lineage's), :216 empty-string#1 (the pin label of a step bar is `bar N`)
  const heads: Array<[string, string[], string]> = [
    ['extend', [HEAD6, 'Copy bars 2 to 3.', 'Mix bars 1 and 3.'], 'made by phrase_020 (extend, no tempo change, style repeat_with_fills)'],
    ['mix', ['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.'], 'made by phrase_020 (mix of bar_005 and bar_006, as a vote)'],
    ['morph', ['Morph [[bar_005]] into [[bar_006]] over 4 bars, in musical order.', 'Copy bars 1 to 2.'], 'made by phrase_020 (morph bar_005 -> bar_006, musical order)'],
    ['take', ['Take [[phrase_014]].', 'Copy bar 1.'], 'made by phrase_020 (a transform of phrase_014)'],
  ];
  const seen: string[] = []; const info = console.info;
  console.info = (...a: unknown[]) => { seen.push(a.map(String).join(' ')); };
  try {
    for (const [name, list, madeBy] of heads) {
      const r = await rig(list);
      try {
        const n = r.bars().length;
        for (let i = 0; i < n; i++) {
          seen.length = 0;
          r.type(''); r.click(r.bars()[i]); await r.flush();
          const lines = r.lines();
          assert.equal(lines[0], `bar ${i + 1} of ${n}`, `${name} bar ${i + 1}`);
          assert.ok(lines.some((l) => l === madeBy) || lines.some((l) => /^made by step \d+: /.test(l)), `${name} bar ${i + 1}: ${lines.join(' / ')}`);
          assert.ok(!lines.some((l) => /could not be mapped/.test(l)), lines.join(' / '));
          assert.ok(lines.some((l) => /^tempo \d+/.test(l)), `${name} bar ${i + 1}: a tempo line`);
          assert.ok(seen.some((s) => s === `[forge-pin] click measure -> bar ${i + 1} (on the bar)`), `${name} bar ${i + 1}: the log says ${JSON.stringify(seen)}`);
        }
        if (name === 'extend') {
          r.type(''); r.click(r.bars()[4]); await r.flush();
          assert.deepEqual(r.lines(), ['bar 5 of 9', madeBy, 'from bar_005', 'was bar 2 before the steps', 'copied by step 1: Copy bars 2 to 3.', 'tempo 101']);
          r.click(r.bars()[3]); await r.flush();
          assert.deepEqual(r.lines(), ['bar 4 of 9', 'made by step 2: Mix bars 1 and 3, 50 percent bar 1, as a vote, and put it after bar 3.', 'from bars 1 and 3 as they were before step 2', 'from bar_005', 'tempo 300']);
          r.click(r.bars()[8]); await r.flush();
          assert.deepEqual(r.lines(), ['bar 9 of 9', madeBy, 'from bar_005', 'was bar 6 before the steps', 'tempo 105']);
        }
      } finally { r.done(); }
    }
  } finally { console.info = info; }
});

test('the real tab: the arrow keys walk the bars of a Score with steps in the order of the Score, from the first to the last and round again', async () => {
  // 2026-11-20-1000 mutation survivor: src/score-inspector.ts:202-207 (the order of the step bars: eq-flip, logic, plus-minus in the sort, `stepIds.length > 0`)
  for (const head of [[HEAD6, 'Delete bar 2.', 'Copy bars 1 to 2.'], ['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.', 'Copy bars 1 to 2.'], ['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', 'Move bar 2 one bar right.']]) {
    const r = await rig(head);
    try {
      const n = r.bars().length;
      const host = r.bars()[0].parentElement.parentElement;
      const key = (k: string) => { host.dispatchEvent(new (host.ownerDocument.defaultView as any).KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
      const walked: string[] = [];
      for (let i = 0; i < n + 1; i++) { key('ArrowRight'); await r.flush(); walked.push(r.lines()[0]); }
      assert.deepEqual(walked, [...Array.from({ length: n }, (_, i) => `bar ${i + 1} of ${n}`), `bar 1 of ${n}`], `${head.join(' | ')}: ArrowRight walks 1 .. ${n} and round`);
      key('ArrowLeft'); await r.flush();
      assert.equal(r.lines()[0], `bar ${n} of ${n}`, 'ArrowLeft from the first bar goes to the last');
      key('ArrowLeft'); await r.flush();
      assert.equal(r.lines()[0], `bar ${n - 1} of ${n}`);
    } finally { r.done(); }
  }
});

test('the real tab: the bars a Shift-click selected are tinted on the Score for EVERY head (the step bars are the phrase\'s own bars, whatever the head\'s own bar role)', async () => {
  // 2026-11-20-1000 mutation survivor: src/phrase-dom.ts:717 eq-flip#1, logic#3, eq-flip#2 (tintedIds: the role of a step bar is PHRASE_BAR_ROLE for a Mix and a Morph head too)
  for (const list of [[HEAD6, 'Delete bar 2.'], ['Mix [[bar_005]] and [[bar_006]].', 'Copy bar 1.'], ['Morph [[bar_005]] into [[bar_006]] over 4 bars, in musical order.', 'Keep bars 1 to 4.'], ['Take [[phrase_014]].', 'Delete bar 2.']]) {
    const r = await rig(list);
    try {
      r.click(r.bars()[1], { shiftKey: true }); await r.flush();
      const tinted = r.bars().map((b: any) => b.querySelector(`.${SELECTED_BAR_CLASS}`) !== null);
      assert.deepEqual(tinted, r.bars().map((_: unknown, i: number) => i === 1), `${list.join(' | ')}: only bar 2 is tinted`);
      assert.equal(r.count(), 'bar 2 selected');
      r.click(r.bars()[0], { shiftKey: true }); await r.flush();
      assert.deepEqual(r.bars().map((b: any) => b.querySelector(`.${SELECTED_BAR_CLASS}`) !== null).slice(0, 2), [true, true], `${list.join(' | ')}: the range 1 to 2 is tinted`);
    } finally { r.done(); }
  }
});

// ---- the Inspector panel with a `stepBars` port, on its own (the bars of a map are not all step bars: a mix\'s hits, a map whose keys are not in the order of the bars) ---------------------------------------------------------------
function panelWith(ids: string[], map: ProvenanceMap) {
  const win: any = new Window({ url: 'http://localhost/' }); const doc = win.document;
  const host = doc.createElement('div'); host.innerHTML = `<svg>${ids.map((id) => `<g class="note" id="${id}"><path id="${id}-p"/></g>`).join('')}</svg>`; doc.body.appendChild(host);
  const slot = doc.createElement('div'); doc.body.appendChild(slot);
  const traced: string[] = [];
  const insp = createScoreInspector(slot, {
    noteId: 'phrases/phrase_020', openNote: () => {}, trace: (l) => traced.push(l),
    lineage: (p) => [{ kind: 'bar', text: `OWN ${String(p.params.channel ?? p.params.bar)}`, covers: 'self' }],
    pinLabel: (id) => `own:${id}`,
    stepBars: { role: PHRASE_BAR_ROLE, lineage: (p) => [{ kind: 'bar', text: `STEP ${String(p.params.bar)} of ${String((p.params.steps as { n: number }).n)}`, covers: 'self' }] },
  });
  insp.onShown(host, { payload: {}, map, problems: [], kitProblems: [] });
  const click = (id: string) => doc.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (k: string) => host.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const shown = () => (slot.querySelector('.forge-inspector-body') as any).textContent as string;
  return { insp, click, key, shown, traced };
}
const stepProv = (bar: number) => ({ noteId: 'phrases/phrase_020', role: PHRASE_BAR_ROLE, params: { bar, bars: 3, tempo: 100, steps: { n: 3 } } });
const hitProv = { noteId: 'bars/bar_005', role: 'hit', params: { channel: 'kick', step: 0 } };

test('score-inspector: a bar carrying `steps` is told by the stepBars lineage and labelled `bar N`, any other element by the surface\'s own; the arrow keys walk ONLY the step bars, in bar order, whatever order the map lists them', () => {
  // 2026-11-20-1000 mutation survivor: src/score-inspector.ts:118 eq-flip#1, :202 eq-flip#2, logic#1, eq-flip#3, :203 plus-minus#1 (x - y -> x + y), :207 number+1#1 (stepIds.length > 0 -> > 1), :216 empty-string#1
  const carries = { ...hitProv, params: { channel: 'hat', step: 2, bar: 2.5, steps: { n: 9 } } };       // an element of ANOTHER role that happens to carry a `steps` param is not a step bar (the port names the role)
  const map: ProvenanceMap = { ph_bar_3: stepProv(3), kick_0: hitProv, ph_bar_1: stepProv(1), hat_2: carries, ph_bar_2: stepProv(2) } as ProvenanceMap;     // keys NOT in bar order, and hits among the bars
  const p = panelWith(Object.keys(map), map);
  const walked: string[] = [];
  for (let i = 0; i < 4; i++) { p.key('ArrowRight'); walked.push(p.shown()); }
  assert.deepEqual(walked, ['STEP 1 of 3', 'STEP 2 of 3', 'STEP 3 of 3', 'STEP 1 of 3'], 'bar order, the hit is no stop, round again');
  p.key('ArrowLeft'); assert.equal(p.shown(), 'STEP 3 of 3');
  p.click('kick_0'); assert.equal(p.shown(), 'OWN kick', 'a hit is told by the surface\'s own lineage');
  p.click('hat_2'); assert.equal(p.shown(), 'OWN hat', 'the role decides, not the param');
  p.click('ph_bar_2'); assert.equal(p.shown(), 'STEP 2 of 3');
  assert.deepEqual(p.traced.slice(-3).map((t) => t.replace(/^\[forge-pin\] click \S+ /, '')), ['-> own:kick_0 (on the bar)', '-> own:hat_2 (on the bar)', '-> bar 2 (on the bar)'], 'the log names a step bar `bar N`, the rest by the surface\'s label');
  // one step bar among other elements: the keys walk it alone
  const lone: ProvenanceMap = { kick_0: hitProv, ph_bar_1: stepProv(1), snare_4: { ...hitProv, params: { channel: 'snare', step: 4 } } } as ProvenanceMap;
  const q = panelWith(Object.keys(lone), lone);
  q.key('ArrowRight'); assert.equal(q.shown(), 'STEP 1 of 3');
  q.key('ArrowRight'); assert.equal(q.shown(), 'STEP 1 of 3', 'the only stop');
  // no step bar at all: the surface\'s own order and words (P3)
  const plain: ProvenanceMap = { kick_0: hitProv, snare_4: { ...hitProv, params: { channel: 'snare', step: 4 } } } as ProvenanceMap;
  const r = panelWith(Object.keys(plain), plain);
  r.key('ArrowRight'); assert.equal(r.shown(), 'OWN kick'); r.key('ArrowRight'); assert.equal(r.shown(), 'OWN snare');
  r.click('snare_4'); assert.match(r.traced[r.traced.length - 1], /-> own:snare_4 \(on the bar\)$/);
});
