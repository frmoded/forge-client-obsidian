// 2026-11-20-1003 (THE SENTENCE SERVICE AS THE FLUENT FRONT END) - the pure core: what the request carries and how an answer of canonical LINES (or one clarifying QUESTION) is read. Written RED first.
// The grammar stays the only language: every line of an answer goes through a checker (the grammar, in the controller) before anything is shown; a line it cannot read is dropped and said, never applied.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANSWER_MAX, LINES_MAX, LINE_MAX, QUESTION_MAX, grammarTable, linesRequestFields, readLinesAnswer, LIST_MODEL_SENTINEL_SERVICE_LINES_CORE } from './service-lines-core.ts';
import { VERBS } from './phrase-grammar-core.ts';
import { BAR_FORMS } from './bar-grammar-core.ts';

const ok = async () => null;
const only = (good: string[]) => async (_acc: readonly string[], line: string) => (good.includes(line) ? null : 'the grammar cannot read it');
const ans = (json: unknown, status = 200) => ({ status, json });

test('the sentinel names this core', () => { assert.equal(LIST_MODEL_SENTINEL_SERVICE_LINES_CORE, 'forge-list-model-core:service-lines-core'); });

// ---- the request ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the grammar table is GENERATED from VERBS (and the bar forms), never hand-copied: every verb example appears in at least one family table, and a family table holds only its own', () => {
  const all = new Set<string>();
  for (const f of ['phrase', 'arrangement', 'composition'] as const) for (const row of grammarTable(f)) all.add(row);
  for (const v of VERBS) assert.ok([...all].some((row) => row.includes(v.example)), `the verb "${v.verb}" is in a family table`);
  for (const form of BAR_FORMS) assert.ok(grammarTable('bar').some((row) => row.includes(form)), `bar form ${form}`);
  assert.ok(grammarTable('phrase').some((r) => r.includes('Extend [[bar_005]]')));
  assert.ok(!grammarTable('phrase').some((r) => r.includes('Mute the [[latin]] kit.')), 'an arrangement verb is not offered for a phrase');
  assert.ok(grammarTable('arrangement').some((r) => r.includes('Mute the [[latin]] kit.')));
  assert.ok(grammarTable('composition').some((r) => r.includes('Then play [[arr_002]]')));
});

test('the request fields: mode, the table, the note\'s current lines, the Score\'s bar count and numbers, and the instruction (answer only with canonical sentences or ONE short question)', () => {
  const f = linesRequestFields({ family: 'phrase', list: ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Keep bars 1 to 2.'], barCount: 4 });
  assert.equal(f.mode, 'lines');
  assert.deepEqual(f.list, ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Keep bars 1 to 2.']);
  assert.equal(f.bar_count, 4); assert.deepEqual(f.bar_numbers, [1, 2, 3, 4]);
  assert.ok(f.grammar.length > 5);
  assert.match(f.instruction, /only with canonical sentences/i); assert.match(f.instruction, /ONE short (clarifying )?question/i);
  assert.equal('previous' in f, false, 'no previous question unless there was one');
  const g = linesRequestFields({ family: 'phrase', list: [], barCount: null, previous: { sentence: 'swap them', question: 'Which bars do you mean?' } });
  assert.deepEqual(g.previous, { sentence: 'swap them', question: 'Which bars do you mean?' });
  assert.equal(g.bar_count, null); assert.deepEqual(g.bar_numbers, []);
});

test('the request is capped: at most 60 list lines of at most 300 characters, at most 200 bar numbers', () => {
  const long = 'x'.repeat(400);
  const f = linesRequestFields({ family: 'composition', list: Array.from({ length: 80 }, (_, i) => (i === 0 ? long : `Play [[arr_001]] for ${i} bars.`)), barCount: 500 });
  assert.equal(f.list.length, 60); assert.ok(f.list.every((l) => l.length <= LINE_MAX));
  assert.equal(f.bar_numbers.length, 200);
});

// ---- the answer ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an answer with no `lines` and no `question` is LEGACY (the old plan, the old path, unchanged); so is every transport trouble', async () => {
  assert.deepEqual(await readLinesAnswer(ans({ ok: true, parsed_ok: true, plan: { kind: 'extend' } }), ok), { kind: 'legacy' });
  for (const status of [0, 401, 404, 422, 429, 502, 503]) assert.deepEqual(await readLinesAnswer(ans({ detail: 'x' }, status), ok), { kind: 'legacy' }, `status ${status}`);
  assert.deepEqual(await readLinesAnswer(ans('text'), ok), { kind: 'legacy' });
  assert.deepEqual(await readLinesAnswer(ans(null), ok), { kind: 'legacy' });
});

test('canonical lines are accepted in order; the checker sees the lines accepted so far (so order and replacement are the grammar\'s call)', async () => {
  const seen: string[][] = [];
  const out = await readLinesAnswer(ans({ ok: true, lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] }), async (acc, line) => { seen.push([...acc, line]); return null; });
  assert.deepEqual(out, { kind: 'lines', lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'], dropped: [] });
  assert.deepEqual(seen, [['Move bar 4 one bar left.'], ['Move bar 4 one bar left.', 'Move bar 3 one bar left.']]);
});

test('a line the grammar cannot read is DROPPED and said (with the grammar\'s reason), the rest stay', async () => {
  const out = await readLinesAnswer(ans({ ok: true, lines: ['Delete bar 2.', 'Make it sparkle.', 'Keep bars 1 to 3.'] }), only(['Delete bar 2.', 'Keep bars 1 to 3.']));
  assert.deepEqual(out, { kind: 'lines', lines: ['Delete bar 2.', 'Keep bars 1 to 3.'], dropped: [{ line: 'Make it sparkle.', why: 'the grammar cannot read it' }] });
});

test('when NO line survives the answer is a refusal in plain words that names what was dropped', async () => {
  const out = await readLinesAnswer(ans({ ok: true, lines: ['Make it sparkle.'] }), only([]));
  assert.equal(out.kind, 'refused');
  assert.match((out as { message: string }).message, /could not use any line/i); assert.match((out as { message: string }).message, /Make it sparkle\./);
});

test('a clarifying QUESTION: one short line, shown as a question; an empty `lines` with a question is a question', async () => {
  assert.deepEqual(await readLinesAnswer(ans({ ok: true, lines: [], question: 'Which two bars do you want to swap?' }), ok), { kind: 'question', question: 'Which two bars do you want to swap?' });
  assert.deepEqual(await readLinesAnswer(ans({ ok: true, question: 'How many bars?' }), ok), { kind: 'question', question: 'How many bars?' });
  const both = await readLinesAnswer(ans({ ok: true, lines: ['Delete bar 2.'], question: 'Sure?' }), ok);
  assert.equal(both.kind, 'lines', 'lines win over a question');
});

test('MALICIOUS answers: markup, control characters, a very long line, too many lines, a huge answer, non-text lines, a question with markup', async () => {
  const bad = ['<script>alert(1)</script>', 'Delete `bar 2`.', 'Delete {bar 2}.', 'Delete bar 2.\nDelete bar 3.', 'Delete bar 2.\u0007', 'x'.repeat(LINE_MAX + 1), 'Delete bar 2 \\ now.', 42 as unknown as string, null as unknown as string, ['a'] as unknown as string];
  const out = await readLinesAnswer(ans({ ok: true, lines: [...bad, 'Delete bar 2.'] }), ok);
  assert.equal(out.kind, 'lines'); assert.deepEqual((out as { lines: string[] }).lines, ['Delete bar 2.']);
  assert.equal((out as { dropped: unknown[] }).dropped.length, bad.length, 'every bad line is said');
  const many = await readLinesAnswer(ans({ ok: true, lines: Array.from({ length: LINES_MAX + 5 }, (_, i) => `Delete bar ${i + 1}.`) }), ok);
  assert.equal((many as { lines: string[] }).lines.length, LINES_MAX); assert.equal((many as { dropped: unknown[] }).dropped.length, 5);
  const huge = await readLinesAnswer(ans({ ok: true, lines: ['Delete bar 2.'], padding: 'z'.repeat(ANSWER_MAX + 1) }), ok);
  assert.equal(huge.kind, 'refused'); assert.match((huge as { message: string }).message, /too long/i);
  for (const q of ['<b>Which?</b>', 'Which\nbars?', 'q'.repeat(QUESTION_MAX + 1), '', '   ', 7]) { const r = await readLinesAnswer(ans({ ok: true, question: q }), ok); assert.equal(r.kind, 'refused', JSON.stringify(q)); }
  const notArray = await readLinesAnswer(ans({ ok: true, lines: 'Delete bar 2.' }), ok); assert.equal(notArray.kind, 'refused');
});

test('a link in a line is kept (it is the grammar\'s own notation); a throwing checker drops the line, never the whole answer', async () => {
  const out = await readLinesAnswer(ans({ ok: true, lines: ['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Keep bar 1.'] }), async (_a, line) => { if (line === 'Keep bar 1.') throw new Error('boom'); return null; });
  assert.deepEqual((out as { lines: string[] }).lines, ['Extend [[bar_005]] to 8 bars, repeating with fills.']);
  assert.equal((out as { dropped: Array<{ why: string }> }).dropped[0].why, 'the line could not be checked');
});
