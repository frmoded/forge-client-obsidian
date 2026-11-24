// 2026-11-23-1027 PARTS A and B on the REAL controller, composer and dialog (a faked service; the real model cannot be run): `Move bar 1 after bar 3.` in a 4-bar phrase.
//   A  what the dialog shows, in what order, for each behaviour of the service (not set up / a question / lines / a refusal / lines the grammar cannot read / unreachable), and that the service is always SAID to have been asked or not (and why);
//   B  the repair is the whole chain: one Enter writes both sentences, one undo entry takes both away; a move that goes nowhere is refused in words and the service is not asked.
//   Addendum 2 (2): a sentence typed while a WAITING line is in the note asks the service ONCE on entry (against the note before the waiting line), says what it answered and that nothing was added; (3): the same sentence twice says something NEW.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, phraseWithHead, rig } from './test-support/service-lines-rig.ts';

const CHAIN_CARD = 'Did you mean: Move bar 1 one bar right. Move bar 2 one bar right? Bar 1 after bar 3 is 2 places right: both moves are written.';
const SAID = ' (you said: move bar 1 after bar 3)';
const NOT_SET_UP = /^The sentence service is not set up in this vault, so it was not asked\./;
const QUESTION = 'Do you want to move bar 1 to the position after bar 3, or move bars in a range that includes bar 1?';
const after = (texts: string[], from: RegExp): string[] => texts.slice(texts.findIndex((t) => from.test(t)));

// ---- PART A: the dialog, for every behaviour of the service ------------------------------------------------------------------------------------------------------------------------------------------
test('A: NOT set up: the service is not asked and the dialog SAYS so (before the card), then the whole chain is offered; Enter applies both sentences', async () => {
  const r = rig({ service: lines('x'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say('move bar 1 after bar 3');
  assert.equal(r.requests.length, 0);
  const t = r.texts(), i = t.findIndex((x) => NOT_SET_UP.test(x)), j = t.findIndex((x) => x === CHAIN_CARD);
  assert.ok(i >= 0, `the dialog says the service was not asked: ${t.join(' | ')}`); assert.ok(j > i, 'the notice comes BEFORE the card');
  assert.ok(r.traces.some((l) => /not asked: .*not set up/.test(l)), `a trace line says it too: ${r.traces.join(' | ')}`);
  assert.deepEqual(r.list(), [EXTEND], 'nothing is written by the first Enter'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, `Move bar 1 one bar right.${SAID}`, 'Move bar 2 one bar right.'], 'both moves, the driver\'s words on the first line only');
});
test('A: the service ANSWERS the chain: it was asked first (once), the lines are the plan, the repair is not offered; one Enter writes both', async () => {
  const r = await phraseWithHead(lines('Move bar 1 one bar right.', 'Move bar 2 one bar right.'));
  await r.say('move bar 1 after bar 3');
  assert.equal(r.requests.length, 1); assert.equal(r.requests[0].sentence, 'move bar 1 after bar 3'); assert.equal(r.suggestion(), 'Move bar 1 one bar right. Move bar 2 one bar right.');
  assert.ok(!r.texts().some((x) => /^Did you mean/.test(x)));
  await r.enter(); assert.deepEqual(r.list(), [EXTEND, `Move bar 1 one bar right.${SAID}`, 'Move bar 2 one bar right.']);
});
test('A: the service ASKS A QUESTION (CCQA 2026-11-23): the dialog shows the question first, then the repair that has ONE meaning, in that order; the question is not hidden and the whole chain is offered', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: true, lines: null, question: QUESTION } }));
  await r.say('move bar 1 after bar 3');
  const t = r.texts(), q = t.findIndex((x) => x === `The service asks: ${QUESTION}`), c = t.findIndex((x) => x === CHAIN_CARD);
  assert.ok(q >= 0 && c > q, t.join(' | ')); assert.equal(r.requests.length, 1);
  await r.enter(); assert.deepEqual(r.list(), [EXTEND, `Move bar 1 one bar right.${SAID}`, 'Move bar 2 one bar right.']);
});
test('A: the service REFUSES ({ok:false,error}): its own words, then the chain', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'This note kind can only extend, mix, morph.', lines: null, question: null } }));
  await r.say('move bar 1 after bar 3');
  const t = r.texts(); assert.ok(t.includes('The service refused: This note kind can only extend, mix, morph.'), t.join(' | ')); assert.ok(t.includes(CHAIN_CARD), t.join(' | '));
  assert.ok(t.indexOf('The service refused: This note kind can only extend, mix, morph.') < t.indexOf(CHAIN_CARD));
});
test('A: the service answers LINES THE GRAMMAR CANNOT READ: the dropped lines are said, then the chain', async () => {
  const r = await phraseWithHead(lines('Shuffle bar 1 around.'));
  await r.say('move bar 1 after bar 3');
  const t = r.texts(); assert.ok(t.some((x) => /^The service refused: The service answered, but I could not use any line of it: "Shuffle bar 1 around\."/.test(x)), t.join(' | ')); assert.ok(t.includes(CHAIN_CARD));
});
test('A: the service is UNREACHABLE: said, then the chain', async () => {
  const r = await phraseWithHead(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); });
  await r.say('move bar 1 after bar 3'); const t = r.texts();
  assert.ok(t.some((x) => /^The service refused: Could not reach the transpile service/.test(x)), t.join(' | ')); assert.ok(t.includes(CHAIN_CARD));
});

// ---- PART B: one Enter, one undo entry -----------------------------------------------------------------------------------------------------------------------------------------------------------
test('B: ONE undo entry takes the whole chain (and the marker) away, one redo puts it all back', async () => {
  const r = rig({ service: lines('x'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say('move bar 1 after bar 3'); await r.enter(); assert.equal(r.list().length, 3);
  await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'one undo: both moves are gone');
  await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.deepEqual(r.list(), [EXTEND, `Move bar 1 one bar right.${SAID}`, 'Move bar 2 one bar right.']);
});
test('B: a TWO-bar phrase: `Move bar 1 after bar 2.` is one move; and a three-place chain writes three lines', async () => {
  const r = rig({ service: lines('x'), drawn: 2, configured: false }); await r.ready(); r.type('Extend [[bar_005]] to 2 bars, repeating with fills.'); await r.enter();
  await r.say('Move bar 1 after bar 2.'); await r.enter(); assert.equal(r.list().length, 2); assert.match(r.list()[1], /^Move bar 1 one bar right\./);
  const q = rig({ service: lines('x'), drawn: 5, configured: false }); await q.ready(); q.type('Extend [[bar_005]] to 5 bars, repeating with fills.'); await q.enter();
  await q.say('Move bar 5 before bar 2.'); await q.enter(); assert.deepEqual(q.list().slice(1).map((l) => l.replace(/ \(you said:.*$/, '')), ['Move bar 5 one bar left.', 'Move bar 4 one bar left.', 'Move bar 3 one bar left.']);
});
test('B: a move that goes NOWHERE is refused in plain words: no question, the service is not asked, nothing is written, with the service set up or not', async () => {
  for (const configured of [true, false]) {
    const r = rig({ service: lines('Move bar 2 one bar right.'), drawn: 4, configured }); await r.ready(); r.type(EXTEND); await r.enter();
    await r.say('Move bar 2 before bar 3.');
    assert.equal(r.requests.length, 0, 'the service is not asked'); assert.ok(r.texts().includes('Bar 2 is already before bar 3: nothing to move.'), r.texts().join(' | '));
    assert.ok(!r.texts().some((x) => /\?$|^The service asks|^Did you mean|not set up/.test(x)), 'no question, no card'); assert.deepEqual(r.list(), [EXTEND]);
    await r.say('Move bar 3 before bar 3.'); assert.ok(r.texts().includes('Bar 3 cannot go before itself.'), r.texts().join(' | ')); assert.equal(r.requests.length, 0);
  }
});
test('B: Copy keeps its own way: `Copy bar 1 after bar 3.` is asked of the service first, has NO repair (Copy adds a bar: a chain of moves is not what it means), and is kept waiting when nothing reads it', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'no' } }));
  await r.say('Copy bar 1 after bar 3.'); assert.equal(r.requests.length, 1); assert.ok(!r.texts().some((x) => /^Did you mean/.test(x)), r.texts().join(' | ')); assert.deepEqual(r.list(), [EXTEND, 'Waiting: Copy bar 1 after bar 3.']);
});

// ---- ADDENDUM 2 (2) and (3): a waiting line in the note ---------------------------------------------------------------------------------------------------------------------------------------------
/** The driver's retest: `swap the second and third bars` is refused and kept as line 2; then `Move bar 4 before bar 2`. The service answers per call: swap = refuse, then whatever `next` says. */
const swapThenMove = async (next: (n: number) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>) => {
  let n = 0; const r = await phraseWithHead(async () => (n++ === 0 ? { status: 200, json: { ok: false, error: 'This note kind can only extend, mix, morph, take, thin out, double up, keep, delete, copy, move, replace bars, set threshold, add ghost notes, or change tempo.', lines: null, question: null } } : next(n)));
  await r.say('swap the second and third bars'); assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars']); assert.equal(r.requests.length, 1);
  return r;
};
test('Addendum 2 (2): the sentence typed after a waiting line ASKS THE SERVICE ONCE and the dialog says what it answered and that nothing was added (it was never asked before: the dialog said only "Line 2 is waiting")', async () => {
  const r = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] } }));
  const mark = r.texts().length;
  await r.say('Move bar 4 before bar 2');
  assert.equal(r.requests.length, 2, 'the service was asked once on entry'); assert.equal(r.requests[1].sentence, 'Move bar 4 before bar 2');
  assert.deepEqual((r.requests[1] as { list: string[] }).list, [EXTEND], 'it is asked against the note as it is BEFORE the waiting line (the waiting words are not part of the request)');
  const t = r.texts().slice(mark); assert.ok(t.includes('Asking the sentence service...'), t.join(' | '));
  assert.ok(t.some((x) => x === 'Line 2 is waiting for a translation, so "Move bar 4 before bar 2" was not added. The service would write it as: Move bar 4 one bar left. Move bar 3 one bar left. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), t.join(' | '));
  assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars'], 'nothing was written');
});
test('Addendum 2 (3): the SAME sentence twice does not repeat itself: the second time says line 2 is already waiting, and the service is not asked again', async () => {
  const r = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] } }));
  await r.say('Move bar 4 before bar 2'); const mark = r.texts().length; await r.say('Move bar 4 before bar 2');
  assert.equal(r.requests.length, 2, 'not asked again'); const t = r.texts().slice(mark);
  assert.deepEqual(t.filter((x) => !/^Move bar 4 before bar 2$/.test(x)), ['Line 2 is already waiting; say "Translate line 2."'], t.join(' | '));
  const lineTwo = r.texts().filter((x) => /^Line 2 is/.test(x)); assert.equal(lineTwo.length, 2); assert.notEqual(lineTwo[0], lineTwo[1], 'the second entry says something NEW, not the same line again');
});
test('Addendum 2 (2): the service REFUSES or ASKS for the sentence after a waiting line: its words are in the dialog beside the fact that nothing was added; a different sentence is asked again', async () => {
  const a = await swapThenMove(() => ({ status: 200, json: { ok: false, error: 'No.', lines: null, question: null } })); await a.say('Move bar 4 before bar 2');
  assert.ok(a.texts().some((x) => x === 'Line 2 is waiting for a translation, so "Move bar 4 before bar 2" was not added. The service refused: No. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), a.texts().join(' | '));
  const q = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: null, question: 'Which bar?' } })); await q.say('Move bar 4 before bar 2');
  assert.ok(q.texts().some((x) => /so "Move bar 4 before bar 2" was not added\. The service asks: Which bar\? Say "Translate line 2\."/.test(x)), q.texts().join(' | '));
  await q.say('Move bar 3 before bar 1'); assert.equal(q.requests.length, 3, 'another sentence is another ask');
});
test('Addendum 2 (2): blocked by a waiting line and the service NOT set up, or a sentence the grammar reads: said, with the reason the service was not asked', async () => {
  const off = rig({ service: lines('x'), drawn: 4, configured: false }); await off.ready(); off.type(EXTEND); await off.enter();
  await off.say('swap the second and third bars'); await off.say('Move bar 4 before bar 2');
  assert.ok(off.texts().some((x) => x === 'Line 2 is waiting for a translation, so "Move bar 4 before bar 2" was not added. The sentence service was not asked: it is not set up in this vault. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), off.texts().join(' | '));
  assert.equal(off.requests.length, 0);
  const on = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: ['Delete bar 1.'] } })); await on.say('Delete bar 1.');
  assert.equal(on.requests.length, 1, 'a sentence the grammar reads needs no service'); assert.ok(on.texts().some((x) => x === 'Line 2 is waiting for a translation, so "Delete bar 1." was not added. The sentence service was not asked: the grammar reads it. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), on.texts().join(' | '));
});
test('Addendum 2: after the waiting line is translated the same sentence goes through (the way out the dialog names works)', async () => {
  const r = await swapThenMove((n) => ({ status: 200, json: { ok: true, lines: n === 2 ? ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] : ['Move bar 2 one bar right.'] } }));
  await r.say('Translate line 2.'); await r.enter();
  assert.deepEqual(r.list().map((l) => l.replace(/ \(you said:.*$/, '')), [EXTEND, 'Move bar 4 one bar left.', 'Move bar 3 one bar left.']);
});

test('Part A/Addendum: the "Kept as line N" message carries the REASON only, never a cut-off piece of the grammar\'s own quoted words (it showed `", "Make it N bars long.", ... but found "swap".).` before the reason when the service is not set up)', async () => {
  const r = rig({ service: lines('x'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say('swap the second and third bars');
  const kept = r.texts().find((x) => /^Kept as line 2/.test(x))!;
  assert.ok(kept !== undefined, r.texts().join(' | '));
  assert.equal(kept, 'Kept as line 2, waiting for a translation. The sentence service is not set up: add its URL and token in Settings → Forge Actions (Beta). Say "Translate line 2." to ask the service again; with the box empty, Cmd/Ctrl+Z takes it back.');
});
test('Part A: a repair mends a typo WITHOUT the service and says so only in the trace (the dialog stays as it was: the repair card); a sentence the service cannot be asked about is traced too', async () => {
  const r = await phraseWithHead(lines('Delete bar 2.')); await r.say('Delet bar 2.');
  assert.equal(r.requests.length, 0); assert.ok(r.traces.some((l) => /service not asked: a repair mends the sentence/.test(l)), r.traces.join(' | '));
  assert.ok(r.texts().some((x) => /^Did you mean: Delete bar 2\?/.test(x)));
});
