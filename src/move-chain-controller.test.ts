// 2026-11-23-1027 PARTS A and B on the REAL controller, composer and dialog (a faked service; the real model cannot be run): `Move bar 1 after bar 3.` in a 4-bar phrase. 2026-11-24-1040 (deliberate): the grammar READS it now, so A and B are about the single sentence (the chain and its repair card are retired); the Addendum 2 tests use a sentence the grammar cannot read (`Shift bar 4 in front of bar 2`).
//   A  what the dialog shows, in what order, for each behaviour of the service (not set up / a question / lines / a refusal / lines the grammar cannot read / unreachable), and that the service is always SAID to have been asked or not (and why);
//   B  the repair is the whole chain: one Enter writes both sentences, one undo entry takes both away; a move that goes nowhere is refused in words and the service is not asked.
//   Addendum 2 (2): a sentence typed while a WAITING line is in the note asks the service ONCE on entry (against the note before the waiting line), says what it answered and that nothing was added; (3): the same sentence twice says something NEW.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, phraseWithHead, rig } from './test-support/service-lines-rig.ts';

const NOT_SET_UP = /^The sentence service is not set up in this vault, so it was not asked\./;
const after = (texts: string[], from: RegExp): string[] => texts.slice(texts.findIndex((t) => from.test(t)));

// ---- 2026-11-24-1040 (deliberate): `Move bar 1 after bar 3.` is READ by the grammar (one sentence, one op), so the service is not asked and no chain is mended: what these tests said for the chain (A: the dialog for every behaviour of the service; B: one Enter, one undo) is
// said below for the single sentence, and the service-first flow is kept for a Move to a place the grammar still cannot read (`Move bars 3 to 1 after bar 4.`: a reversed range).
const UNREADABLE = 'Move bars 3 to 1 after bar 4.';
const ONE = (said: string) => ` (you said: ${said})`;

test('A: `move bar 1 after bar 3` is ONE line: the grammar reads it, the service is not asked (set up or not), no card and no waiting line (a line the grammar reads has no `you said` marker: that is for a plan or a repair)', async () => {
  for (const configured of [true, false]) {
    const r = rig({ service: lines('x'), drawn: 4, configured }); await r.ready(); r.type(EXTEND); await r.enter();
    await r.say('move bar 1 after bar 3');
    assert.equal(r.requests.length, 0, 'the service is not asked'); assert.deepEqual(r.list(), [EXTEND, 'Move bar 1 after bar 3.'], 'one Enter, one line');
    assert.ok(!r.texts().some((x) => /^Did you mean|not set up|^Asking/.test(x)), r.texts().join(' | '));
  }
});
test('A: the driver\'s sentence `Move bar 1 after bar 5.` in a 5-bar phrase is one line; the others are canonical too', async () => {
  const r = rig({ service: lines('x'), drawn: 5, configured: false }); await r.ready(); r.type('Extend [[bar_005]] to 5 bars, repeating with fills.'); await r.enter();
  await r.say('Move bar 1 after bar 5.'); assert.deepEqual(r.list().slice(1), ['Move bar 1 after bar 5.']); assert.equal(r.requests.length, 0);
  await r.say('Move bars 2 to 3 to the end.'); await r.say('Move bar 5 before bar 1.'); await r.say('Move bar 2 and put it at the start.');
  assert.deepEqual(r.list().slice(1), ['Move bar 1 after bar 5.', 'Move bars 2 to 3 to the end.', 'Move bar 5 to the start.', 'Move bar 2 to the start.']);
});
test('B: ONE undo entry takes the line away, one redo puts it back', async () => {
  const r = rig({ service: lines('x'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say('move bar 1 after bar 3'); assert.equal(r.list().length, 2);
  await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'one undo: the move is gone');
  await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.deepEqual(r.list(), [EXTEND, 'Move bar 1 after bar 3.']);
});
test('B: a move that goes NOWHERE or into its own bars is refused in plain words: no question, the service is not asked, nothing is written, with the service set up or not (the 1027 refusals, now the grammar\'s)', async () => {
  for (const configured of [true, false]) {
    const r = rig({ service: lines('Move bar 2 one bar right.'), drawn: 4, configured }); await r.ready(); r.type(EXTEND); await r.enter();
    await r.say('Move bar 2 before bar 3.');
    assert.equal(r.requests.length, 0, 'the service is not asked'); assert.ok(r.texts().some((x) => /Bar 2 is part of the bars you are moving\.$/.test(x)), r.texts().join(' | '));
    assert.ok(!r.texts().some((x) => /^The service asks|^Did you mean|not set up/.test(x)), 'no question, no card'); assert.deepEqual(r.list(), [EXTEND]);
    await r.say('Move bar 3 before bar 3.'); assert.ok(r.texts().some((x) => /Bar 3 is already after bar 2\.$/.test(x)), r.texts().join(' | ')); assert.equal(r.requests.length, 0);
    await r.say('Move bar 1 to the start.'); assert.ok(r.texts().some((x) => /Bar 1 is already at the start\.$/.test(x)), r.texts().join(' | ')); assert.deepEqual(r.list(), [EXTEND]);
  }
});

// ---- PART B through the real composer: the driver's own failing sentence ---------------------------------------------------------------------------------------------------------------------------------------
test('B: the driver\'s sentence `morph bar 1 and 5 across 5 bars and place after bar 5` is read (it was refused at column 33 with `but found "and"`): one line, the canonical Morph step, the service is not asked', async () => {
  const r = rig({ service: lines('x'), drawn: 5, configured: true }); await r.ready(); r.type('Extend [[bar_005]] to 5 bars, repeating with fills.'); await r.enter();
  await r.say('morph bar 1 and 5 across 5 bars and place after bar 5');
  assert.equal(r.requests.length, 0); assert.deepEqual(r.list().slice(1), ['Morph bars 1 and 5 across 5 bars, in musical order, and put them after bar 5.']);
  assert.ok(!r.texts().some((x) => /did not accept/.test(x)), r.texts().join(' | '));
  await r.press({ key: 'z', metaKey: true }); assert.equal(r.list().length, 1, 'one undo takes it away');
});
test('B: a Morph step that is almost right says what is missing, in words, in the dialog (`and place` with no place)', async () => {
  const r = rig({ service: lines('x'), drawn: 5, configured: false }); await r.ready(); r.type('Extend [[bar_005]] to 5 bars, repeating with fills.'); await r.enter();
  await r.say('morph bar 1 and 5 across 5 bars and place');
  assert.ok(r.texts().some((x) => /Expected a place \("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end"\), but found the end of the sentence\./.test(x)), r.texts().join(' | ')); assert.deepEqual(r.list().slice(1), ['Waiting: morph bar 1 and 5 across 5 bars and place'], 'nothing is guessed: kept waiting, the words the person said');
});

// ---- the service-first flow stays for a Move to a place the grammar cannot read ------------------------------------------------------------------------------------------------------------------------------
test('A: a Move to a place the grammar CANNOT read is asked of the service FIRST (once); its lines are the plan and one Enter writes them', async () => {
  const r = await phraseWithHead(lines('Move bar 3 after bar 4.'));
  await r.say(UNREADABLE); assert.equal(r.requests.length, 1); assert.equal(r.requests[0].sentence, UNREADABLE); assert.equal(r.suggestion(), 'Move bar 3 after bar 4.');
  assert.ok(!r.texts().some((x) => /^Did you mean/.test(x))); await r.enter(); assert.deepEqual(r.list(), [EXTEND, `Move bar 3 after bar 4.${ONE(UNREADABLE)}`]);
});
test('A: the service ASKS A QUESTION, REFUSES, answers LINES THE GRAMMAR CANNOT READ or is UNREACHABLE: its words are said, nothing is mended (the chain repair is retired), and the sentence is kept waiting', async () => {
  const q = await phraseWithHead(async () => ({ status: 200, json: { ok: true, lines: null, question: 'Which bars?' } })); await q.say(UNREADABLE);
  assert.ok(q.texts().includes('The service asks: Which bars?'), q.texts().join(' | ')); assert.ok(!q.texts().some((x) => /^Did you mean/.test(x)));
  const f = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'No.', lines: null, question: null } })); await f.say(UNREADABLE);
  assert.ok(f.texts().includes('The service refused: No.'), f.texts().join(' | ')); assert.deepEqual(f.list(), [EXTEND, `Waiting: ${UNREADABLE}`]);
  const g = await phraseWithHead(lines('Shuffle bar 1 around.')); await g.say(UNREADABLE);
  assert.ok(g.texts().some((x) => /^The service refused: The service answered, but I could not use any line of it: "Shuffle bar 1 around\."/.test(x)), g.texts().join(' | '));
  const u = await phraseWithHead(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); }); await u.say(UNREADABLE);
  assert.ok(u.texts().some((x) => /^The service refused: Could not reach the transpile service/.test(x)), u.texts().join(' | '));
  const n = rig({ service: lines('x'), drawn: 4, configured: false }); await n.ready(); n.type(EXTEND); await n.enter(); await n.say(UNREADABLE);
  assert.equal(n.requests.length, 0); assert.ok(n.texts().some((x) => NOT_SET_UP.test(x)), n.texts().join(' | '));
});
// 2026-11-24-1036 (deliberate): Copy now has place words (`Copy bar 1 and put it after bar 3.`), so `Copy bar 1 after bar 3.` is a sentence the GRAMMAR reads (the copy is put after bar 3): it was asked of the service first, had no repair and was kept waiting (1027). The chain-of-moves idea is still wrong for Copy.
test('B: `Copy bar 1 after bar 3.` is read by the grammar (the copy is PUT after bar 3), the service is not asked, there is no repair; a Copy the grammar still cannot read is asked of the service first and kept waiting', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'no' } }));
  await r.say('Copy bar 1 after bar 3.'); assert.equal(r.requests.length, 0); assert.ok(!r.texts().some((x) => /^Did you mean/.test(x)), r.texts().join(' | ')); assert.deepEqual(r.list(), [EXTEND, 'Copy bar 1 and put it after bar 3.']);
  await r.say('Copy bars 3 to 1 after bar 4.'); assert.equal(r.requests.length, 1); assert.deepEqual(r.list(), [EXTEND, 'Copy bar 1 and put it after bar 3.', 'Waiting: Copy bars 3 to 1 after bar 4.']);
});

// ---- ADDENDUM 2 (2) and (3): a waiting line in the note ---------------------------------------------------------------------------------------------------------------------------------------------
/** The driver's retest: `swap the second and third bars` is refused and kept as line 2; then `Shift bar 4 in front of bar 2`. The service answers per call: swap = refuse, then whatever `next` says. */
const swapThenMove = async (next: (n: number) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>) => {
  let n = 0; const r = await phraseWithHead(async () => (n++ === 0 ? { status: 200, json: { ok: false, error: 'This note kind can only extend, mix, morph, take, thin out, double up, keep, delete, copy, move, replace bars, set threshold, add ghost notes, or change tempo.', lines: null, question: null } } : next(n)));
  await r.say('swap the second and third bars'); assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars']); assert.equal(r.requests.length, 1);
  return r;
};
test('Addendum 2 (2): the sentence typed after a waiting line ASKS THE SERVICE ONCE and the dialog says what it answered and that nothing was added (it was never asked before: the dialog said only "Line 2 is waiting")', async () => {
  const r = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] } }));
  const mark = r.texts().length;
  await r.say('Shift bar 4 in front of bar 2');
  assert.equal(r.requests.length, 2, 'the service was asked once on entry'); assert.equal(r.requests[1].sentence, 'Shift bar 4 in front of bar 2');
  assert.deepEqual((r.requests[1] as { list: string[] }).list, [EXTEND], 'it is asked against the note as it is BEFORE the waiting line (the waiting words are not part of the request)');
  const t = r.texts().slice(mark); assert.ok(t.includes('Asking the sentence service...'), t.join(' | '));
  assert.ok(t.some((x) => x === 'Line 2 is waiting for a translation, so "Shift bar 4 in front of bar 2" was not added. The service would write it as: Move bar 4 one bar left. Move bar 3 one bar left. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), t.join(' | '));
  assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars'], 'nothing was written');
});
test('Addendum 2 (3): the SAME sentence twice does not repeat itself: the second time says line 2 is already waiting, and the service is not asked again', async () => {
  const r = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'] } }));
  await r.say('Shift bar 4 in front of bar 2'); const mark = r.texts().length; await r.say('Shift bar 4 in front of bar 2');
  assert.equal(r.requests.length, 2, 'not asked again'); const t = r.texts().slice(mark);
  assert.deepEqual(t.filter((x) => !/^Shift bar 4 in front of bar 2$/.test(x)), ['Line 2 is already waiting; say "Translate line 2."'], t.join(' | '));
  const lineTwo = r.texts().filter((x) => /^Line 2 is/.test(x)); assert.equal(lineTwo.length, 2); assert.notEqual(lineTwo[0], lineTwo[1], 'the second entry says something NEW, not the same line again');
});
test('Addendum 2 (2): the service REFUSES or ASKS for the sentence after a waiting line: its words are in the dialog beside the fact that nothing was added; a different sentence is asked again', async () => {
  const a = await swapThenMove(() => ({ status: 200, json: { ok: false, error: 'No.', lines: null, question: null } })); await a.say('Shift bar 4 in front of bar 2');
  assert.ok(a.texts().some((x) => x === 'Line 2 is waiting for a translation, so "Shift bar 4 in front of bar 2" was not added. The service refused: No. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), a.texts().join(' | '));
  const q = await swapThenMove(() => ({ status: 200, json: { ok: true, lines: null, question: 'Which bar?' } })); await q.say('Shift bar 4 in front of bar 2');
  assert.ok(q.texts().some((x) => /so "Shift bar 4 in front of bar 2" was not added\. The service asks: Which bar\? Say "Translate line 2\."/.test(x)), q.texts().join(' | '));
  await q.say('Shift bar 3 in front of bar 1'); assert.equal(q.requests.length, 3, 'another sentence is another ask');
});
test('Addendum 2 (2): blocked by a waiting line and the service NOT set up, or a sentence the grammar reads: said, with the reason the service was not asked', async () => {
  const off = rig({ service: lines('x'), drawn: 4, configured: false }); await off.ready(); off.type(EXTEND); await off.enter();
  await off.say('swap the second and third bars'); await off.say('Shift bar 4 in front of bar 2');
  assert.ok(off.texts().some((x) => x === 'Line 2 is waiting for a translation, so "Shift bar 4 in front of bar 2" was not added. The sentence service was not asked: it is not set up in this vault. Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.'), off.texts().join(' | '));
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
