// 2026-11-21-1015 PART A (driver 2026-11-21 "[7] service first"): `Move bar 4 before bar 2.` and the like (a verb the grammar knows, place words it cannot read) in a phrase composer is asked of the sentence service FIRST when it is set up; its lines are a PLAN
// (shown, never applied at once, each line checked by the grammar as in 1003). The one-place repair of 1002 stays as the FALLBACK when the service is not set up, cannot be reached, or refuses. Real controller, composer and dialog; a faked service.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, phraseWithHead, rig } from './test-support/service-lines-rig.ts';
import { placeWordSentence } from './did-you-mean-core.ts';

const REPAIR_CARD = /Did you mean: Move bar 4 one bar left\?/;

test('placeWordSentence: a Move or Copy of bars with before/after place words, in a phrase only; a plain sentence, a typo and other families are not', () => {
  for (const s of ['Move bar 4 before bar 2.', 'Move bar 2 after bar 5.', 'move bar 4 before bar 2', 'Move bars 2 to 3 before bar 5.', 'Copy bars 1 and 2 after bar 4.']) assert.equal(placeWordSentence(s, 'phrase'), true, s);
  for (const s of ['Move bar 4 one bar left.', 'Delet bar 2.', 'put bar 4 in front of bar 2', 'Move bar 4 before the chorus.', 'Move bar 4 before bar 2. Delete bar 1.', '']) assert.equal(placeWordSentence(s, 'phrase'), false, s);
  assert.equal(placeWordSentence('Move bar 4 before bar 2.', 'arrangement'), false); assert.equal(placeWordSentence('Move bar 4 before bar 2.', 'bar'), false);
});

test('set up and answering two lines: the service is asked FIRST (once), its lines are the plan, nothing is written by the first Enter, and the repair is not offered', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say('Move bar 4 before bar 2.');
  assert.equal(r.requests.length, 1, 'the service was asked'); assert.equal(r.requests[0].sentence, 'Move bar 4 before bar 2.'); assert.equal(r.requests[0].mode, 'lines');
  assert.deepEqual(r.list(), [EXTEND], 'a plan, never applied at once');
  assert.equal(r.suggestion(), 'Move bar 4 one bar left. Move bar 3 one bar left.');
  assert.ok(!r.texts().some((t) => REPAIR_CARD.test(t)), 'no "Did you mean" next to the plan');
  await r.enter();
  assert.equal(r.list().length, 3); assert.match(r.list()[1], /^Move bar 4 one bar left\./); assert.match(r.list()[2], /^Move bar 3 one bar left\./);
});

test('set up and REFUSING: the one-place repair is the fallback (the service was asked once, the person sees "Did you mean" and Enter applies it)', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'I cannot do that with these bars.' } }));
  await r.say('Move bar 4 before bar 2.');
  assert.equal(r.requests.length, 1); assert.ok(r.texts().some((t) => REPAIR_CARD.test(t)), r.texts().join(' | '));
  assert.deepEqual(r.list(), [EXTEND]); await r.enter(); assert.match(r.list()[1] ?? '', /^Move bar 4 one bar left\./);
});

test('set up but UNREACHABLE (the call throws): the repair is the fallback', async () => {
  const r = await phraseWithHead(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); });
  await r.say('Move bar 4 before bar 2.');
  assert.equal(r.requests.length, 1); assert.ok(r.texts().some((t) => REPAIR_CARD.test(t)), r.texts().join(' | '));
});

test('NOT set up: the service is not asked and the repair is offered, as before 1003', async () => {
  const r = rig({ service: lines('Move bar 4 one bar left.'), drawn: 4, configured: false }); await r.ready(); r.type(EXTEND); await r.enter();
  await r.say('Move bar 4 before bar 2.');
  assert.equal(r.requests.length, 0); assert.ok(r.texts().some((t) => REPAIR_CARD.test(t)), r.texts().join(' | '));
});

test('a place-word sentence the repair cannot mend ("Move bars 2 to 3 before bar 5.") goes to the service as it always did; a typo of a verb is still mended first, and the service is not asked', async () => {
  const r = await phraseWithHead(lines('Move bar 2 one bar right.', 'Move bar 3 one bar right.'));
  await r.say('Move bars 2 to 3 before bar 5.'); assert.equal(r.requests.length, 1);
  const q = await phraseWithHead(lines('Delete bar 2.'));
  await q.say('Delet bar 2.'); assert.equal(q.requests.length, 0, 'a typo is mended by the repair, no model call'); assert.ok(q.texts().some((t) => /Did you mean: Delete bar 2/.test(t)), q.texts().join(' | '));
});

// ---- PART B, on the real controller: the driver's words stay beside the lines the repair or the service made -------------------------------------------------------------------------------------------------------
const SAID = ' (you said: Move bar 4 before bar 2.)';
test('B: a service plan applied keeps the driver\'s words on its FIRST line (the second line has none); the dialog says the line with them; a canonical line typed directly has no marker', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say('Move bar 4 before bar 2.'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, `Move bar 4 one bar left.${SAID}`, 'Move bar 3 one bar left.']);
  await r.say('Delete bar 1.'); assert.equal(r.list()[3], 'Delete bar 1.', 'typed canonically: no marker');
});
test('B: a repaired sentence keeps the driver\'s words too', async () => {
  const r = await phraseWithHead(async () => ({ status: 200, json: { ok: false, error: 'no' } }));
  await r.say('Move bar 4 before bar 2.'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, `Move bar 4 one bar left.${SAID}`]);
});
test('B: undo (Cmd/Ctrl+Z in the empty composer) takes the line and its marker off together, and redo puts them back', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.', 'Move bar 3 one bar left.'));
  await r.say('Move bar 4 before bar 2.'); await r.enter(); assert.equal(r.list().length, 3);
  await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND], 'both lines and the marker are gone');
  await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.deepEqual(r.list(), [EXTEND, `Move bar 4 one bar left.${SAID}`, 'Move bar 3 one bar left.']);
});
test('B: the replay is the same with or without the marker (the Recipe the note writes is byte-identical to the one a clean list gives), and a hand edit that deletes the marker is fine', async () => {
  const a = await phraseWithHead(lines('Move bar 4 one bar left.')); await a.say('Move bar 4 before bar 2.'); await a.enter();
  const b = await phraseWithHead(lines('Move bar 4 one bar left.')); await b.say('Move bar 4 one bar left.');
  assert.equal(a.list()[1], `Move bar 4 one bar left.${SAID}`); assert.equal(b.list()[1], 'Move bar 4 one bar left.');
  const body = (t: string) => t.slice(t.indexOf('```'));          // from the first fence down: the Recipe, the Python and the cache
  assert.equal(body(a.store.get('phrases/phrase_001.md')!), body(b.store.get('phrases/phrase_001.md')!), 'the Recipe, the Python and the cache do not depend on the marker');
  const text = a.store.get('phrases/phrase_001.md')!; a.store.set('phrases/phrase_001.md', text.replace(SAID, '')); a.ctl.modified('phrases/phrase_001.md'); await a.ready();
  assert.deepEqual(a.list(), [EXTEND, 'Move bar 4 one bar left.'], 'the marker is gone, the line stays');
});
test('B: the marker carries no token, URL or file name (a sentence with them is cut down before it is kept)', async () => {
  const r = await phraseWithHead(lines('Move bar 4 one bar left.'));
  await r.say('Move bar 4 before bar 2 see https://example.com/x?t=1 notes/secret.md'); await r.enter();
  assert.doesNotMatch(r.list()[1] ?? '', /https?:|\.md|secret|example\.com/);
});
