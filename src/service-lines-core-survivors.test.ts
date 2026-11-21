// 2026-11-20-1003 - mutation survivors of service-lines-core.ts, pinned: the exact caps and their boundaries, the exact words of every drop reason, the edges of the request (a bar count of 0, a negative, a fraction, a cycle).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANSWER_MAX, LINES_MAX, LINES_SERVICE_VERSION, LINE_MAX, QUESTION_MAX, REQUEST_BARS_MAX, REQUEST_LINES_MAX, grammarTable, linesRequestFields, readLinesAnswer } from './service-lines-core.ts';

const ok = async () => null;
const ans = (json: unknown) => ({ status: 200, json });
const verbsOf = (f: Parameters<typeof grammarTable>[0]) => grammarTable(f).map((r) => r.split(': ')[0]);

test('the caps are what the proposal says', () => {
  assert.deepEqual([LINES_MAX, LINE_MAX, QUESTION_MAX, ANSWER_MAX, REQUEST_LINES_MAX, REQUEST_BARS_MAX, LINES_SERVICE_VERSION], [12, 300, 300, 4000, 60, 200, '0.2.49']);
});

test('each family table holds exactly its own verbs (and a bar\'s rows are all `bar:`)', () => {
  assert.deepEqual(verbsOf('phrase'), ['extend', 'mix', 'morph', 'take', 'thin out', 'double up', 'keep', 'delete', 'copy', 'move', 'bar replaced', 'threshold', 'ghost notes', 'make it']);
  assert.deepEqual(verbsOf('arrangement'), ['play', 'volume', 'mute', 'only', 'together']);
  assert.deepEqual(verbsOf('composition'), ['play for', 'then play', 'repeat that', 'for bars play']);
  assert.ok(grammarTable('bar').length > 5 && verbsOf('bar').every((v) => v === 'bar'));
});

test('the request\'s bar count: 0, negative, NaN and Infinity give no numbers; a fraction is floored; the count itself is passed as given; lines are cut at 300 and 60', () => {
  for (const n of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, null]) assert.deepEqual(linesRequestFields({ family: 'phrase', list: [], barCount: n }).bar_numbers, [], String(n));
  assert.deepEqual(linesRequestFields({ family: 'phrase', list: [], barCount: 1 }).bar_numbers, [1]);
  assert.deepEqual(linesRequestFields({ family: 'phrase', list: [], barCount: 2.7 }).bar_numbers, [1, 2]);
  assert.equal(linesRequestFields({ family: 'phrase', list: [], barCount: 2.7 }).bar_count, 2.7);
  const f = linesRequestFields({ family: 'phrase', list: ['a'.repeat(300), 'b'.repeat(301)], barCount: 1 });
  assert.equal(f.list[0].length, 300); assert.equal(f.list[1].length, 300);
  assert.equal(linesRequestFields({ family: 'phrase', list: Array.from({ length: 60 }, () => 'x'), barCount: 1 }).list.length, 60);
  assert.equal(linesRequestFields({ family: 'phrase', list: [], barCount: 200 }).bar_numbers.length, 200);
  assert.equal(linesRequestFields({ family: 'phrase', list: [], barCount: 201 }).bar_numbers.length, 200);
});

test('the boundaries of an answer: 12 lines pass and the 13th is dropped in those words; a line of 300 passes and 301 is dropped; a question of 300 passes and 301 is refused; an answer of 4000 characters passes and 4001 is refused', async () => {
  const twelve = await readLinesAnswer(ans({ lines: Array.from({ length: 13 }, (_, i) => `Delete bar ${i + 1}.`) }), ok);
  assert.equal((twelve as { lines: string[] }).lines.length, 12); assert.deepEqual((twelve as { dropped: unknown[] }).dropped, [{ line: 'Delete bar 13.', why: 'more than 12 lines' }]);
  const l300 = 'D'.repeat(300), l301 = 'D'.repeat(301);
  assert.deepEqual(await readLinesAnswer(ans({ lines: [l300] }), ok), { kind: 'lines', lines: [l300], dropped: [] });
  assert.deepEqual(await readLinesAnswer(ans({ lines: [l301, 'Delete bar 2.'] }), ok), { kind: 'lines', lines: ['Delete bar 2.'], dropped: [{ line: `${'D'.repeat(60)}…`, why: 'it is too long' }] });
  assert.deepEqual(await readLinesAnswer(ans({ question: 'q'.repeat(300) }), ok), { kind: 'question', question: 'q'.repeat(300) });
  assert.equal((await readLinesAnswer(ans({ question: 'q'.repeat(301) }), ok)).kind, 'refused');
  const at = (n: number) => { const base = JSON.stringify({ lines: ['Delete bar 2.'], p: '' }).length; return { lines: ['Delete bar 2.'], p: 'z'.repeat(n - base) }; };
  assert.equal(JSON.stringify(at(4000)).length, 4000); assert.equal((await readLinesAnswer(ans(at(4000)), ok)).kind, 'lines');
  assert.equal((await readLinesAnswer(ans(at(4001)), ok)).kind, 'refused');
  const cyc: Record<string, unknown> = { lines: ['Delete bar 2.'] }; cyc.self = cyc;
  const c = await readLinesAnswer(ans(cyc), ok); assert.equal(c.kind, 'refused'); assert.match((c as { message: string }).message, /too long to trust/);
});

test('every drop says why in its own words, and what was dropped is shown short', async () => {
  const out = await readLinesAnswer(ans({ lines: [42, null, ['a'], { k: 'v'.repeat(100) }, '   ', 'Make <b>x</b>.', 'Delete bar 2.'] }), ok);
  const d = (out as { dropped: Array<{ line: string; why: string }> }).dropped;
  assert.deepEqual(d.slice(0, 3), [{ line: '42', why: 'it was not text' }, { line: 'null', why: 'it was not text' }, { line: '["a"]', why: 'it was not text' }]);
  assert.equal(d[3].line.length, 80); assert.equal(d[3].why, 'it was not text');
  assert.deepEqual(d[4], { line: '', why: 'it was empty' });
  assert.deepEqual(d[5], { line: 'Make  b x /b .', why: 'it has markup or control characters' });
  assert.deepEqual((out as { lines: string[] }).lines, ['Delete bar 2.']);
  const longMarkup = await readLinesAnswer(ans({ lines: [`<${'m'.repeat(200)}>`.slice(0, 250)] }), ok);
  assert.equal((longMarkup as { message: string }).message.includes('m'.repeat(79)), true);
  assert.equal((longMarkup as { message: string }).message.includes('m'.repeat(80)), false, 'a dropped markup line is shown at most 80 characters (the first is the space that replaced the "<")');
});

test('the words of the refusals', async () => {
  assert.equal((await readLinesAnswer(ans({ lines: 'Delete bar 2.' }), ok) as { message: string }).message, 'The service\'s answer could not be read: its lines were not a list.');
  for (const q of [5, '', '   ', 'a<b', 'x'.repeat(301), null]) assert.equal((await readLinesAnswer(ans({ question: q }), ok) as { message: string }).message, 'The service asked a question I could not use. Try saying it differently.');
  const four = await readLinesAnswer(ans({ lines: ['Make a.', 'Make b.', 'Make c.', 'Make d.'] }), async () => 'no');
  assert.equal((four as { message: string }).message, 'The service answered, but I could not use any line of it: "Make a." (no); "Make b." (no); "Make c." (no).');
});

test('a question next to lines the grammar all refused is used; a question next to usable lines is not; `question` in the answer but lines usable', async () => {
  assert.deepEqual(await readLinesAnswer(ans({ lines: ['Make a.'], question: 'Which bar?' }), async () => 'no'), { kind: 'question', question: 'Which bar?' });
  assert.equal((await readLinesAnswer(ans({ lines: ['Delete bar 2.'], question: 'Which bar?' }), ok)).kind, 'lines');
  assert.deepEqual(await readLinesAnswer({ status: 200, json: { lines: [] } }, ok), { kind: 'refused', message: 'The service answered, but I could not use any line of it: .' });
});
