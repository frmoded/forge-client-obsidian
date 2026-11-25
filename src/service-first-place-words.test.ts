// 2026-11-21-1015 PART A (driver 2026-11-21 "[7] service first"): `Move bar 4 before bar 2.` and the like (a verb the grammar knows, place words it cannot read) in a phrase composer is asked of the sentence service FIRST when it is set up; its lines are a PLAN
// (shown, never applied at once, each line checked by the grammar as in 1003). The one-place repair of 1002 stays as the FALLBACK when the service is not set up, cannot be reached, or refuses. Real controller, composer and dialog; a faked service.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, phraseWithHead, rig } from './test-support/service-lines-rig.ts';
import { placeWordSentence } from './did-you-mean-core.ts';

// 2026-11-24-1040 (deliberate): `Move bar 4 before bar 2.` is READ by the grammar now (one sentence, one op) and the chain repair is retired, so the service-first flow below is tested with a Move to a place the grammar still cannot read (a reversed range): `Move bars 3 to 1 before bar 5.`
const UNREADABLE = 'Move bars 3 to 1 before bar 5.';

test('placeWordSentence: a Move or Copy of bars with before/after place words, in a phrase only; a plain sentence, a typo and other families are not', () => {
  for (const s of ['Move bar 4 before bar 2.', 'Move bar 2 after bar 5.', 'move bar 4 before bar 2', 'Move bars 2 to 3 before bar 5.', 'Copy bars 1 and 2 after bar 4.']) assert.equal(placeWordSentence(s, 'phrase'), true, s);
  for (const s of ['Move bar 4 one bar left.', 'Delet bar 2.', 'put bar 4 in front of bar 2', 'Move bar 4 before the chorus.', 'Move bar 4 before bar 2. Delete bar 1.', '']) assert.equal(placeWordSentence(s, 'phrase'), false, s);
  assert.equal(placeWordSentence('Move bar 4 before bar 2.', 'arrangement'), false); assert.equal(placeWordSentence('Move bar 4 before bar 2.', 'bar'), false);
});

test('set up and answering two lines: the service is asked FIRST (once), its lines are the plan, nothing is written by the first Enter, and no repair is offered', async () => {
  const r = await phraseWithHead(lines('Move bar 3 one bar right.', 'Move bar 4 one bar left.'));
  await r.say(UNREADABLE);
  assert.equal(r.requests.length, 1, 'the service was asked'); assert.equal(r.requests[0].sentence, UNREADABLE); assert.equal(r.requests[0].mode, 'lines');
  assert.deepEqual(r.list(), [EXTEND], 'a plan, never applied at once');
  assert.equal(r.suggestion(), 'Move bar 3 one bar right. Move bar 4 one bar left.');
  assert.ok(!r.texts().some((t) => /^Did you mean/.test(t)), 'no "Did you mean" next to the plan');
  await r.enter();
  assert.equal(r.list().length, 3); assert.match(r.list()[1], /^Move bar 3 one bar right\./); assert.match(r.list()[2], /^Move bar 4 one bar left\./);
});

test('set up and REFUSING or UNREACHABLE: the service was asked once, there is NO repair any more (the chain is retired), and the sentence is kept waiting', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'I cannot do that with these bars.' } }));
  await r.say(UNREADABLE);
  assert.equal(r.requests.length, 1); assert.ok(!r.texts().some((t) => /^Did you mean/.test(t)), r.texts().join(' | ')); assert.deepEqual(r.list(), [EXTEND, `Waiting: ${UNREADABLE}`]);
  const u = await phraseWithHead(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); }); await u.say(UNREADABLE);
  assert.equal(u.requests.length, 1); assert.ok(!u.texts().some((t) => /^Did you mean/.test(t))); assert.deepEqual(u.list(), [EXTEND, `Waiting: ${UNREADABLE}`]);
});

test('NOT set up: the service is not asked, the dialog says so, and the sentence is kept waiting (no repair)', async () => {
  const r = rig({ service: lines('Move bar 4 one bar left.'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say(UNREADABLE);
  assert.equal(r.requests.length, 0); assert.ok(r.texts().some((t) => /^The sentence service is not set up in this vault, so it was not asked\./.test(t)), r.texts().join(' | ')); assert.ok(!r.texts().some((t) => /^Did you mean/.test(t)));
});

test('a place-word sentence the grammar READS ("Move bars 2 to 3 before bar 5.") needs no service; a typo of a verb is still mended first, and the service is not asked', async () => {
  const r = await phraseWithHead(lines('Move bar 2 one bar right.', 'Move bar 3 one bar right.'));
  await r.say('Move bars 2 to 3 before bar 5.'); assert.equal(r.requests.length, 0); assert.deepEqual(r.list(), [EXTEND, 'Move bars 2 to 3 after bar 4.']);          // 2026-11-24-1040 (deliberate): it was asked of the service
  const q = await phraseWithHead(lines('Delete bar 2.'));
  await q.say('Delet bar 2.'); assert.equal(q.requests.length, 0, 'a typo is mended by the repair, no model call'); assert.ok(q.texts().some((t) => /Did you mean: Delete bar 2/.test(t)), q.texts().join(' | '));
});

// ---- PART B, on the real controller: the driver's words stay beside the lines the repair or the service made -------------------------------------------------------------------------------------------------------
const SAID = ` (you said: ${UNREADABLE})`;
test('B: a service plan applied keeps the driver\'s words on its FIRST line (the second line has none); the dialog says the line with them; a canonical line typed directly has no marker', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say(UNREADABLE); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, `Move bar 4 one bar left.${SAID}`, 'Move bar 3 one bar left.']);
  await r.say('Delete bar 1.'); assert.equal(r.list()[3], 'Delete bar 1.', 'typed canonically: no marker');
});
test('B: undo (Cmd/Ctrl+Z in the empty composer) takes the line and its marker off together, and redo puts them back', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say(UNREADABLE); await r.enter(); assert.equal(r.list().length, 3);
  await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'both lines and the marker are gone');
  await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.deepEqual(r.list(), [EXTEND, `Move bar 4 one bar left.${SAID}`, 'Move bar 3 one bar left.']);
});
test('B: the replay is the same with or without the marker (the Recipe the note writes is byte-identical to the one a clean list gives), and a hand edit that deletes the marker is fine', async () => {
  const a = await phraseWithHead(lines('Move bar 4 one bar left.')); await a.say(UNREADABLE); await a.enter();
  const b = await phraseWithHead(lines('Move bar 4 one bar left.')); await b.say('Move bar 4 one bar left.');
  assert.equal(a.list()[1], `Move bar 4 one bar left.${SAID}`); assert.equal(b.list()[1], 'Move bar 4 one bar left.');
  const body = (t: string) => t.slice(t.indexOf('```'));          // from the first fence down: the Recipe, the Python and the cache
  assert.equal(body(a.store.get('phrases/phrase_001.md')!), body(b.store.get('phrases/phrase_001.md')!), 'the Recipe, the Python and the cache do not depend on the marker');
  const text = a.store.get('phrases/phrase_001.md')!; a.store.set('phrases/phrase_001.md', text.replace(SAID, '')); a.ctl.modified('phrases/phrase_001.md'); await a.ready();
  assert.deepEqual(a.list(), [EXTEND, 'Move bar 4 one bar left.'], 'the marker is gone, the line stays');
});
test('B: the marker carries no token, URL or file name (a sentence with them is cut down before it is kept)', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.'));
  await r.say(`${UNREADABLE.slice(0, -1)} see https://example.com/x?t=1 notes/secret.md`); await r.enter();
  assert.doesNotMatch(r.list()[1] ?? '', /https?:|\.md|secret|example\.com/);
});
