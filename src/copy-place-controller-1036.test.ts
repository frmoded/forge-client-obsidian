// 2026-11-24-1036 on the REAL controller, composer and dialog (a faked service; the real model cannot be run): the driver typed `Make a copy of [[bar_006]] at the end of score (after [[bar_0012]]` in a phrase composer and got the grammar's refusal, `Asking the sentence service...`,
// `The service refused: This phrase note kind cannot place bars at specific score positions; it can only copy bars within the phrase.` and `Kept as line 2, waiting for a translation.`
//   A  what the table sent to the service says now (the Copy row for a place), and the old path when the Score gives no names (the service is asked, with the new row)
//   B  the client says it without the model: the card `Did you mean: Copy bar 6 and put it at the end?`, one Enter to preview, one Enter to write, ONE undo entry; the grammar's own sentences too
//   C  a link the phrase does not hold: refused in words naming it, nothing written, no waiting line, the service not asked (set up or not); a bar at several positions: asks which
//   D  a waiting line is in the note: the sentence is not added (the 1015 contract), the dialog says what it WOULD write
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, rig } from './test-support/service-lines-rig.ts';

const REFUSE = 'This phrase note kind cannot place bars at specific score positions; it can only copy bars within the phrase.';
const refuse = async () => ({ status: 200, json: { ok: false, error: REFUSE, lines: null, question: null } });
const N12 = Array.from({ length: 12 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);          // a 12-bar Score: bar K is bar_00K
const DRIVER = 'Make a copy of [[bar_006]] at the end of score (after [[bar_0012]]';
const FREE = 'Make a copy of [[bar_006]] at the end of the score.';
const CARD = 'Did you mean: Copy bar 6 and put it at the end? bar_006 is bar 6 of this phrase.';
const TAIL = 'Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.';
const phrase = async (opts: { names?: Array<string | null>; service?: Parameters<typeof rig>[0]['service']; configured?: boolean; drawn?: number } = {}) => {
  const r = rig({ service: opts.service ?? refuse, drawn: opts.drawn ?? 12, configured: opts.configured ?? true, ...(opts.names !== undefined ? { names: opts.names } : {}) });
  await r.ready(); r.type(EXTEND); await r.enter(); assert.deepEqual(r.list(), [EXTEND]); return r;
};
const waiting = (r: Awaited<ReturnType<typeof phrase>>) => r.list().filter((l) => /^Waiting:/.test(l));

// ---- A ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('A: the driver\'s dialog when the Score gives no names (the old path is kept): the grammar line, `Asking...`, the service\'s refusal, kept as waiting line 2; the table now carries BOTH Copy rows', async () => {
  const r = await phrase({});
  await r.say(DRIVER);
  const t = r.texts(), i = t.findIndex((x) => /^The grammar did not accept this sentence/.test(x));
  assert.ok(i >= 0, t.join(' | ')); assert.deepEqual(t.slice(i + 1, i + 3), ['Asking the sentence service...', `The service refused: ${REFUSE}`]);
  assert.equal(r.requests.length, 1); const grammar = (r.requests[0] as { grammar: string[] }).grammar;
  assert.ok(grammar.includes('copy: Copy bars 3 to 5.'), 'the old Copy row'); assert.ok(grammar.includes('copy to a place: Copy bar 6 and put it at the end.'), `the new Copy row: ${grammar.join(' | ')}`);
  assert.equal(waiting(r).length, 1);
});
test('A: with the new row in the table, a service that follows it answers the driver\'s sentence with ONE canonical line, and the plugin checks it with the grammar (a Copy with a place)', async () => {
  const r = await phrase({ service: lines('Copy bar 6 and put it at the end.') });
  await r.say('Put it in a second copy of that sixth bar, last please');
  assert.equal(r.requests.length, 1); assert.equal(r.suggestion(), 'Copy bar 6 and put it at the end.'); await r.enter(); assert.match(r.list()[1], /^Copy bar 6 and put it at the end\./);
});

// ---- B ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('B: the free words with a link: the service is NOT asked; the card says the grammar\'s sentence and why; the first Enter writes nothing; the second writes ONE line that keeps the driver\'s words; ONE undo entry takes it away', async () => {
  for (const said of [FREE, 'put a copy of [[bar_006]] after the last bar', 'Copy [[bar_006]] to the end of the score.', 'Make a copy of [[bar_006]] and put it at the end.']) {
    const r = await phrase({ names: N12 }); const mark = r.texts().length;
    await r.say(said);
    assert.equal(r.requests.length, 0, `${said}: no service call`);
    const t = r.texts().slice(mark); assert.ok(t.includes(CARD), `${said}: ${t.join(' | ')}`);
    assert.ok(!t.some((x) => /^Asking the sentence service|^The service|^The grammar did not accept/.test(x)), `${said}: nothing about the service or the grammar's refusal: ${t.join(' | ')}`);
    assert.deepEqual(r.list(), [EXTEND], 'the first Enter writes nothing'); await r.enter();
    assert.equal(r.list().length, 2, said); assert.match(r.list()[1], /^Copy bar 6 and put it at the end\. \(you said: .*bar_006.*\)$/, said); assert.equal(waiting(r).length, 0);
    r.type(''); await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'one undo entry'); await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.equal(r.list().length, 2, 'one redo');
  }
});
test('B: every place of the closed list, by link and by number: the line written is the grammar\'s canonical sentence', async () => {
  for (const [said, written] of [['Make a copy of [[bar_006]] at the start of the score.', 'Copy bar 6 and put it at the start.'], ['Make a copy of [[bar_006]] after [[bar_012]].', 'Copy bar 6 and put it after bar 12.'], ['Make a copy of [[bar_006]] before [[bar_002]].', 'Copy bar 6 and put it after bar 1.'],
    ['Make a copy of bars 3 to 5 at the end of the score.', 'Copy bars 3 to 5 and put them at the end.'], ['Put a copy of bar 6 after the last bar.', 'Copy bar 6 and put it at the end.']] as const) {
    const r = await phrase({ names: N12 }); await r.say(said); assert.equal(r.requests.length, 0, said); await r.enter();
    assert.match(r.list()[1], new RegExp(`^${written.replace(/[.]/g, '\\.')} \\(you said: `), `${said}: ${r.list()[1]}`);
  }
});
test('B: bar NUMBERS in free words need no names from the Score (a Score that says nothing): the card is still offered, the service is not asked', async () => {
  const r = await phrase({}); await r.say('Make a copy of bar 6 at the end of the score.');
  assert.equal(r.requests.length, 0); assert.ok(r.texts().includes('Did you mean: Copy bar 6 and put it at the end?'), r.texts().join(' | ')); await r.enter(); assert.match(r.list()[1], /^Copy bar 6 and put it at the end\./);
});
test('B: the service is not set up: the sentence is still said (the service was never needed), and no notice about the service is made up', async () => {
  const r = await phrase({ names: N12, configured: false }); await r.say(FREE);
  assert.equal(r.requests.length, 0); assert.ok(r.texts().includes(CARD), r.texts().join(' | ')); assert.ok(!r.texts().some((x) => /not set up/.test(x)), r.texts().join(' | '));
});
test('B: the grammar\'s OWN sentences: ONE Enter writes the one line (the grammar reads it: no card); the old Copy sentences write exactly what they wrote', async () => {
  for (const [said, written] of [['Copy bar 6 and put it at the end.', 'Copy bar 6 and put it at the end.'], ['Copy bars 3 to 5 and put them at the start.', 'Copy bars 3 to 5 and put them at the start.'], ['Copy bar 6 before bar 2.', 'Copy bar 6 and put it after bar 1.'], ['Copy bar 6 at the end.', 'Copy bar 6 and put it at the end.'],
    ['Copy bar 3.', 'Copy bar 3.'], ['Copy bars 3 to 5.', 'Copy bars 3 to 5.'], ['Duplicate bar 3.', 'Copy bar 3.']] as const) {
    const r = await phrase({ names: N12 }); await r.say(said);
    assert.equal(r.requests.length, 0, `${said}: the grammar reads it, the service is not asked`); assert.ok(!r.texts().some((x) => /^Did you mean|^The grammar did not accept/.test(x)), `${said}: ${r.texts().join(' | ')}`);
    assert.equal(r.list().length, 2, `${said}: a sentence the grammar reads is applied at once (the rig's auto-apply): ONE Enter`); assert.equal(r.list()[1], written, said);
    r.type(''); await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], `${said}: ONE undo entry`);
  }
});
test('B: `Copy bar 1 after bar 3.` was asked of the service first and kept waiting (1027); now the grammar reads it (the new meaning: the copy is PUT after bar 3), the service is not asked', async () => {
  const r = await phrase({ service: async () => ({ status: 200, json: { ok: false, error: 'no' } }) });
  await r.say('Copy bar 1 after bar 3.'); assert.equal(r.requests.length, 0); assert.equal(r.list()[1], 'Copy bar 1 and put it after bar 3.');
});

// ---- C ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('C: the driver\'s own sentence with a Score that names its bars: `There is no bar named bar_0012.`; nothing written, no waiting line, the service is NOT asked (set up or not)', async () => {
  for (const configured of [true, false]) {
    const r = await phrase({ names: N12, configured }); const mark = r.texts().length;
    await r.say(DRIVER);
    assert.equal(r.requests.length, 0, 'the service is not asked'); assert.ok(r.texts().slice(mark).includes('There is no bar named bar_0012.'), r.texts().slice(mark).join(' | '));
    assert.ok(!r.texts().slice(mark).some((x) => /^Asking|^The service|^Did you mean|not set up/.test(x)), r.texts().slice(mark).join(' | ')); assert.deepEqual(r.list(), [EXTEND], 'nothing written, no waiting line');
    await r.enter(); assert.deepEqual(r.list(), [EXTEND], 'Enter writes nothing either');
  }
});
test('C: the same sentence with the link the driver meant (`bar_012`) and the parenthesis closed is not read by the closed list (the service handles the rest); the bare unknown link of a plain Copy keeps its 1033 words', async () => {
  const r = await phrase({ names: N12, service: lines('Copy bar 6 and put it at the end.') }); await r.say('Make a copy of [[bar_006]] at the end of score (after [[bar_012]])');
  assert.equal(r.requests.length, 1, 'a parenthetical is outside the closed list: the service is asked'); assert.equal(r.suggestion(), 'Copy bar 6 and put it at the end.');
  const q = await phrase({ names: N12 }); await q.say('please duplicate [[bar_999]]'); assert.ok(q.texts().includes('Bar 999 is not in this phrase.'), q.texts().join(' | ')); assert.equal(q.requests.length, 0);
});
test('C: the copied bar is not in the phrase: the link is named; a place link that is not: the link is named; several positions: ask which, nothing written', async () => {
  const r = await phrase({ names: N12 });
  await r.say('Make a copy of [[bar_777]] at the end of the score.'); assert.ok(r.texts().includes('There is no bar named bar_777.'), r.texts().join(' | '));
  await r.say('Make a copy of [[bar_006]] after [[bar_555]].'); assert.ok(r.texts().includes('There is no bar named bar_555.'), r.texts().join(' | '));
  assert.equal(r.requests.length, 0); assert.deepEqual(r.list(), [EXTEND]);
  const two = await phrase({ names: ['bar_005', 'bar_007', 'bar_005', 'bar_012'], drawn: 4 }); await two.say('Make a copy of [[bar_005]] at the end of the score.');
  assert.ok(two.texts().includes('Bar 005 is bars 1 and 3 of this phrase: which one? Say Copy bar 1. or Copy bar 3.'), two.texts().join(' | ')); assert.equal(two.requests.length, 0); assert.deepEqual(two.list(), [EXTEND]);
  await two.say('Copy bar 3 and put it at the end.'); await two.enter(); assert.match(two.list()[1], /^Copy bar 3 and put it at the end\./, 'the answer the driver gives is a sentence the grammar reads');
});
test('C: another kind of note is not read (P3: a phrase only)', async () => {
  const r = rig({ path: 'arrangements/arr_001.md', service: refuse, drawn: 12, names: N12 }); await r.ready(); await r.say(FREE);
  assert.ok(!r.texts().some((x) => /Copy bar 6|Did you mean|There is no bar named/.test(x)), r.texts().join(' | '));
});

// ---- D ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('D: a WAITING line is in the note: the sentence is not added (1015), the service is NOT asked, and the dialog says what it WOULD write; an unknown link says so', async () => {
  const r = await phrase({ names: N12 }); await r.say('swap the second and third bars'); assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars']); const asked = r.requests.length;
  await r.say(FREE);
  assert.equal(r.requests.length, asked, 'no new service call');
  assert.ok(r.texts().includes(`Line 2 is waiting for a translation, so "${FREE}" was not added. bar_006 is bar 6 of this phrase, so it would write: Copy bar 6 and put it at the end. ${TAIL}`), r.texts().join(' | '));
  await r.say(DRIVER); assert.ok(r.texts().includes(`Line 2 is waiting for a translation, so "${DRIVER}" was not added. There is no bar named bar_0012. ${TAIL}`), r.texts().join(' | '));
  assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars'], 'nothing written'); assert.equal(r.requests.length, asked);
});
