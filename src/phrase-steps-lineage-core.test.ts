// 2026-11-20-1000 (THE INSPECTOR THROUGH THE STEP LINES) - the PURE half, written RED first (the core did not exist; against 97496cc the same phrases are refused: "the Score has 7 bars but the phrase asks for 4", "the two bars of the morph did not reach the Score";
// src/phrase-steps-inspector-wiring.test.ts shows that on the real tab). For a phrase with a head and ONE, TWO and THREE step lines of EVERY kind in every mixed order (Keep, Delete, Copy, Move left and right, Morph-between, Mix, Extend replacing, Extend inserting), drawn by the REAL
// producePhraseNote (the stub engine of src/test-support/phrase-steps-rig.ts: every bar has a tempo that tells it apart) and tied by the code under test, for EVERY bar of the Score:
//   * the provenance names a source note (a bar the steps carried: its own head bar's note, a Copy: the source bar's note, a Move: the moved bar's own note at its NEW position) or is a "made by step N" entry in plain words (Morph-between, Mix, Extend), with its source bars;
//   * a deleted bar is gone (the map has exactly one entry per bar of the Score, ph_bar_1 .. ph_bar_N);
//   * the click's bar number (the provenance's `bar`, what barNumberOf reads) is the bar's POSITION in the Score;
//   * the trace agrees with an INDEPENDENT longhand model of the steps (test-support/phrase-steps-rig.ts), and the model agrees with what the stub engine really drew (the tempo of every bar).
// Heads: Extend, Morph, Mix, Take.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { annotateWithSteps, stepLineageOf, traceSteps } from './phrase-steps-lineage-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { barNumberOf } from './duplicate-sentence-core.ts';
import { structureSentence } from './bar-structure-core.ts';
import { isStructureOp } from './bar-structure-core.ts';
import { readPhraseNote, type PhraseParams, type StructureOp } from './phrase-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';
import { STEP_POOL, drawNote, modelSteps, noteFor, type Bar, type ModelBar } from './test-support/phrase-steps-rig.ts';

interface Head { name: string; line: string; prefix: string[]; notes(h: number, n: number): string[]; madeBy: string }
const HEADS: Head[] = [
  { name: 'extend', line: 'Extend [[bar_005]] to 6 bars, repeating with fills.', prefix: [], notes: () => ['bars/bar_005'], madeBy: 'extend, no tempo change, style repeat_with_fills' },
  { name: 'morph', line: 'Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', prefix: [], notes: (h, n) => [h <= (n + 1) / 2 ? 'bars/bar_005' : 'bars/bar_006'], madeBy: 'morph bar_005 -> bar_006, musical order' },
  { name: 'mix', line: 'Mix [[bar_005]] and [[bar_006]].', prefix: ['Extend bar 1 to 4 bars.'], notes: () => ['bars/bar_005', 'bars/bar_006'], madeBy: 'mix of bar_005 and bar_006, as a vote' },
  { name: 'take', line: 'Take [[phrase_014]].', prefix: [], notes: () => ['phrases/phrase_014'], madeBy: 'a transform of phrase_014' },
];

const baseOf = (id: string): string => id.split('/').pop() ?? id;
const wordsOf = (positions: readonly number[]): string => (positions.length === 1 ? `bar ${positions[0]}` : `bars ${positions.slice(0, -1).join(', ')} and ${positions[positions.length - 1]}`);

/** Everything a drawn Score of a phrase must say, bar by bar. Returns the number of bars checked. */
async function checkPhrase(head: Head, steps: string[], tally: { drawn: number; refused: number; bars: number; made: Set<string> }): Promise<void> {
  const list = [head.line, ...head.prefix, ...steps];
  const note = noteFor(list);
  const out = await drawNote(note);
  if ('refusal' in out) { tally.refused++; return; }
  tally.drawn++;
  const parsed = readPhraseNote(note);
  assert.ok(parsed.ok, list.join(' | '));
  const params = (parsed as { ok: true; value: PhraseParams }).value;
  const ops = (params.kind === 'transform' ? params.ops.filter(isStructureOp) : (params.ops ?? [])) as StructureOp[];
  const headOnly = await drawNote(noteFor([head.line]));
  assert.ok('bars' in headOnly, `${head.name}: the head draws`);
  const headCount = (headOnly as { bars: Bar[] }).bars.length;
  const where = list.join(' | ');
  const payload = out.payload;
  assert.deepEqual(payload.forge_steps, { head: headCount }, `${where}: the payload carries the head's bar count`);
  const model = modelSteps(headCount, ops);
  const N = out.bars.length;
  assert.equal(model.length, N, `${where}: the model and the engine agree on the number of bars`);
  const result = annotateWithSteps('phrases/phrase_020', params, payload);
  assert.ok(result !== null, `${where}: the Score is tied through its steps`);
  assert.deepEqual(result!.problems, [], where);
  const map: ProvenanceMap = result!.map;
  assert.deepEqual(Object.keys(map), Array.from({ length: N }, (_, i) => `ph_bar_${i + 1}`), `${where}: one entry per bar of the Score, a deleted bar is gone`);
  // the trace is the model
  const trace = traceSteps(headCount, ops);
  assert.equal(trace.length, N, where);
  for (let i = 1; i <= N; i++) {
    const m: ModelBar = model[i - 1];
    const p = map[`ph_bar_${i}`];
    const label = `${where} / bar ${i} of ${N}`;
    tally.bars++;
    // the click's number is the position
    assert.equal(p.params.bar, i, label); assert.equal(p.params.bars, N, label); assert.equal(barNumberOf(p.params, false), i, `${label}: the click's number`);
    // the stub engine drew exactly what the model says (extend head: the tempo tells the head bar; a step's bars carry their own tempo class)
    const tempo = out.bars[i - 1].tempo_bpm;
    if (head.name === 'extend') {
      if (m.head !== null) assert.equal(tempo, 100 + m.head - 1, `${label}: the model says head bar ${m.head}, the engine drew it`);
      else assert.ok(tempo >= 300, `${label}: the model says a step made it (tempo ${tempo})`);
    }
    assert.equal(p.params.tempo, tempo, `${label}: the tempo is the Score's own`);
    // a note, always
    const notes = m.head !== null ? head.notes(m.head, headCount) : [...new Set(m.made!.heads.flatMap((h) => head.notes(h, headCount)))];
    const pin = pinnedNoteFor(p);
    assert.equal(pin?.noteId, notes[0], `${label}: the note the notes pane follows`);
    const lines = stepLineageOf(p);
    const texts = lines.map((l) => l.text);
    assert.equal(texts[0], `bar ${i} of ${N}`, label);
    assert.ok(texts.every((t) => !/could not be mapped/.test(t)), label);
    assert.deepEqual(lines.filter((l) => l.kind === 'note' && l.text.startsWith('from ')).map((l) => l.noteId), notes, `${label}: the notes it comes from`);
    for (const l of lines.filter((x) => x.kind === 'note')) assert.ok(typeof l.noteId === 'string' && l.noteId !== '', label);
    const stepLines = lines.filter((l) => l.kind === 'step').map((l) => l.text);
    if (m.made !== null) {
      const s = m.made.step;
      tally.made.add(ops[s - 1].op);
      assert.deepEqual(stepLines, [`made by step ${s}: ${structureSentence(ops[s - 1])}`, `from ${wordsOf(m.made.from)} as ${m.made.from.length === 1 ? 'it was' : 'they were'} before step ${s}`], `${label}: made by its step, in plain words, with its source bars`);
      assert.ok(!texts.some((t) => t.startsWith('made by phrase_020')), `${label}: a made bar is not "made by" the head`);
    } else {
      const via = [...m.copies.map((s) => ({ s, how: 'copied' })), ...m.moves.map((s) => ({ s, how: 'moved' }))].sort((x, y) => x.s - y.s || (x.how < y.how ? -1 : 1));
      const want = [...(m.head !== i ? [`was bar ${m.head} before the steps`] : []), ...via.map((v) => `${v.how} by step ${v.s}: ${structureSentence(ops[v.s - 1])}`)];
      assert.deepEqual(stepLines, want, `${label}: what the steps did to this bar`);
      assert.ok(texts.includes(`made by phrase_020 (${head.madeBy})`), `${label}: ${texts.join(' / ')}`);
    }
    assert.equal(lines.some((l) => l.kind === 'tempo' && l.text === `tempo ${tempo}`), true, label);
    const edit = lines.filter((l) => l.kind === 'action');                     // an extend's and a morph's bars offer "Edit this bar" up to the head's own count (what editThisBar accepts); a mix's and a take's never
    assert.deepEqual(edit.map((l) => l.text), (head.name === 'extend' || head.name === 'morph') && i <= headCount ? ['Edit this bar'] : [], label);
  }
}

test('EVERY bar of EVERY phrase with a head and one, two or three step lines of every kind in mixed order (Extend, Morph, Mix and Take heads) is tied: a note, or "made by step N"; the click number is the position', async () => {
  const tally = { drawn: 0, refused: 0, bars: 0, made: new Set<string>() };
  const pool = STEP_POOL.map((s) => s.typed);
  for (const head of HEADS) {
    for (const a of pool) await checkPhrase(head, [a], tally);
    for (const a of pool) for (const b of pool) await checkPhrase(head, [a, b], tally);
    // the triples: every one for the Extend head, a deterministic spread for the others (every kind still opens, middles and closes some)
    let k = 0;
    for (const a of pool) for (const b of pool) for (const c of pool) { if (head.name === 'extend' || (k++ % 4 === 0)) await checkPhrase(head, [a, b, c], tally); }
  }
  assert.ok(tally.drawn >= 1000, `drawn ${tally.drawn} (refused at draw time: ${tally.refused})`);
  assert.ok(tally.bars >= 8000, `checked ${tally.bars} bars`);
  assert.deepEqual([...tally.made].sort(), ['extend_bar', 'mix_bars', 'morph_between'], 'every kind of step that MAKES bars was seen making them');
});

test('forks: a bar the person edited (overrides number the bars AFTER the steps) is its fork note, said so; the bar after it is not touched', async () => {
  const note = noteFor(['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 2.', 'Copy bars 1 to 2.', 'Bar 3 is replaced by [[bar_009]].']);
  const out = await drawNote(note);
  assert.ok('payload' in out, 'refusal' in out ? out.refusal : '');
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const res = annotateWithSteps('phrases/phrase_020', params, (out as { payload: Record<string, unknown> }).payload)!;
  assert.deepEqual(res.problems, []);
  const forked = res.map.ph_bar_3;
  assert.equal(pinnedNoteFor(forked)?.noteId, 'bars/bar_009');
  assert.match(stepLineageOf(forked).map((l) => l.text).join(' | '), /forked: edited in bar_009/);
  assert.deepEqual(stepLineageOf(forked).filter((l) => l.kind === 'action').map((l) => `${l.text} ${l.action?.barNumber}`), ['Revert to generated 3'], 'a forked bar offers to revert it, and not to fork it again');
  assert.equal(pinnedNoteFor(res.map.ph_bar_4)?.noteId, 'bars/bar_005');
});

test('a phrase with NO step line is not this core\'s: null for every head, a Take with only density steps, and a payload that carries no head count (the old builders answer: byte for byte as before)', async () => {
  for (const line of ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', 'Mix [[bar_005]] and [[bar_006]].', 'Take [[phrase_014]].', 'Take [[phrase_014]]. Thin out bars 1 to 2, by half, keeping the downbeat.']) {
    const note = noteFor(line.split(/(?<=\.)\s+/));
    const out = await drawNote(note) as { payload: Record<string, unknown> };
    assert.equal('forge_steps' in out.payload, false, `${line}: no key on the payload`);
    const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
    assert.equal(annotateWithSteps('phrases/phrase_020', params, out.payload), null, line);
  }
  const note = noteFor(['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 2.']);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const out = await drawNote(note) as { payload: Record<string, unknown> };
  const { forge_steps: _gone, ...bare } = out.payload;
  assert.equal(annotateWithSteps('phrases/phrase_020', params, bare), null, 'no head count on the payload: not this core\'s');
});

test('a Score whose measures are not the traced count is refused in words (never a guess); the Kit view is tied by the same ids', async () => {
  const note = noteFor(['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 2.']);
  const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
  const out = await drawNote(note) as { payload: Record<string, unknown>; bars: Bar[] };
  const short = { ...out.payload, multi_staff_content: String(out.payload.multi_staff_content).replace(/<measure number="5"[\s\S]*?<\/measure>/g, '') };
  const bad = annotateWithSteps('phrases/phrase_020', params, short)!;
  assert.deepEqual(bad.map, {}); assert.match(bad.problems[0], /the Score has 4 bars but the phrase asks for 5/);
  const ok = annotateWithSteps('phrases/phrase_020', params, out.payload)!;
  assert.match(String(ok.payload.kit_content), /id="ph_bar_5"/); assert.match(String(ok.payload.multi_staff_content), /id="ph_bar_5"/);
});

test('traceSteps: the trace of the steps IS the model, over head sizes 1 to 7 and every kind of step (a direct sweep, no engine)', () => {
  const ops: StructureOp[][] = [
    [{ op: 'keep', runs: [[1, 3]] }], [{ op: 'delete', runs: [[2, 2]] }], [{ op: 'copy', runs: [[1, 2]] }], [{ op: 'move', runs: [[2, 2]], by: 1 }], [{ op: 'move', runs: [[2, 3]], by: -1 }],
    [{ op: 'morph_between', a: 1, b: 2, bars: 3, order: 'musical', seed: 0, after: 1 }], [{ op: 'mix_bars', a: 1, b: 2, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 'end' }],
    [{ op: 'extend_bar', bar: 1, bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 }], [{ op: 'extend_bar', bar: 2, bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0, after: 0 }],
    [{ op: 'copy', runs: [[1, 1], [3, 3]] }, { op: 'delete', runs: [[2, 2]] }, { op: 'mix_bars', a: 1, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 2 }],
  ];
  let n = 0;
  for (let heads = 3; heads <= 7; heads++) for (const o of ops) { assert.deepEqual(traceSteps(heads, o).map((t) => ({ head: t.head, made: t.made, copies: t.via.filter((v) => v.how === 'copy').map((v) => v.step), moves: t.via.filter((v) => v.how === 'move').map((v) => v.step) })), modelSteps(heads, o), `${heads} bars, ${JSON.stringify(o)}`); n++; }
  assert.equal(n, 50);
});
