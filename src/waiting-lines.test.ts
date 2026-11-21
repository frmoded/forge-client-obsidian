// 2026-11-21-1015 PART C on the REAL controller, composer and dialog (a faked service): a sentence that neither the grammar nor the service can read is kept as a WAITING line (plain text, the dialog says why, undo takes it back); later lines wait until it is
// resolved; `Translate line N.` (typed, or from the "+" menu) asks the service for that line alone, shows a plan, and on confirmation REPLACES the waiting line by the canonical lines (the first carries the driver's words); a refusal changes nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXTEND, lines, phraseWithHead, rig } from './test-support/service-lines-rig.ts';

const REFUSE = async () => ({ status: 200, json: { ok: false, error: 'I cannot do that with these bars.' } });
const WAITING = 'Waiting: blorp the second bar';

test('C: a sentence the grammar cannot read and the service refuses is KEPT as a waiting line (the driver\'s words, one plain line), with the reason in the dialog; Cmd/Ctrl+Z takes it back', async () => {
  const r = await phraseWithHead(REFUSE);
  await r.say('blorp the second bar');
  assert.deepEqual(r.list(), [EXTEND, WAITING]);
  assert.ok(r.texts().some((t) => t === 'Kept as line 2, waiting for a translation. The service refused: I cannot do that with these bars. Say "Translate line 2." to ask the service again; with the box empty, Cmd/Ctrl+Z takes it back.'), r.texts().join(' | '));
  assert.equal((r.el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement).value, 'blorp the second bar', 'the words stay in the box, as before (edit them and try again)');
  r.type(''); await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND]);
  await r.press({ key: 'z', metaKey: true, shiftKey: true }); assert.deepEqual(r.list(), [EXTEND, WAITING], 'redo puts it back');
});
test('C: kept when the service cannot be reached, and when it is not set up (the words are not lost either way)', async () => {
  const down = await phraseWithHead(async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); }); await down.say('blorp the second bar'); assert.deepEqual(down.list(), [EXTEND, WAITING]);
  const off = rig({ service: REFUSE, drawn: 4, configured: false }); await off.ready(); off.type(EXTEND); await off.enter(); await off.say('blorp the second bar'); assert.equal(off.requests.length, 0); assert.deepEqual(off.list(), [EXTEND, WAITING]);
});
test('C: NOT kept when there is something better: a repair is offered (Did you mean), the service asks a clarifying question, the sentence is readable, or the words are only noise', async () => {
  const q = await phraseWithHead(async () => ({ status: 200, json: { ok: true, question: 'Which two bars do you want to swap?' } })); await q.say('swap them'); assert.deepEqual(q.list(), [EXTEND], 'a question is pending, not a failure');
  const rep = await phraseWithHead(REFUSE); await rep.say('Delet bar 2.'); assert.deepEqual(rep.list(), [EXTEND], 'a repair is offered instead');
  const ok = await phraseWithHead(lines('Delete bar 2.')); await ok.say('remove the second bar'); assert.deepEqual(ok.list(), [EXTEND], 'a plan is shown, not a waiting line');
  const noise = await phraseWithHead(REFUSE); await noise.say('( ) [ ]'); assert.deepEqual(noise.list(), [EXTEND]);
});
test('C: the same words are not kept twice; later lines WAIT: a sentence typed after a waiting line is not applied and the dialog says the line is waiting', async () => {
  const r = await phraseWithHead(REFUSE); await r.say('blorp the second bar'); await r.say('blorp the second bar'); assert.deepEqual(r.list(), [EXTEND, WAITING]);
  await r.say('Delete bar 1.'); assert.deepEqual(r.list(), [EXTEND, WAITING], 'nothing was applied after the waiting line');
  assert.ok(r.texts().some((t) => /Line 2 is waiting for a translation/.test(t)), r.texts().join(' | '));
});
test('C: "Translate line 2." asks the service for THAT line only: the plan is shown, nothing is written; Enter replaces the waiting line by the canonical lines, the first carrying the driver\'s words; undo gives the waiting line back', async () => {
  let answer: string[] = []; const r = await phraseWithHead(async () => ({ status: 200, json: answer.length > 0 ? { ok: true, lines: answer } : { ok: false, error: 'I cannot do that with these bars.' } }));
  await r.say('blorp the second bar'); const asked = r.requests.length; answer = ['Move bar 4 one bar left.', 'Move bar 3 one bar left.'];
  await r.say('Translate line 2.');
  assert.equal(r.requests.length, asked + 1); assert.equal(r.requests[asked].sentence, 'blorp the second bar', 'the words of the waiting line, not "Translate line 2."'); assert.deepEqual(r.requests[asked].list, [EXTEND], 'the service is told the lines that come BEFORE line 2');
  assert.deepEqual(r.list(), [EXTEND, WAITING], 'a plan, never applied at once'); assert.equal(r.suggestion(), 'Move bar 4 one bar left. Move bar 3 one bar left.');
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Move bar 4 one bar left. (you said: blorp the second bar)', 'Move bar 3 one bar left.'], 'the waiting line is REPLACED');
  await r.press({ key: 'z', metaKey: true }); assert.deepEqual(r.list(), [EXTEND, WAITING], 'undo brings the waiting line back');
});
test('C: Translate on a refusal changes nothing; on a line that reads, an unknown line, and with no service it says so in plain words and changes nothing; "Translate line N." is never a list line or a service sentence', async () => {
  const r = await phraseWithHead(REFUSE); await r.say('blorp the second bar'); const before = r.requests.length;
  await r.say('Translate line 2.'); assert.deepEqual(r.list(), [EXTEND, WAITING]); assert.ok(r.texts().some((t) => /The service refused: I cannot do that with these bars\./.test(t)));
  await r.say('Translate line 1.'); assert.ok(r.texts().some((t) => /Line 1 is already a sentence I can read\./.test(t))); await r.say('Translate line 9.'); assert.ok(r.texts().some((t) => /There is no line 9\./.test(t)));
  assert.equal(r.requests.length, before + 1, 'only the first Translate asked the service');
  const off = rig({ service: REFUSE, drawn: 4, configured: false }); await off.ready(); off.type(EXTEND); await off.enter(); await off.say('blorp the second bar'); await off.say('Translate line 2.');
  assert.equal(off.requests.length, 0); assert.ok(off.texts().some((t) => /not set up/.test(t)), off.texts().join(' | ')); assert.deepEqual(off.list(), [EXTEND, WAITING]);
});
test('C: Translate also works on a line the grammar cannot read after a HAND edit (not only a waiting line)', async () => {
  const r = await phraseWithHead(lines('Move bar 3 one bar left.'));
  r.store.set('phrases/phrase_001.md', r.store.get('phrases/phrase_001.md')!.replace(EXTEND, `${EXTEND}\n2. put the third bar first`)); r.ctl.modified('phrases/phrase_001.md'); await r.ready();
  await r.say('Translate line 2.'); assert.equal(r.requests.at(-1)?.sentence, 'put the third bar first'); await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Move bar 3 one bar left. (you said: put the third bar first)']);
});
test('C: the "+" menu has a quiet item that puts "Translate line N." in the composer for the first waiting line, disabled when there is none', async () => {
  const r = await phraseWithHead(REFUSE); const items = () => [...r.el.querySelectorAll('.forge-composer-menuitem')] as any[];
  const menu = () => r.el.querySelector('.forge-composer-menu') as HTMLElement, plus = () => r.el.querySelector('.forge-composer-plus') as HTMLElement;
  const reopen = async () => { if (!menu().hidden) { plus().click(); await r.press({}); } plus().click(); await r.press({}); };          // closed first: the state is asked EVERY time the menu opens
  const item = () => items().find((b) => b.textContent === 'Translate the waiting line');
  await reopen(); assert.ok(item(), 'the item is in the menu'); assert.equal(item().getAttribute('aria-disabled'), 'true', 'no waiting line yet');
  await r.say('blorp the second bar'); await reopen();
  assert.equal(item().getAttribute('aria-disabled'), 'false'); item().click(); await r.press({});
  assert.equal((r.el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement).value, 'Translate line 2.');
});
