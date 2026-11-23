// 2026-11-23-1018 PART A: the service answers EVERY failure as `{ok:false, parsed_ok, plan:null, error:<reason>, lines:null, question:null}` (forge-transpile plan.py make_lines). The client read `lines: null` as "not a list" and showed
// `its lines were not a list` for every refusal, so the service's own reason (the model's `A phrase cannot Play.`, the three-attempts reason, `could not be read`) was never seen. The real reader and the real dialog, a faked service.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readLinesAnswer } from './service-lines-core.ts';
import { EXTEND, phraseWithHead } from './test-support/service-lines-rig.ts';

const NOT_A_LIST = /its lines were not a list/;
const keep = async () => null;                                  // the grammar check: every line reads
const refusal = (error: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error, lines: null, question: null, ...extra } });
const message = async (res: { status: number; json: unknown }): Promise<string> => { const r = await readLinesAnswer(res, keep); assert.equal(r.kind, 'refused', JSON.stringify(r)); return (r as { message: string }).message; };

test('A the reader: the service\'s OWN reason is the message (the model\'s refusal, the three-attempts reason, the unreadable answer, a request too large), never "its lines were not a list"', async () => {
  for (const reason of ['A phrase cannot Play.', 'The planner\'s answer could not be used: a line was not text. Try saying it differently.', 'I could not read a plan from the answer. Try saying it more simply.', 'That request is too large for the planner (more than about 20 KB of text). Send fewer lines.', 'The planner did not give any sentence or question for that. Try saying it differently.']) {
    assert.equal(await message(refusal(reason)), reason);
  }
  assert.equal(await message(refusal('I could not read a plan from the answer. Try saying it more simply.', { parsed_ok: false })), 'I could not read a plan from the answer. Try saying it more simply.', 'the unreadable case (parsed_ok false)');
});

test('A the reader: ok:false with no usable reason says so in plain words; ok:true with lines:null and no question is "The service gave no lines."; a truly wrong type keeps today\'s message', async () => {
  assert.equal(await message(refusal(null)), 'The service refused without saying why. Try saying it differently.');
  assert.equal(await message(refusal('   ')), 'The service refused without saying why. Try saying it differently.');
  assert.equal(await message({ status: 200, json: { ok: true, lines: null, question: null } }), 'The service gave no lines.');
  assert.equal(await message({ status: 200, json: { ok: true, lines: { a: 1 }, question: null } }), 'The service\'s answer could not be read: its lines were not a list.');
  assert.equal(await message({ status: 200, json: { ok: true, lines: 7 } }), 'The service\'s answer could not be read: its lines were not a list.');
});

test('A the reader: a null `lines` beside a real question is still the question; real lines are still lines (nothing else moved)', async () => {
  const q = await readLinesAnswer({ status: 200, json: { ok: true, lines: null, question: 'Which bar?' } }, keep); assert.deepEqual(q, { kind: 'question', question: 'Which bar?' });
  const l = await readLinesAnswer({ status: 200, json: { ok: true, lines: ['Delete bar 2.'], question: null } }, keep); assert.equal(l.kind, 'lines');
  const empty = await readLinesAnswer({ status: 200, json: { ok: true, lines: [], question: 'Which bar?' } }, keep); assert.equal(empty.kind, 'question');
});

test('A the reason is shown SAFELY: plain text (markup, backticks and control characters become spaces), one line, capped', async () => {
  const msg = await message(refusal('<b>Bad</b> `thing`\n{x}\\ happened'));
  assert.doesNotMatch(msg, /[<>`{}\\\n]/); assert.match(msg, /Bad/); assert.match(msg, /happened/);
  const long = await message(refusal('x'.repeat(5000)));
  assert.ok(long.length <= 260, `capped: ${long.length}`);
});

test('A through the REAL composer and dialog: a refusal shows the service\'s own sentence (`The service refused: A phrase cannot Play.`), never "its lines were not a list"; the sentence is kept as a waiting line and nothing else is written', async () => {
  const r = await phraseWithHead(async () => refusal('A phrase cannot Play.'));
  await r.say('Play [[phrase_001]]');
  const texts = r.texts();
  assert.ok(texts.some((t) => /The service refused: A phrase cannot Play\./.test(t)), texts.join(' | '));
  assert.ok(!texts.some((t) => NOT_A_LIST.test(t)), texts.join(' | '));
  assert.equal(r.list()[0], EXTEND, 'the list is as it was');
});
