// 2026-11-24-1033 on the REAL controller, composer and dialog (a faked service; the real model cannot be run): the driver typed `please duplicate [[bar_007]]` in a phrase whose list already held a WAITING line 2, and the SERVICE refused ("cannot duplicate a single bar").
//   A  what happens today, in order (the old path is kept when the Score does not say which note made each bar): asked once, refused, kept as a waiting line; and the one-step ways out of a waiting line
//   B  the client says it without the model: `Copy bar K.` for the position the drawn Score gives the bar (one Enter, one undo entry); several positions = ask which; none = `Bar 007 is not in this phrase.`; a waiting line = the sentence is not added but the dialog says what it WOULD write
//   C  the request carries `bar_names` (same length as `bar_numbers`) when the Score says them, and nothing more when it does not
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, rig } from './test-support/service-lines-rig.ts';

const REFUSE = 'This note kind can copy, move, extend, or take phrases, but cannot duplicate a single bar.';
const refuse = async () => ({ status: 200, json: { ok: false, error: REFUSE, lines: null, question: null } });
const N4 = ['bar_005', 'bar_007', 'bar_005', 'bar_012'];                                   // the Score of the note below: bar 2 is bar_007
const N2 = ['bar_005', 'bar_005', 'bar_007', 'bar_007'];
const withNames = async (names: Array<string | null> | undefined, service = refuse, configured = true) => { const r = rig({ service, drawn: 4, configured, ...(names !== undefined ? { names } : {}) }); await r.ready(); r.type(EXTEND); await r.enter(); assert.deepEqual(r.list(), [EXTEND]); return r; };
const waiting = (r: Awaited<ReturnType<typeof withNames>>) => r.list().filter((l) => /^Waiting:/.test(l));
const TAIL = 'Say "Translate line 2." first (with the box empty, Cmd/Ctrl+Z takes line 2 back), then say it again.';

// ---- A ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('A: the driver\'s dialog, in order, when the Score gives no names (the old path stays): the grammar line, `Asking...`, the service\'s refusal, then the sentence is KEPT as waiting line 2', async () => {
  const r = await withNames(undefined);
  await r.say('please duplicate [[bar_007]]');
  const t = r.texts(), i = t.findIndex((x) => /^The grammar did not accept this sentence/.test(x));
  assert.ok(i >= 0, t.join(' | ')); assert.deepEqual(t.slice(i + 1, i + 3), ['Asking the sentence service...', `The service refused: ${REFUSE}`]);
  assert.equal(r.requests.length, 1); assert.ok(!('bar_names' in r.requests[0]), 'no names are sent when the Score has none');
  assert.equal(waiting(r).length, 1, 'line 2 waits'); assert.match(r.list()[1], /^Waiting: please duplicate/);
});
test('A: the way out of a waiting line today, in ONE step: Cmd/Ctrl+Z with the box empty takes line 2 back; and the typed word `Undo`', async () => {
  const a = await withNames(undefined); await a.say('please duplicate [[bar_007]]'); assert.equal(waiting(a).length, 1);
  a.type(''); await a.press({ key: 'z', metaKey: true }); assert.deepEqual(a.list(), [EXTEND], 'Cmd+Z (box empty) takes the waiting line back');
  const b = await withNames(undefined); await b.say('please duplicate [[bar_007]]'); assert.equal(waiting(b).length, 1);
  await b.say('Undo'); await b.enter(); assert.deepEqual(b.list(), [EXTEND], `the one spoken word: ${b.texts().slice(-3).join(' | ')}`);
});
test('A: `Duplicate [[bar_007]].` (exactly, no politeness word) is the 0992 ACTION that makes a new note: it is NOT a step of the list, and this drain leaves it alone (the service is not asked, nothing is added to the list, no `Copy bar` is offered)', async () => {
  const r = await withNames(N4); await r.say('Duplicate [[bar_007]].');
  assert.equal(r.requests.length, 0); assert.deepEqual(r.list(), [EXTEND]); assert.ok(!r.texts().some((x) => /Copy bar/.test(x)), r.texts().join(' | '));
});

// ---- B ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('B: ONE position: the service is NOT asked, the card says `Copy bar 2.` and why; the first Enter writes nothing; the second writes one line that keeps the driver\'s words; ONE undo entry takes it away', async () => {
  for (const said of ['please duplicate [[bar_007]]', 'Copy [[bar_007]].', 'Please duplicate [[bar_007]].', 'duplicate [[bar_007]] please']) {
    const r = await withNames(N4); const mark = r.texts().length;
    await r.say(said);
    if (/^duplicate \[\[bar_007\]\] please$/.test(said)) { assert.equal(r.requests.length, 0); continue; }                // 0992 owns a sentence that STARTS with Duplicate (it refuses this one in its own words); not changed here
    assert.equal(r.requests.length, 0, `${said}: no service call`);
    const t = r.texts().slice(mark); assert.ok(t.includes('Did you mean: Copy bar 2? bar_007 is bar 2 of this phrase.'), `${said}: ${t.join(' | ')}`);
    assert.ok(!t.some((x) => /^Asking the sentence service|^The service|^The grammar did not accept/.test(x)), `${said}: nothing about the service or the grammar's refusal: ${t.join(' | ')}`);
    assert.deepEqual(r.list(), [EXTEND], 'the first Enter writes nothing'); await r.enter();
    assert.equal(r.list().length, 2, said); assert.match(r.list()[1], /^Copy bar 2\. \(you said: .*bar_007.*\)$/, said); assert.equal(waiting(r).length, 0);
    r.type(''); await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'one undo entry'); await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.equal(r.list().length, 2, 'one redo');
  }
});
test('B: the service is not set up: the sentence is still said (the service was never needed), and no notice about the service is made up', async () => {
  const r = await withNames(N4, refuse, false); await r.say('please duplicate [[bar_007]]');
  assert.equal(r.requests.length, 0); assert.ok(r.texts().includes('Did you mean: Copy bar 2? bar_007 is bar 2 of this phrase.'), r.texts().join(' | ')); assert.ok(!r.texts().some((x) => /not set up/.test(x)), r.texts().join(' | '));
});
test('B: SEVERAL positions: it asks which, in words, never guesses; nothing is written, no waiting line, the service is not asked', async () => {
  const r = await withNames(N2); await r.say('please duplicate [[bar_007]]');
  assert.equal(r.requests.length, 0); assert.ok(r.texts().includes('Bar 007 is bars 3 and 4 of this phrase: which one? Say Copy bar 3. or Copy bar 4.'), r.texts().join(' | '));
  assert.ok(!r.texts().some((x) => /^Did you mean/.test(x))); assert.deepEqual(r.list(), [EXTEND], 'nothing written, no waiting line');
  await r.say('Copy bar 4.'); await r.enter(); assert.match(r.list()[1], /^Copy bar 4\./, 'the answer the driver gives is a sentence the grammar reads');
});
test('B: the bar is NOT in the phrase: `Bar 007 is not in this phrase.` in words; nothing written, no waiting line, the service is not asked (set up or not)', async () => {
  for (const configured of [true, false]) {
    const r = await withNames(['bar_005', 'bar_005', 'bar_005', 'bar_005'], refuse, configured);
    await r.say('please duplicate [[bar_007]]'); await r.say('Copy [[bar_007]].');
    assert.equal(r.requests.length, 0); assert.equal(r.texts().filter((x) => x === 'Bar 007 is not in this phrase.').length, 2, r.texts().join(' | ')); assert.deepEqual(r.list(), [EXTEND]);
  }
});
test('B: a WAITING line is in the note: the sentence is not added (the 1015 contract), the service is NOT asked, and the dialog says what it WOULD write (or why it cannot)', async () => {
  const r = await withNames(N4, refuse); await r.say('swap the second and third bars'); assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars']); const asked = r.requests.length;
  await r.say('please duplicate [[bar_007]]');
  assert.equal(r.requests.length, asked, 'no new service call');
  assert.ok(r.texts().includes(`Line 2 is waiting for a translation, so "please duplicate [[bar_007]]" was not added. bar_007 is bar 2 of this phrase, so it would write: Copy bar 2. ${TAIL}`), r.texts().join(' | '));
  assert.deepEqual(r.list(), [EXTEND, 'Waiting: swap the second and third bars'], 'nothing written');
  await r.say('Copy [[bar_999]].'); assert.ok(r.texts().includes(`Line 2 is waiting for a translation, so "Copy [[bar_999]]." was not added. Bar 999 is not in this phrase. ${TAIL}`), r.texts().join(' | '));
  assert.equal(r.requests.length, asked);
});
test('B: a waiting line and a bar at SEVERAL positions: the question is asked in words, nothing added', async () => {
  const r = await withNames(N2); await r.say('swap the second and third bars'); await r.say('Copy [[bar_007]].');
  assert.ok(r.texts().includes(`Line 2 is waiting for a translation, so "Copy [[bar_007]]." was not added. Bar 007 is bars 3 and 4 of this phrase: which one? Say Copy bar 3. or Copy bar 4. ${TAIL}`), r.texts().join(' | '));
});
test('B: after the waiting line is taken back, the same sentence goes through (the way out works)', async () => {
  const r = await withNames(N4); await r.say('swap the second and third bars'); await r.say('please duplicate [[bar_007]]');
  r.type(''); await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND]); await r.say('please duplicate [[bar_007]]'); await r.enter(); assert.match(r.list()[1], /^Copy bar 2\./);
});
test('B: a Score that gives NO names (unknown) or a name for only some bars: the sentence goes the old way (the service is asked, with no bar_names)', async () => {
  for (const names of [undefined, ['bar_005', null, 'bar_005', 'bar_005'] as Array<string | null>]) {
    const r = await withNames(names, lines('Copy bar 2.')); await r.say('please duplicate [[bar_007]]');
    assert.equal(r.requests.length, 1); assert.ok(!('bar_names' in r.requests[0]), JSON.stringify(r.requests[0])); assert.equal(r.suggestion(), 'Copy bar 2.');
  }
});
test('B: a sentence for another kind of note is not read (P3: a phrase only)', async () => {
  const r = rig({ path: 'arrangements/arr_001.md', service: refuse, drawn: 4, names: N4 }); await r.ready(); await r.say('please duplicate [[bar_007]]');
  assert.ok(!r.texts().some((x) => /Copy bar|Did you mean/.test(x)), r.texts().join(' | '));
});

// ---- C ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('C: a sentence the service IS asked about carries `bar_names`, one per drawn bar, as long as `bar_numbers`', async () => {
  const r = await withNames(N4, lines('Delete bar 1.')); await r.say('make the second bar disappear');
  assert.equal(r.requests.length, 1); const q = r.requests[0] as { bar_names?: string[]; bar_numbers: number[] };
  assert.deepEqual(q.bar_names, N4); assert.equal(q.bar_names!.length, q.bar_numbers.length); assert.deepEqual(q.bar_numbers, [1, 2, 3, 4]);
});
